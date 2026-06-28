import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

type Citation = {
    label: string
    url: string
}

type ChatHistoryItem = {
    role: 'user' | 'assistant'
    content: string
}

type RequestBody = {
    question: string
    stateCode: string
    stateName: string
    citations: Citation[]
    ruleSummary?: string[]
    history?: ChatHistoryItem[]
    enforceMarylandBlock?: boolean
}

type CacheRow = {
    cache_key: string
    state_code: string
    normalized_question: string
    answer: string
    citations: Citation[] | null
    source: string
    expires_at: string
    hit_count: number
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CACHE_TTL_HOURS = Number(Deno.env.get('CCSP_CACHE_TTL_HOURS') ?? '48')
const DAILY_AI_LIMIT = Number(Deno.env.get('CCSP_DAILY_AI_LIMIT') ?? '10')
const HISTORY_LIMIT = Number(Deno.env.get('CCSP_HISTORY_LIMIT') ?? '4')
const MAX_RESPONSE_TOKENS = Number(Deno.env.get('CCSP_MAX_RESPONSE_TOKENS') ?? '260')

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const adminClient =
    supabaseUrl && supabaseServiceRoleKey
        ? createClient(supabaseUrl, supabaseServiceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        })
        : null

const dedupeCitations = (citations: Citation[]) => {
    const seen = new Set<string>()
    return citations.filter((citation) => {
        const key = `${citation.label}-${citation.url}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

const normalizeQuestion = (question: string) =>
    question
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

const getCacheKey = (stateCode: string, normalizedQuestion: string) => `${stateCode}:${normalizedQuestion}`

const getRequesterIdFromAuthHeader = (authHeader: string | null): string | null => {
    if (!authHeader?.toLowerCase().startsWith('bearer ')) return null

    const token = authHeader.slice(7).trim()
    const parts = token.split('.')
    if (parts.length !== 3) return null

    try {
        const payload = JSON.parse(atob(parts[1])) as { sub?: string; role?: string }
        return payload.role === 'authenticated' && payload.sub ? payload.sub : null
    } catch (_error) {
        return null
    }
}

const isElectionCalendarIntent = (normalizedQuestion: string) => {
    const mentionsElection = /\b(election|elections|primary|general|special)\b/.test(normalizedQuestion)
    const asksWhen = /\b(when|upcoming|next|schedule|calendar|dates|date)\b/.test(
        normalizedQuestion
    )

    const matchupOrCandidateFocus =
        /\b(matchup|matchups|candidate|candidates|running|run|race|versus|vs|governor|senate|mayor|house)\b/.test(
            normalizedQuestion
        )

    return mentionsElection && asksWhen && !matchupOrCandidateFocus
}

const buildElectionCalendarTemplateAnswer = (stateName: string) =>
    [
        `To find upcoming elections in ${stateName}, check the official state election calendar for the most current dates.`,
        '',
        'Quick steps:',
        `1. Open your ${stateName} state election authority website.`,
        '2. Find Election Dates, Calendar, or Upcoming Elections.',
        '3. Confirm whether the listed date is primary, general, or special election for your jurisdiction.',
        '',
        'This assistant does not guarantee live election-date feeds in real time, so always verify directly with official state sources.',
        '',
        'This is not legal advice.',
    ].join('\n')

const buildQuotaLimitAnswer = (stateName: string) =>
    [
        'You have reached the daily AI-assistant question limit for now.',
        '',
        'To keep this service free, AI responses are rate-limited per account each day.',
        `Please use the official ${stateName} resources below and try again tomorrow.`,
        '',
        'This is not legal advice.',
    ].join('\n')

const fetchCachedAnswer = async (stateCode: string, normalizedQuestion: string) => {
    if (!adminClient) return null

    const cacheKey = getCacheKey(stateCode, normalizedQuestion)
    const nowIso = new Date().toISOString()

    const { data, error } = await adminClient
        .from('compliance_assistant_cache')
        .select('cache_key, state_code, normalized_question, answer, citations, source, expires_at, hit_count')
        .eq('cache_key', cacheKey)
        .gt('expires_at', nowIso)
        .maybeSingle<CacheRow>()

    if (error || !data) return null

    await adminClient
        .from('compliance_assistant_cache')
        .update({ updated_at: nowIso, hit_count: (data.hit_count ?? 0) + 1 })
        .eq('cache_key', cacheKey)

    return {
        answer: data.answer,
        citations: Array.isArray(data.citations) ? data.citations : [],
    }
}

const upsertCachedAnswer = async (
    stateCode: string,
    normalizedQuestion: string,
    answer: string,
    citations: Citation[]
) => {
    if (!adminClient) return

    const now = new Date()
    const expiresAt = new Date(now.getTime() + CACHE_TTL_HOURS * 60 * 60 * 1000)
    const cacheKey = getCacheKey(stateCode, normalizedQuestion)

    await adminClient.from('compliance_assistant_cache').upsert(
        {
            cache_key: cacheKey,
            state_code: stateCode,
            normalized_question: normalizedQuestion,
            answer,
            citations,
            source: 'ai',
            expires_at: expiresAt.toISOString(),
            updated_at: now.toISOString(),
        },
        { onConflict: 'cache_key' }
    )
}

const checkAndIncrementDailyQuota = async (userId: string) => {
    if (!adminClient) return { allowed: true }

    const usageDate = new Date().toISOString().slice(0, 10)

    const { data, error } = await adminClient
        .from('compliance_assistant_usage_daily')
        .select('requests_count')
        .eq('user_id', userId)
        .eq('usage_date', usageDate)
        .maybeSingle<{ requests_count: number }>()

    if (error) {
        return { allowed: true }
    }

    const currentCount = data?.requests_count ?? 0
    if (currentCount >= DAILY_AI_LIMIT) {
        return { allowed: false }
    }

    await adminClient.from('compliance_assistant_usage_daily').upsert(
        {
            user_id: userId,
            usage_date: usageDate,
            requests_count: currentCount + 1,
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,usage_date' }
    )

    return { allowed: true }
}

const withMarylandRequiredCitations = (stateCode: string, citations: Citation[]) => {
    if (stateCode !== 'MD') return dedupeCitations(citations)

    const marylandRequired: Citation[] = [
        {
            label: 'Maryland State Board of Elections - Campaign Finance (home)',
            url: 'https://elections.maryland.gov/campaign_finance/index.html',
        },
        {
            label: 'Maryland Campaign Finance - Forms and Manuals',
            url: 'https://elections.maryland.gov/campaign_finance/forms_and_manuals.html',
        },
    ]

    return dedupeCitations([...marylandRequired, ...citations])
}

serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    const openAIKey = Deno.env.get('OPENAI_API_KEY')
    if (!openAIKey) {
        return new Response(
            JSON.stringify({ error: 'OPENAI_API_KEY is not configured for ccsp-compliance-chat.' }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        )
    }

    let payload: RequestBody
    try {
        payload = (await request.json()) as RequestBody
    } catch (_error) {
        return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    const question = payload.question?.trim()
    const normalizedQuestion = normalizeQuestion(question ?? '')
    const stateCode = (payload.stateCode || '').toUpperCase()
    const stateName = payload.stateName?.trim() || stateCode
    const citations = Array.isArray(payload.citations) ? payload.citations : []
    const ruleSummary = Array.isArray(payload.ruleSummary) ? payload.ruleSummary.slice(0, 24) : []
    const history = Array.isArray(payload.history) ? payload.history.slice(-HISTORY_LIMIT) : []
    const requesterId = getRequesterIdFromAuthHeader(request.headers.get('authorization'))

    if (!question) {
        return new Response(JSON.stringify({ error: 'Question is required.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    const enforcedCitations = withMarylandRequiredCitations(stateCode, citations)

    if (isElectionCalendarIntent(normalizedQuestion)) {
        return new Response(
            JSON.stringify({
                answer: buildElectionCalendarTemplateAnswer(stateName),
                citations: enforcedCitations,
                stateCode,
                stateName,
                source: 'template',
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        )
    }

    const cached = await fetchCachedAnswer(stateCode, normalizedQuestion)
    if (cached) {
        return new Response(
            JSON.stringify({
                answer: cached.answer,
                citations: cached.citations.length > 0 ? cached.citations : enforcedCitations,
                stateCode,
                stateName,
                source: 'cache',
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        )
    }

    if (requesterId) {
        const quota = await checkAndIncrementDailyQuota(requesterId)
        if (!quota.allowed) {
            return new Response(
                JSON.stringify({
                    answer: buildQuotaLimitAnswer(stateName),
                    citations: enforcedCitations,
                    stateCode,
                    stateName,
                    source: 'quota',
                }),
                {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                }
            )
        }
    }

    const systemPrompt = [
        'You are the CCSP AI Compliance Assistant for U.S. campaign users.',
        `The current user context state is: ${stateName} (${stateCode}).`,
        'Answer in plain English with practical compliance steps.',
        'For matchup/candidate questions, do not be vague: provide what is known, what is not confirmed yet, and the exact next place to verify.',
        'Do not invent candidate names, filing status, or dates. If not confirmed in provided sources, explicitly say not yet confirmed.',
        'Do NOT claim to provide legal advice. Include a warning that this is not legal advice.',
        'If confidence is low, tell user to verify with official state election guidance and organization support.',
        'Return concise but useful action-oriented answers in 4-7 bullet points when possible.',
    ].join(' ')

    const resourceList = enforcedCitations
        .map((citation, index) => `${index + 1}. ${citation.label} - ${citation.url}`)
        .join('\n')

    const ruleSummaryText =
        ruleSummary.length > 0
            ? ruleSummary.map((line, index) => `${index + 1}. ${line}`).join('\n')
            : 'No structured rule summary was provided for this state.'

    const messages = [
        { role: 'system', content: systemPrompt },
        {
            role: 'system',
            content: `Official resources to use in this response:\n${resourceList}`,
        },
        {
            role: 'system',
            content: `Configured compliance workflow summary:\n${ruleSummaryText}`,
        },
        ...history.map((item) => ({ role: item.role, content: item.content })),
        { role: 'user', content: question },
    ]

    try {
        const completionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${openAIKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4.1-mini',
                temperature: 0.2,
                max_tokens: MAX_RESPONSE_TOKENS,
                messages,
            }),
        })

        if (!completionResponse.ok) {
            const text = await completionResponse.text()
            return new Response(
                JSON.stringify({ error: `OpenAI request failed: ${completionResponse.status}`, detail: text }),
                {
                    status: 502,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                }
            )
        }

        const completion = await completionResponse.json()
        const answer = completion?.choices?.[0]?.message?.content?.trim()

        if (!answer) {
            return new Response(JSON.stringify({ error: 'No answer returned by model.' }), {
                status: 502,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        await upsertCachedAnswer(stateCode, normalizedQuestion, answer, enforcedCitations)

        return new Response(
            JSON.stringify({
                answer,
                citations: enforcedCitations,
                stateCode,
                stateName,
                source: 'ai',
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        )
    } catch (error) {
        return new Response(
            JSON.stringify({
                error: 'Unexpected error while generating assistant response.',
                detail: error instanceof Error ? error.message : String(error),
            }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        )
    }
})
