import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/authContext'
import { loadActiveRuleContextByState } from '../lib/complianceEvaluator'
import { supabase } from '../lib/supabaseClient'

type Citation = {
    label: string
    url: string
}

type Message = {
    id: string
    conversation_id?: string
    role: 'user' | 'assistant'
    content: string
    citations?: Citation[]
    created_at?: string
}

type ConversationRow = {
    id: string
    user_id: string
    state_code: string
    state_name: string
    created_at: string
    updated_at: string
}

type ResourceRow = {
    id: string
    state_code: string
    state_name: string
    title: string
    url: string
    is_active: boolean
}

type StateOption = {
    code: string
    name: string
}

const stateOptions: StateOption[] = [
    { code: 'AL', name: 'Alabama' },
    { code: 'AK', name: 'Alaska' },
    { code: 'AZ', name: 'Arizona' },
    { code: 'AR', name: 'Arkansas' },
    { code: 'CA', name: 'California' },
    { code: 'CO', name: 'Colorado' },
    { code: 'CT', name: 'Connecticut' },
    { code: 'DE', name: 'Delaware' },
    { code: 'FL', name: 'Florida' },
    { code: 'GA', name: 'Georgia' },
    { code: 'HI', name: 'Hawaii' },
    { code: 'ID', name: 'Idaho' },
    { code: 'IL', name: 'Illinois' },
    { code: 'IN', name: 'Indiana' },
    { code: 'IA', name: 'Iowa' },
    { code: 'KS', name: 'Kansas' },
    { code: 'KY', name: 'Kentucky' },
    { code: 'LA', name: 'Louisiana' },
    { code: 'ME', name: 'Maine' },
    { code: 'MD', name: 'Maryland' },
    { code: 'MA', name: 'Massachusetts' },
    { code: 'MI', name: 'Michigan' },
    { code: 'MN', name: 'Minnesota' },
    { code: 'MS', name: 'Mississippi' },
    { code: 'MO', name: 'Missouri' },
    { code: 'MT', name: 'Montana' },
    { code: 'NE', name: 'Nebraska' },
    { code: 'NV', name: 'Nevada' },
    { code: 'NH', name: 'New Hampshire' },
    { code: 'NJ', name: 'New Jersey' },
    { code: 'NM', name: 'New Mexico' },
    { code: 'NY', name: 'New York' },
    { code: 'NC', name: 'North Carolina' },
    { code: 'ND', name: 'North Dakota' },
    { code: 'OH', name: 'Ohio' },
    { code: 'OK', name: 'Oklahoma' },
    { code: 'OR', name: 'Oregon' },
    { code: 'PA', name: 'Pennsylvania' },
    { code: 'RI', name: 'Rhode Island' },
    { code: 'SC', name: 'South Carolina' },
    { code: 'SD', name: 'South Dakota' },
    { code: 'TN', name: 'Tennessee' },
    { code: 'TX', name: 'Texas' },
    { code: 'UT', name: 'Utah' },
    { code: 'VT', name: 'Vermont' },
    { code: 'VA', name: 'Virginia' },
    { code: 'WA', name: 'Washington' },
    { code: 'WV', name: 'West Virginia' },
    { code: 'WI', name: 'Wisconsin' },
    { code: 'WY', name: 'Wyoming' },
    { code: 'DC', name: 'District of Columbia' },
]

const federalDefaultCitations: Citation[] = [
    {
        label: 'U.S. Election Assistance Commission - Election office directory',
        url: 'https://www.eac.gov/voters/register-and-vote-in-your-state',
    },
    {
        label: 'Federal Election Commission - Candidate and committee guidance',
        url: 'https://www.fec.gov/help-candidates-and-committees/',
    },
]

const mdMandatoryCitations: Citation[] = [
    {
        label: 'Maryland State Board of Elections - Campaign Finance (home)',
        url: 'https://elections.maryland.gov/campaign_finance/index.html',
    },
    {
        label: 'Maryland Campaign Finance - Forms and Manuals',
        url: 'https://elections.maryland.gov/campaign_finance/forms_and_manuals.html',
    },
]

