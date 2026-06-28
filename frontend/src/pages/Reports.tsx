import { useEffect, useMemo, useState } from 'react'
import ComplianceResultList from '../components/ComplianceResultList'
import { useAuth } from '../lib/authContext'
import { fetchCampaignHealthSnapshot } from '../lib/campaignHealthScore'
import { runCampaignComplianceCheck, type ComplianceResult } from '../lib/complianceEvaluator'
import { supabase } from '../lib/supabaseClient'
import { buildUserFacingErrorMessage } from '../lib/userFacingError'

type DonationExportRow = {
    donor_name: string
    donor_email: string | null
    amount: number
    donation_date: string
    reference_number: string | null
    created_at?: string
}

type ExpenseExportRow = {
    vendor_name: string
    vendor_email: string | null
    amount: number
    expense_date: string
    category: string | null
    reference_number: string | null
    created_at?: string
}

type ChecklistRow = { status: string }
type DeadlineRow = { due_date: string; label: string }

type ReminderBuckets = {
    dueWithin30: DeadlineRow[]
    dueWithin14: DeadlineRow[]
    dueWithin7: DeadlineRow[]
    overdue: DeadlineRow[]
}

const millisecondsPerDay = 24 * 60 * 60 * 1000

const getTodayDateOnly = () => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

