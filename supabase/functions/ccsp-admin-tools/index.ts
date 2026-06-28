import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

type ClearCachePayload = {
    action: 'clear_cache'
    stateCode: string
    question?: string | null
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}

const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
})

const normalizeQuestion = (question: string) =>
    question
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

const getCacheKey = (stateCode: string, normalizedQuestion: string) => `${stateCode}:${normalizedQuestion}`

const getBearerToken = (authorizationHeader: string | null) => {
    if (!authorizationHeader?.toLowerCase().startsWith('bearer ')) return null
    return authorizationHeader.slice(7).trim()
}

const assertAdminUser = async (authorizationHeader: string | null) => {
    const token = getBearerToken(authorizationHeader)
    if (!token) {
        return { error: 'Missing bearer token.', status: 401 as const }
    }

    const userResult = await adminClient.auth.getUser(token)
    if (userResult.error || !userResult.data.user?.id) {
        return { error: 'Unable to verify user token.', status: 401 as const }
    }

    const userId = userResult.data.user.id
    const profileResult = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle<{ role: string }>()

    if (profileResult.error) {
        return { error: profileResult.error.message, status: 500 as const }
    }

    if (profileResult.data?.role !== 'admin') {
        return { error: 'Admin role required.', status: 403 as const }
    }

    return { userId, status: 200 as const }
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

    const adminCheck = await assertAdminUser(request.headers.get('authorization'))
    if ('error' in adminCheck) {
        return new Response(JSON.stringify({ error: adminCheck.error }), {
            status: adminCheck.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    let payload: ClearCachePayload
    try {
        payload = (await request.json()) as ClearCachePayload
    } catch (_error) {
        return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    if (payload.action !== 'clear_cache') {
        return new Response(JSON.stringify({ error: 'Unsupported action.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    const stateCode = (payload.stateCode || '').toUpperCase().trim()
    if (!stateCode) {
        return new Response(JSON.stringify({ error: 'stateCode is required.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    const question = payload.question?.trim() ?? ''

    if (question.length > 0) {
        const cacheKey = getCacheKey(stateCode, normalizeQuestion(question))
        const deleteResult = await adminClient
            .from('compliance_assistant_cache')
            .delete({ count: 'exact' })
            .eq('cache_key', cacheKey)

        if (deleteResult.error) {
            return new Response(JSON.stringify({ error: deleteResult.error.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        return new Response(
            JSON.stringify({
                ok: true,
                mode: 'question',
                stateCode,
                deletedCount: deleteResult.count ?? 0,
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        )
    }

    const deleteResult = await adminClient
        .from('compliance_assistant_cache')
        .delete({ count: 'exact' })
        .eq('state_code', stateCode)

    if (deleteResult.error) {
        return new Response(JSON.stringify({ error: deleteResult.error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    return new Response(
        JSON.stringify({
            ok: true,
            mode: 'state',
            stateCode,
            deletedCount: deleteResult.count ?? 0,
        }),
        {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    )
})