const dedupeCitations = (citations: Citation[]) => {
    const seen = new Set<string>()
    return citations.filter((citation) => {
        const key = `${citation.label}-${citation.url}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

const getStateName = (stateCode: string) => stateOptions.find((state) => state.code === stateCode)?.name ?? stateCode

const getFallbackStateCitations = (stateCode: string, stateName: string): Citation[] => {
    const stateDirectoryCitation: Citation = {
        label: `${stateName} election office lookup (official directory)`,
        url: 'https://www.eac.gov/voters/register-and-vote-in-your-state',
    }

    if (stateCode === 'MD') {
        return dedupeCitations([...mdMandatoryCitations, stateDirectoryCitation, ...federalDefaultCitations])
    }

    return dedupeCitations([stateDirectoryCitation, ...federalDefaultCitations])
}

const buildFallbackAssistantReply = (question: string, stateName: string) => {
    return [
        `I could not reach the live compliance model right now, so this is a fallback response for ${stateName}.`,
        '',
        `Question received: "${question}"`,
        '',
        'Practical next steps:',
        '1. Verify the rule in your official state election and campaign finance guidance.',
        '2. Compare your transaction/report details against that rule (dates, amount, source, and documentation).',
        '3. If filing risk remains, escalate to your organization support/admin team before submission.',
    ].join('\n')
}

function AIComplianceAssistant() {
    const { session } = useAuth()
    const userId = useMemo(() => session?.user.id ?? '', [session])

    const [selectedState, setSelectedState] = useState<string>('MD')
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [isResponding, setIsResponding] = useState(false)
    const [isLoadingHistory, setIsLoadingHistory] = useState(false)
    const [assistantError, setAssistantError] = useState('')
    const [ruleSummaryLines, setRuleSummaryLines] = useState<string[]>([])
    const [resourceRows, setResourceRows] = useState<ResourceRow[]>([])
    const [conversations, setConversations] = useState<ConversationRow[]>([])
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
    const endOfMessagesRef = useRef<HTMLDivElement | null>(null)

    const selectedStateName = useMemo(() => getStateName(selectedState), [selectedState])
    const canSend = useMemo(() => input.trim().length > 0 && !isResponding, [input, isResponding])
    const stateCitations = useMemo(() => {
        const custom = resourceRows
            .filter((row) => row.state_code === selectedState && row.is_active)
            .map((row) => ({ label: row.title, url: row.url }))

        return custom.length > 0
            ? dedupeCitations([...custom, ...getFallbackStateCitations(selectedState, selectedStateName)])
            : getFallbackStateCitations(selectedState, selectedStateName)
    }, [resourceRows, selectedState, selectedStateName])

    const defaultAssistantMessage: Message = useMemo(
        () => ({
            id: 'seed-assistant',
            role: 'assistant',
            content:
                `Ask campaign compliance questions in plain English for ${selectedStateName}. I will provide guidance with citation links and highlight when you should escalate to organization support.`,
            citations: stateCitations,
        }),
        [selectedStateName, stateCitations]
    )

    const scrollToBottom = () => {
        endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    const loadResources = async () => {
        const { data, error } = await supabase
            .from('state_compliance_resources')
            .select('id, state_code, state_name, title, url, is_active')
            .eq('is_active', true)
            .order('state_code', { ascending: true })

        if (!error) {
            setResourceRows((data ?? []) as ResourceRow[])
        }
    }

    const loadConversationMessages = async (conversationId: string) => {
        setIsLoadingHistory(true)

        const { data, error } = await supabase
            .from('compliance_assistant_messages')
            .select('id, conversation_id, role, content, citations, created_at')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true })

        if (error) {
            setMessages([defaultAssistantMessage])
            setIsLoadingHistory(false)
            return
        }

        const rows = (data ?? []) as Array<{
            id: string
            conversation_id: string
            role: 'user' | 'assistant'
            content: string
            citations: Citation[] | null
            created_at: string
        }>

        if (rows.length === 0) {
            setMessages([defaultAssistantMessage])
            setIsLoadingHistory(false)
            return
        }

        setMessages(
            rows.map((row) => ({
                id: row.id,
                conversation_id: row.conversation_id,
                role: row.role,
                content: row.content,
                citations: row.citations ?? undefined,
                created_at: row.created_at,
            }))
        )
        setIsLoadingHistory(false)
    }

    const createConversation = async (stateCode: string) => {
        if (!userId) return null

        const stateName = getStateName(stateCode)
        const { data, error } = await supabase
            .from('compliance_assistant_conversations')
            .insert({
                user_id: userId,
                state_code: stateCode,
                state_name: stateName,
                updated_at: new Date().toISOString(),
            })
            .select('id, user_id, state_code, state_name, created_at, updated_at')
            .single<ConversationRow>()

        if (error || !data) {
            return null
        }

        setConversations((prev) => [data, ...prev])
        setActiveConversationId(data.id)
        setSelectedState(data.state_code)
        return data.id
    }

    const loadConversations = async () => {
        if (!userId) return

        const { data, error } = await supabase
            .from('compliance_assistant_conversations')
            .select('id, user_id, state_code, state_name, created_at, updated_at')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .limit(20)

        if (error) {
            setMessages([defaultAssistantMessage])
            return
        }

        const rows = (data ?? []) as ConversationRow[]
        setConversations(rows)

        if (rows.length === 0) {
            const newConversationId = await createConversation(selectedState)
            if (!newConversationId) {
                setMessages([defaultAssistantMessage])
            }
            return
        }

        const first = rows[0]
        setActiveConversationId(first.id)
        setSelectedState(first.state_code)
        await loadConversationMessages(first.id)
    }

    useEffect(() => {
        loadResources()
    }, [])

    useEffect(() => {
        setMessages([defaultAssistantMessage])
    }, [defaultAssistantMessage])

    useEffect(() => {
        loadConversations()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId])

    useEffect(() => {
        const loadRuleSummary = async () => {
            const rules = await loadActiveRuleContextByState(selectedState)
            setRuleSummaryLines(
                rules.map((rule) => `${rule.rule_code}: ${rule.message} (severity=${rule.severity})`)
            )
        }

        void loadRuleSummary()
    }, [selectedState])

    useEffect(() => {
        setTimeout(scrollToBottom, 0)
    }, [messages, isResponding])

    const sendQuestion = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const question = input.trim()
        if (!question || isResponding) return

        setAssistantError('')

        let conversationId = activeConversationId
        if (!conversationId) {
            conversationId = await createConversation(selectedState)
        }

        if (!conversationId) {
            setAssistantError('Unable to create conversation at the moment. Please try again.')
            return
        }

        const userMessage: Message = {
            id: `user-${Date.now()}`,
            conversation_id: conversationId,
            role: 'user',
            content: question,
        }

        setMessages((prev) => [...prev, userMessage])
        setInput('')
        setIsResponding(true)

        await supabase
            .from('compliance_assistant_messages')
            .insert({
                conversation_id: conversationId,
                user_id: userId,
                role: 'user',
                content: question,
                citations: null,
            })

        await supabase
            .from('compliance_assistant_conversations')
            .update({ state_code: selectedState, state_name: selectedStateName, updated_at: new Date().toISOString() })
            .eq('id', conversationId)

        const recentHistory = [...messages, userMessage]
            .slice(-12)
            .map((item) => ({ role: item.role, content: item.content }))

        const invokeResult = await supabase.functions.invoke('ccsp-compliance-chat', {
            body: {
                question,
                stateCode: selectedState,
                stateName: selectedStateName,
                citations: stateCitations,
                ruleSummary: ruleSummaryLines,
                history: recentHistory,
                enforceMarylandBlock: true,
            },
        })

        const edgeError = invokeResult.error
        const edgeData = invokeResult.data as { answer?: string; citations?: Citation[] } | null

        const assistantContent =
            !edgeError && edgeData?.answer
                ? edgeData.answer
                : buildFallbackAssistantReply(question, selectedStateName)

        const assistantCitations =
            !edgeError && edgeData?.citations && edgeData.citations.length > 0
                ? dedupeCitations(edgeData.citations)
                : stateCitations

        if (edgeError) {
            setAssistantError('Live model unavailable. Showing fallback guidance with official citations.')
        }

        const assistantMessage: Message = {
            id: `assistant-${Date.now()}`,
            conversation_id: conversationId,
            role: 'assistant',
            content: assistantContent,
            citations: assistantCitations,
        }

        setMessages((prev) => [...prev, assistantMessage])
        await supabase
            .from('compliance_assistant_messages')
            .insert({
                conversation_id: conversationId,
                user_id: userId,
                role: 'assistant',
                content: assistantMessage.content,
                citations: assistantMessage.citations ?? null,
            })

        setIsResponding(false)
        await loadConversations()
    }

    const startNewConversation = async () => {
        const newConversationId = await createConversation(selectedState)
        if (!newConversationId) {
            setAssistantError('Unable to start a new conversation right now.')
            return
        }

        setMessages([defaultAssistantMessage])
    }

    const switchConversation = async (conversation: ConversationRow) => {
        setActiveConversationId(conversation.id)
        setSelectedState(conversation.state_code)
        await loadConversationMessages(conversation.id)
    }

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-900">AI Compliance Assistant</h1>
                    <p className="mt-2 text-slate-600">
                        Plain-English campaign compliance Q&A with state-specific official citations.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <label htmlFor="state-select" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        State
                    </label>
                    <select
                        id="state-select"
                        value={selectedState}
                        onChange={(event) => setSelectedState(event.target.value)}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    >
                        {stateOptions.map((state) => (
                            <option key={state.code} value={state.code}>
                                {state.name}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={startNewConversation}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                    >
                        New Chat
                    </button>
                </div>
            </div>

            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">⚖️ Compliance Guidance Notice</p>
                <p className="mt-1 text-sm text-amber-800">
                    The AI Compliance Assistant provides educational information and organizational guidance.
                </p>
                <p className="mt-1 text-sm text-amber-800">
                    Responses are not legal advice and should not replace official election authority guidance or
                    consultation with qualified legal professionals.
                </p>
                <p className="mt-1 text-sm text-amber-800">
                    Always verify important compliance decisions before filing official campaign documents.
                </p>
                <Link
                    to="/legal-disclaimer"
                    className="mt-3 inline-flex rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                    Learn More
                </Link>
                {ruleSummaryLines.length > 0 ? (
                    <p className="mt-2 text-xs text-amber-900">
                        Rule engine loaded: {ruleSummaryLines.length} active compliance requirements for {selectedStateName}.
                    </p>
                ) : null}
            </div>

            {assistantError ? (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {assistantError}
                </p>
            ) : null}

            <div className="mt-6 grid gap-4 lg:grid-cols-[240px_1fr]">
                <aside className="h-[460px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Saved Sessions</p>
                    <div className="mt-2 space-y-2">
                        {conversations.map((conversation) => (
                            <button
                                key={conversation.id}
                                type="button"
                                onClick={() => switchConversation(conversation)}
                                className={`w-full rounded-lg border px-2 py-2 text-left text-xs ${conversation.id === activeConversationId
                                    ? 'border-sky-300 bg-sky-50 text-sky-900'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                                    }`}
                            >
                                <p className="font-semibold">{conversation.state_name}</p>
                                <p className="mt-1 text-[11px] text-slate-500">
                                    {new Date(conversation.updated_at).toLocaleString()}
                                </p>
                            </button>
                        ))}
                    </div>
                </aside>

                <div className="h-[460px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mx-auto max-w-3xl space-y-4">
                        {isLoadingHistory ? <p className="text-sm text-slate-600">Loading conversation...</p> : null}
                        {messages.map((message) => (
                            <article
                                key={message.id}
                                className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${message.role === 'user'
                                    ? 'ml-auto max-w-[85%] bg-slate-900 text-white'
                                    : 'mr-auto max-w-[95%] border border-slate-200 bg-white text-slate-800'
                                    }`}
                            >
                                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>

                                {message.role === 'assistant' && message.citations && message.citations.length > 0 ? (
                                    <div className="mt-3 border-t border-slate-200 pt-2">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                            Official sources for {selectedStateName}
                                        </p>
                                        <ul className="mt-2 space-y-1">
                                            {message.citations.map((citation) => (
                                                <li key={citation.url}>
                                                    <a
                                                        href={citation.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
                                                    >
                                                        {citation.label}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : null}
                            </article>
                        ))}

                        {isResponding ? (
                            <article className="mr-auto max-w-[50%] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                                Thinking...
                            </article>
                        ) : null}

                        <div ref={endOfMessagesRef} />
                    </div>
                </div>
            </div>

            <form className="mx-auto mt-4 max-w-3xl" onSubmit={sendQuestion}>
                <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2">
                    <textarea
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        placeholder="Ask a compliance question (example: What should I do if I find a filing error after submission?)"
                        rows={2}
                        className="w-full resize-none rounded-lg border-0 px-2 py-2 text-sm text-slate-800 focus:outline-none"
                    />
                    <button
                        type="submit"
                        disabled={!canSend}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Send
                    </button>
                </div>
                <p className="mt-2 text-center text-xs text-slate-500">
                    Not legal advice. For high-risk or unclear issues, contact your organization support team.
                </p>
            </form>
        </section>
    )
}

export default AIComplianceAssistant