const formatCsvCell = (value: string | number | null | undefined) => {
    const normalized = value === null || value === undefined ? '' : String(value)
    const escaped = normalized.replace(/"/g, '""')
    return `"${escaped}"`
}

const toCsv = (headers: string[], rows: Array<Record<string, string | number | null | undefined>>) => {
    const headerLine = headers.map((header) => formatCsvCell(header)).join(',')
    const rowLines = rows.map((row) => headers.map((header) => formatCsvCell(row[header])).join(','))
    return [headerLine, ...rowLines].join('\n')
}

const downloadCsv = (fileName: string, csvContent: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', fileName)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

const toIcsDate = (dateString: string) => dateString.replace(/-/g, '')

const getNextDate = (dateString: string) => {
    const date = new Date(`${dateString}T00:00:00`)
    const next = new Date(date.getTime() + millisecondsPerDay)
    const yyyy = next.getFullYear()
    const mm = String(next.getMonth() + 1).padStart(2, '0')
    const dd = String(next.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
}

const escapeIcsText = (value: string) =>
    value
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n')

const buildDeadlinesIcs = (deadlines: DeadlineRow[]) => {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

    const events = deadlines.map((deadline, index) => {
        const startDate = toIcsDate(deadline.due_date)
        const endDate = toIcsDate(getNextDate(deadline.due_date))
        const safeLabel = escapeIcsText(deadline.label)
        const uid = `ccsp-deadline-${index + 1}-${startDate}@felixplatform`

        return [
            'BEGIN:VEVENT',
            `UID:${uid}`,
            `DTSTAMP:${stamp}`,
            `DTSTART;VALUE=DATE:${startDate}`,
            `DTEND;VALUE=DATE:${endDate}`,
            `SUMMARY:${safeLabel}`,
            'DESCRIPTION:Campaign compliance deadline from CCSP.',
            'END:VEVENT',
        ].join('\r\n')
    })

    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//FelixPlatform//CCSP//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        ...events,
        'END:VCALENDAR',
        '',
    ].join('\r\n')
}

const downloadIcs = (fileName: string, icsContent: string) => {
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', fileName)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

const downloadText = (fileName: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', fileName)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

const buildDeadlineBuckets = (deadlines: DeadlineRow[]): ReminderBuckets => {
    const today = getTodayDateOnly()

    return deadlines.reduce<ReminderBuckets>(
        (accumulator, deadline) => {
            const due = new Date(`${deadline.due_date}T00:00:00`)
            const daysUntil = Math.floor((due.getTime() - today.getTime()) / millisecondsPerDay)

            if (daysUntil < 0) {
                accumulator.overdue.push(deadline)
            }

            if (daysUntil >= 0 && daysUntil <= 30) {
                accumulator.dueWithin30.push(deadline)
            }

            if (daysUntil >= 0 && daysUntil <= 14) {
                accumulator.dueWithin14.push(deadline)
            }

            if (daysUntil >= 0 && daysUntil <= 7) {
                accumulator.dueWithin7.push(deadline)
            }

            return accumulator
        },
        { dueWithin30: [], dueWithin14: [], dueWithin7: [], overdue: [] }
    )
}

function Reports() {
    const { session } = useAuth()
    const userId = useMemo(() => session?.user.id ?? '', [session])

    const [isLoading, setIsLoading] = useState(true)
    const [isValidating, setIsValidating] = useState(false)
    const [errorMessage, setErrorMessage] = useState('')
    const [campaignId, setCampaignId] = useState<string | null>(null)
    const [campaignHealthScore, setCampaignHealthScore] = useState(0)
    const [validationResults, setValidationResults] = useState<ComplianceResult[]>([])
    const [donationTotal, setDonationTotal] = useState(0)
    const [expenseTotal, setExpenseTotal] = useState(0)
    const [checklistCompleted, setChecklistCompleted] = useState(0)
    const [checklistTotal, setChecklistTotal] = useState(0)
    const [nextDeadline, setNextDeadline] = useState<DeadlineRow | null>(null)
    const [donationRows, setDonationRows] = useState<DonationExportRow[]>([])
    const [expenseRows, setExpenseRows] = useState<ExpenseExportRow[]>([])
    const [reminderBuckets, setReminderBuckets] = useState<ReminderBuckets>({
        dueWithin30: [],
        dueWithin14: [],
        dueWithin7: [],
        overdue: [],
    })
    const [deadlineRows, setDeadlineRows] = useState<DeadlineRow[]>([])

    useEffect(() => {
        const loadSummary = async () => {
            if (!userId) {
                setIsLoading(false)
                return
            }

            setIsLoading(true)
            setErrorMessage('')

            const { data: candidate, error: candidateError } = await supabase
                .from('candidates')
                .select('id, jurisdiction')
                .eq('user_id', userId)
                .maybeSingle<{ id: string; jurisdiction: string | null }>()

            if (candidateError) {
                setErrorMessage(buildUserFacingErrorMessage({ action: 'load', resource: 'report summary' }))
                setIsLoading(false)
                return
            }

            if (!candidate) {
                setIsLoading(false)
                return
            }

            const { data: campaign } = await supabase
                .from('campaigns')
                .select('id')
                .eq('candidate_id', candidate.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle<{ id: string }>()

            setCampaignId(campaign?.id ?? null)

            const [donationsRes, expensesRes, checklistRes, deadlinesRes, healthSnapshot] = await Promise.all([
                supabase
                    .from('donations')
                    .select('donor_name, donor_email, amount, donation_date, reference_number, created_at')
                    .eq('candidate_id', candidate.id)
                    .order('donation_date', { ascending: false }),
                supabase
                    .from('expenses')
                    .select('vendor_name, vendor_email, amount, expense_date, category, reference_number, created_at')
                    .eq('candidate_id', candidate.id)
                    .order('expense_date', { ascending: false }),
                supabase.from('checklist_items').select('status').eq('candidate_id', candidate.id),
                supabase
                    .from('deadlines')
                    .select('due_date, label')
                    .eq('candidate_id', candidate.id)
                    .order('due_date', { ascending: true }),
                fetchCampaignHealthSnapshot(userId),
            ])

            if (donationsRes.error || expensesRes.error || checklistRes.error || deadlinesRes.error) {
                setErrorMessage(buildUserFacingErrorMessage({ action: 'load', resource: 'report summary' }))
                setIsLoading(false)
                return
            }

            const donations = (donationsRes.data ?? []) as DonationExportRow[]
            const expenses = (expensesRes.data ?? []) as ExpenseExportRow[]
            const checklist = (checklistRes.data ?? []) as ChecklistRow[]
            const deadlines = (deadlinesRes.data ?? []) as DeadlineRow[]
            const reminders = buildDeadlineBuckets(deadlines)
            const todayIso = new Date().toISOString().slice(0, 10)
            const upcomingDeadline = deadlines.find((deadline) => deadline.due_date >= todayIso) ?? null

            setDonationTotal(donations.reduce((sum, item) => sum + Number(item.amount || 0), 0))
            setExpenseTotal(expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0))
            setChecklistTotal(checklist.length)
            setChecklistCompleted(checklist.filter((item) => item.status === 'completed').length)
            setNextDeadline(upcomingDeadline)
            setDonationRows(donations)
            setExpenseRows(expenses)
            setReminderBuckets(reminders)
            setDeadlineRows(deadlines)
            setCampaignHealthScore(healthSnapshot?.score ?? 0)
            setIsLoading(false)
        }

        loadSummary()
    }, [userId])

    const netBalance = donationTotal - expenseTotal

    const runPreSubmitValidation = async () => {
        if (!campaignId) return

        setIsValidating(true)
        setErrorMessage('')

        try {
            const results = await runCampaignComplianceCheck(campaignId)
            setValidationResults(results)
        } catch (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'run', resource: 'filing validation' }))
        } finally {
            setIsValidating(false)
        }
    }

    const blockingIssueCount = validationResults.filter((result) => !result.passed && result.severity === 'blocking').length
    const warningIssueCount = validationResults.filter((result) => !result.passed && result.severity === 'warning').length
    const infoIssueCount = validationResults.filter((result) => !result.passed && result.severity === 'info').length
    const advisoryIssueCount = warningIssueCount + infoIssueCount

    const exportDonationsCsv = () => {
        const headers = ['donor_name', 'donor_email', 'amount', 'donation_date', 'reference_number', 'created_at']
        const csv = toCsv(
            headers,
            donationRows.map((row) => ({
                donor_name: row.donor_name,
                donor_email: row.donor_email,
                amount: Number(row.amount || 0).toFixed(2),
                donation_date: row.donation_date,
                reference_number: row.reference_number,
                created_at: row.created_at,
            }))
        )
        downloadCsv('donations.csv', csv)
    }

    const exportExpensesCsv = () => {
        const headers = ['vendor_name', 'vendor_email', 'amount', 'expense_date', 'category', 'reference_number', 'created_at']
        const csv = toCsv(
            headers,
            expenseRows.map((row) => ({
                vendor_name: row.vendor_name,
                vendor_email: row.vendor_email,
                amount: Number(row.amount || 0).toFixed(2),
                expense_date: row.expense_date,
                category: row.category,
                reference_number: row.reference_number,
                created_at: row.created_at,
            }))
        )
        downloadCsv('expenses.csv', csv)
    }

    const exportDeadlinesIcs = () => {
        const ics = buildDeadlinesIcs(deadlineRows)
        downloadIcs('campaign-deadlines.ics', ics)
    }

    const exportDeadlinesIcsAsText = () => {
        const ics = buildDeadlinesIcs(deadlineRows)
        downloadText('campaign-deadlines.ics.txt', ics)
    }

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Campaign Reports</h1>
            <p className="mt-3 text-slate-600">Generate filing-ready finance and compliance summaries.</p>

            {isLoading ? <p className="mt-4 text-sm text-slate-600">Loading report summary...</p> : null}
            {errorMessage ? <p className="mt-4 text-sm text-red-600">{errorMessage}</p> : null}

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Total Donations</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">${donationTotal.toFixed(2)}</p>
                </article>
                <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Total Expenses</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">${expenseTotal.toFixed(2)}</p>
                </article>
                <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Net Balance</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">${netBalance.toFixed(2)}</p>
                </article>
                <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Checklist</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                        {checklistCompleted}/{checklistTotal}
                    </p>
                </article>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-700">Next Filing Deadline</p>
                <p className="mt-1 text-sm text-slate-900">
                    {nextDeadline ? `${nextDeadline.label} (${nextDeadline.due_date})` : 'No upcoming deadlines found.'}
                </p>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-700">Pre-Submit Filing Validation</p>
                <p className="mt-1 text-sm text-slate-600">
                    Run deterministic checks from the configured compliance rule engine before exporting filing materials.
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={runPreSubmitValidation}
                        disabled={isValidating || isLoading || !campaignId}
                        className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                    >
                        {isValidating ? 'Validating...' : 'Run Validation'}
                    </button>
                    <p className="text-xs text-slate-500">
                        Campaign: {campaignId ?? 'Unavailable'} | Health score: {campaignHealthScore}
                    </p>
                </div>

                {validationResults.length > 0 ? (
                    <div
                        className={`mt-3 rounded-lg border p-3 ${blockingIssueCount > 0
                            ? 'border-red-200 bg-red-50'
                            : 'border-emerald-200 bg-emerald-50'
                            }`}
                    >
                        <p
                            className={`text-sm font-semibold ${blockingIssueCount > 0
                                ? 'text-red-800'
                                : 'text-emerald-800'
                                }`}
                        >
                            Validation {blockingIssueCount > 0 ? 'failed' : advisoryIssueCount > 0 ? 'passed with advisories' : 'passed'} (blocking: {blockingIssueCount}, warnings: {warningIssueCount}, info: {infoIssueCount})
                        </p>
                        {validationResults.every((result) => result.passed) ? (
                            <p className="mt-1 text-sm text-emerald-700">No blocking issues detected.</p>
                        ) : (
                            <div className="mt-2">
                                <ComplianceResultList results={validationResults} />
                            </div>
                        )}
                    </div>
                ) : null}
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-700">Reporting Export</p>
                <p className="mt-1 text-sm text-slate-600">
                    Export finance CSV files and deadline calendar events. Google Calendar direct integration can be added later.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={exportDonationsCsv}
                        disabled={donationRows.length === 0 || blockingIssueCount > 0}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                    >
                        Export Donations CSV
                    </button>
                    <button
                        type="button"
                        onClick={exportExpensesCsv}
                        disabled={expenseRows.length === 0 || blockingIssueCount > 0}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                    >
                        Export Expenses CSV
                    </button>
                    <button
                        type="button"
                        onClick={exportDeadlinesIcs}
                        disabled={deadlineRows.length === 0 || blockingIssueCount > 0}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                    >
                        Export Deadlines ICS
                    </button>
                    <button
                        type="button"
                        onClick={exportDeadlinesIcsAsText}
                        disabled={deadlineRows.length === 0 || blockingIssueCount > 0}
                        className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-600 disabled:opacity-60"
                    >
                        Export Deadlines ICS (TXT)
                    </button>
                </div>
                {blockingIssueCount > 0 ? (
                    <p className="mt-2 text-xs text-red-700">
                        Export is blocked until blocking compliance issues are resolved.
                    </p>
                ) : null}
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-700">Reminder System</p>
                <p className="mt-1 text-sm text-slate-600">Deadline alerts are grouped by urgency tiers.</p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <article className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-amber-800">Due within 30 days</p>
                        <p className="mt-1 text-lg font-semibold text-amber-900">{reminderBuckets.dueWithin30.length}</p>
                    </article>
                    <article className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-orange-800">Due within 14 days</p>
                        <p className="mt-1 text-lg font-semibold text-orange-900">{reminderBuckets.dueWithin14.length}</p>
                    </article>
                    <article className="rounded-lg border border-red-200 bg-red-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-red-800">Due within 7 days</p>
                        <p className="mt-1 text-lg font-semibold text-red-900">{reminderBuckets.dueWithin7.length}</p>
                    </article>
                    <article className="rounded-lg border border-rose-300 bg-rose-100 p-3">
                        <p className="text-xs uppercase tracking-wide text-rose-800">Overdue</p>
                        <p className="mt-1 text-lg font-semibold text-rose-900">{reminderBuckets.overdue.length}</p>
                    </article>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 p-3">
                        <p className="text-sm font-semibold text-slate-800">Within 7 Days</p>
                        {reminderBuckets.dueWithin7.length === 0 ? (
                            <p className="mt-1 text-sm text-slate-600">No deadlines in this window.</p>
                        ) : (
                            <ul className="mt-2 space-y-1 text-sm text-slate-700">
                                {reminderBuckets.dueWithin7.map((deadline) => (
                                    <li key={`${deadline.label}-${deadline.due_date}`}>{deadline.label} ({deadline.due_date})</li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="rounded-lg border border-slate-200 p-3">
                        <p className="text-sm font-semibold text-slate-800">Overdue</p>
                        {reminderBuckets.overdue.length === 0 ? (
                            <p className="mt-1 text-sm text-slate-600">No overdue deadlines.</p>
                        ) : (
                            <ul className="mt-2 space-y-1 text-sm text-slate-700">
                                {reminderBuckets.overdue.map((deadline) => (
                                    <li key={`${deadline.label}-${deadline.due_date}`}>{deadline.label} ({deadline.due_date})</li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                <p className="mt-4 text-xs text-slate-500">
                    Later: email reminders via Supabase Edge Functions, Resend, and scheduled cron jobs.
                </p>
            </div>
        </section>
    )
}

export default Reports
