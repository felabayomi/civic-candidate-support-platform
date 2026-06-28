import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import CampaignHealthScoreCard from '../components/CampaignHealthScoreCard'
import DeadlineCard from '../components/DeadlineCard'
import {
    buildCampaignHealthFromLaunchDraft,
    fetchCampaignHealthSnapshot,
    type CampaignHealthScoreResult,
} from '../lib/campaignHealthScore'
import { supabase } from '../lib/supabaseClient'
import { buildUserFacingErrorMessage } from '../lib/userFacingError'
import { useAuth } from '../lib/authContext'

type CandidateSummary = {
    id: string
    campaign_name: string
    office_title: string
    jurisdiction: string
}

type DeadlineRow = {
    id: string
    label: string
    due_date: string
}

type ChecklistRow = {
    status: string
}

type AmountRow = {
    amount: number
}

type AssignedTreasurerRow = {
    id: string
    is_active: boolean
    treasurer: {
        full_name: string
        email: string | null
        is_verified: boolean
    } | null
}

function Dashboard() {
    const { session, role } = useAuth()
    const userId = useMemo(() => session?.user.id ?? '', [session])

    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState('')
    const [candidate, setCandidate] = useState<CandidateSummary | null>(null)
    const [deadlines, setDeadlines] = useState<DeadlineRow[]>([])
    const [totalChecklist, setTotalChecklist] = useState(0)
    const [completedChecklist, setCompletedChecklist] = useState(0)
    const [donationTotal, setDonationTotal] = useState(0)
    const [expenseTotal, setExpenseTotal] = useState(0)
    const [assignedTreasurer, setAssignedTreasurer] = useState<AssignedTreasurerRow | null>(null)

    const fallbackHealth = useMemo(
        () =>
            buildCampaignHealthFromLaunchDraft({
                userId,
                candidateProfileComplete: !!candidate,
            }),
        [userId, candidate]
    )
    const [campaignHealth, setCampaignHealth] = useState<CampaignHealthScoreResult>(fallbackHealth)

    useEffect(() => {
        setCampaignHealth(fallbackHealth)
    }, [fallbackHealth])

    useEffect(() => {
        if (!userId) return

        let isActive = true
        const loadPersistedHealth = async () => {
            const persisted = await fetchCampaignHealthSnapshot(userId)
            if (isActive && persisted) {
                setCampaignHealth(persisted)
            }
        }

        void loadPersistedHealth()

        return () => {
            isActive = false
        }
    }, [userId])

    useEffect(() => {
        const loadDashboard = async () => {
            if (!userId) {
                setIsLoading(false)
                return
            }

            setIsLoading(true)
            setErrorMessage('')

            const { data: candidateData, error: candidateError } = await supabase
                .from('candidates')
                .select('id, campaign_name, office_title, jurisdiction')
                .eq('user_id', userId)
                .maybeSingle<CandidateSummary>()

            if (candidateError) {
                setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
                setIsLoading(false)
                return
            }

            if (!candidateData) {
                setCandidate(null)
                setDeadlines([])
                setTotalChecklist(0)
                setCompletedChecklist(0)
                setDonationTotal(0)
                setExpenseTotal(0)
                setAssignedTreasurer(null)
                setIsLoading(false)
                return
            }

            setCandidate(candidateData)

            const [deadlinesRes, checklistRes, donationsRes, expensesRes, assignmentRes] = await Promise.all([
                supabase
                    .from('deadlines')
                    .select('id, label, due_date')
                    .eq('candidate_id', candidateData.id)
                    .order('due_date', { ascending: true })
                    .limit(4),
                supabase
                    .from('checklist_items')
                    .select('status')
                    .eq('candidate_id', candidateData.id),
                supabase
                    .from('donations')
                    .select('amount')
                    .eq('candidate_id', candidateData.id),
                supabase
                    .from('expenses')
                    .select('amount')
                    .eq('candidate_id', candidateData.id),
                supabase
                    .from('treasurer_assignments')
                    .select('id, is_active, treasurer:treasurers(full_name, email, is_verified)')
                    .eq('candidate_id', candidateData.id)
                    .eq('is_active', true)
                    .limit(1)
                    .maybeSingle<AssignedTreasurerRow>(),
            ])

            if (deadlinesRes.error || checklistRes.error || donationsRes.error || expensesRes.error || assignmentRes.error) {
                setErrorMessage(buildUserFacingErrorMessage({ action: 'load', resource: 'dashboard data' }))
                setIsLoading(false)
                return
            }

            const checklistRows = (checklistRes.data ?? []) as ChecklistRow[]
            const donationRows = (donationsRes.data ?? []) as AmountRow[]
            const expenseRows = (expensesRes.data ?? []) as AmountRow[]

            setDeadlines((deadlinesRes.data ?? []) as DeadlineRow[])
            setTotalChecklist(checklistRows.length)
            setCompletedChecklist(checklistRows.filter((item) => item.status === 'completed').length)
            setDonationTotal(donationRows.reduce((sum, row) => sum + Number(row.amount || 0), 0))
            setExpenseTotal(expenseRows.reduce((sum, row) => sum + Number(row.amount || 0), 0))
            setAssignedTreasurer((assignmentRes.data ?? null) as AssignedTreasurerRow | null)
            setIsLoading(false)
        }

        loadDashboard()
    }, [userId])

    if (isLoading) {
        return (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <p className="text-slate-600">Loading dashboard...</p>
            </section>
        )
    }

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Campaign Dashboard</h1>
            <p className="mt-3 text-slate-600">See deadlines, checklist progress, and finance snapshot.</p>

            {errorMessage ? <p className="mt-4 text-sm text-red-600">{errorMessage}</p> : null}

            {!candidate ? (
                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                    Complete Candidate Profile first to unlock dashboard data.
                </div>
            ) : (
                <>
                    {role !== 'admin' ? (
                        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-sm font-semibold text-slate-900">Free Candidate Access</p>
                            <p className="mt-1 text-sm text-slate-700">
                                Your campaign workspace is free to use. If you hit account or compliance workflow blockers,
                                contact your organization support team for admin-console assistance.
                            </p>
                        </div>
                    ) : null}

                    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Campaign</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{candidate.campaign_name}</p>
                        </article>
                        <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Checklist Progress</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{completedChecklist}/{totalChecklist} completed</p>
                        </article>
                        <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Donations</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">${donationTotal.toFixed(2)}</p>
                        </article>
                        <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Expenses</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">${expenseTotal.toFixed(2)}</p>
                        </article>
                    </div>

                    <CampaignHealthScoreCard health={campaignHealth} className="mt-4" />

                    <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-sky-700">Need Help?</p>
                                <p className="mt-1 text-sm text-sky-900">
                                    Open quick guides, FAQs, and support contacts.
                                </p>
                            </div>
                            <Link
                                to="/help"
                                className="shrink-0 rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600"
                            >
                                Help Center
                            </Link>
                        </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Assigned Treasurer</p>
                        {assignedTreasurer?.treasurer ? (
                            <>
                                <p className="mt-1 text-sm font-semibold text-slate-900">{assignedTreasurer.treasurer.full_name}</p>
                                <p className="mt-1 text-sm text-slate-600">
                                    {assignedTreasurer.treasurer.email ?? 'No email provided'}
                                </p>
                                <p className="mt-1 text-xs font-semibold text-slate-500">
                                    {assignedTreasurer.treasurer.is_verified ? 'Verified Treasurer' : 'Unverified Treasurer'}
                                </p>
                            </>
                        ) : (
                            <p className="mt-1 text-sm text-slate-600">No treasurer assigned yet.</p>
                        )}
                    </div>

                    <h2 className="mt-8 text-lg font-semibold text-slate-900">Upcoming Deadlines</h2>
                    {deadlines.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-600">No deadlines added yet.</p>
                    ) : (
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                            {deadlines.map((deadline) => (
                                <DeadlineCard key={deadline.id} label={deadline.label} dueDate={deadline.due_date} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </section>
    )
}

export default Dashboard

