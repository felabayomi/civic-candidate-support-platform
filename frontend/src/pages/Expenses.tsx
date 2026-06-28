import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/authContext'
import { supabase } from '../lib/supabaseClient'
import { buildUserFacingErrorMessage } from '../lib/userFacingError'
import ComplianceWarning from '../components/ComplianceWarning'
import EmptyStateCard from '../components/EmptyStateCard'

type ExpenseRow = {
    id: string
    vendor_name: string
    vendor_email: string | null
    amount: number
    expense_date: string
    category: string | null
    reference_number: string | null
}

function Expenses() {
    const largeContributionThreshold = 1000

    const { session } = useAuth()
    const userId = useMemo(() => session?.user.id ?? '', [session])

    const [candidateId, setCandidateId] = useState<string | null>(null)
    const [vendorName, setVendorName] = useState('')
    const [vendorEmail, setVendorEmail] = useState('')
    const [amount, setAmount] = useState('')
    const [expenseDate, setExpenseDate] = useState('')
    const [category, setCategory] = useState('')
    const [referenceNumber, setReferenceNumber] = useState('')
    const [expenses, setExpenses] = useState<ExpenseRow[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [errorMessage, setErrorMessage] = useState('')
    const [statusMessage, setStatusMessage] = useState('')
    const [complianceWarnings, setComplianceWarnings] = useState<string[]>([])
    const [hasBlockingWarnings, setHasBlockingWarnings] = useState(false)

    const loadData = async () => {
        if (!userId) {
            setIsLoading(false)
            return
        }

        setIsLoading(true)
        setErrorMessage('')

        const { data: candidate, error: candidateError } = await supabase
            .from('candidates')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle<{ id: string }>()

        if (candidateError) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'load', resource: 'expense data' }))
            setIsLoading(false)
            return
        }

        if (!candidate) {
            setCandidateId(null)
            setExpenses([])
            setIsLoading(false)
            return
        }

        setCandidateId(candidate.id)

        const { data: expenseRows, error: expensesError } = await supabase
            .from('expenses')
            .select('id, vendor_name, vendor_email, amount, expense_date, category, reference_number')
            .eq('candidate_id', candidate.id)
            .order('expense_date', { ascending: false })

        if (expensesError) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'load', resource: 'expenses' }))
            setIsLoading(false)
            return
        }

        setExpenses((expenseRows ?? []) as ExpenseRow[])
        setIsLoading(false)
    }

    useEffect(() => {
        loadData()
    }, [userId])

    const collectComplianceWarnings = () => {
        const warnings: string[] = []
        const blockingWarnings: string[] = []
        const parsedAmount = Number(amount)
        const categoryValue = category.trim().toLowerCase()
        const reference = referenceNumber.trim().toLowerCase()

        if (!vendorName.trim()) {
            blockingWarnings.push('missing donor name')
        }

        // Address field is not modeled yet, so contact info acts as interim signal.
        if (!vendorEmail.trim()) {
            warnings.push('missing donor address')
        }

        if (!amount.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
            blockingWarnings.push('missing amount')
        }

        if (!expenseDate) {
            blockingWarnings.push('missing date')
        }

        if (categoryValue.includes('cash') || reference.includes('cash')) {
            warnings.push('cash contribution')
        }

        if (!Number.isNaN(parsedAmount) && parsedAmount >= largeContributionThreshold) {
            warnings.push('large contribution')
        }

        if (!referenceNumber.trim()) {
            warnings.push('missing receipt')
        }

        return {
            warnings: [...blockingWarnings, ...warnings],
            hasBlockingWarnings: blockingWarnings.length > 0,
        }
    }

    const saveExpense = async () => {
        if (!candidateId || !userId) {
            setErrorMessage('Create your candidate profile first.')
            return
        }

        setIsSaving(true)
        setErrorMessage('')
        setStatusMessage('')

        const { error } = await supabase.from('expenses').insert({
            candidate_id: candidateId,
            vendor_name: vendorName,
            vendor_email: vendorEmail || null,
            amount: Number(amount),
            expense_date: expenseDate,
            category: category || null,
            reference_number: referenceNumber || null,
            created_by: userId,
        })

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'save', resource: 'expense' }))
            setIsSaving(false)
            return
        }

        setVendorName('')
        setVendorEmail('')
        setAmount('')
        setExpenseDate('')
        setCategory('')
        setReferenceNumber('')
        setStatusMessage('Expense saved.')
        setComplianceWarnings([])
        setHasBlockingWarnings(false)
        setIsSaving(false)
        await loadData()
    }

    const handleSaveExpense = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setErrorMessage('')
        setStatusMessage('')

        const warningResult = collectComplianceWarnings()
        if (warningResult.warnings.length > 0) {
            setComplianceWarnings(warningResult.warnings)
            setHasBlockingWarnings(warningResult.hasBlockingWarnings)
            return
        }

        await saveExpense()
    }

    const totalExpenses = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0)

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Expense Tracking</h1>
            <p className="mt-3 text-slate-600">Log and classify campaign spending.</p>

            {isLoading ? <p className="mt-4 text-sm text-slate-600">Loading expenses...</p> : null}
            {errorMessage ? <p className="mt-4 text-sm text-red-600">{errorMessage}</p> : null}
            {statusMessage ? <p className="mt-4 text-sm text-emerald-700">{statusMessage}</p> : null}

            {!candidateId ? (
                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                    Create Candidate Profile first, then add expenses.
                </div>
            ) : (
                <>
                    <form className="mt-6 grid max-w-2xl gap-3" onSubmit={handleSaveExpense}>
                        <input
                            id="expense-vendor-name"
                            className="rounded-lg border border-slate-300 px-3 py-2"
                            placeholder="Vendor name"
                            value={vendorName}
                            onChange={(e) => setVendorName(e.target.value)}
                        />
                        <input
                            className="rounded-lg border border-slate-300 px-3 py-2"
                            placeholder="Vendor email (optional)"
                            type="email"
                            value={vendorEmail}
                            onChange={(e) => setVendorEmail(e.target.value)}
                        />
                        <input
                            className="rounded-lg border border-slate-300 px-3 py-2"
                            placeholder="Amount"
                            type="number"
                            min="0"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                        />
                        <input
                            className="rounded-lg border border-slate-300 px-3 py-2"
                            type="date"
                            value={expenseDate}
                            onChange={(e) => setExpenseDate(e.target.value)}
                        />
                        <input
                            className="rounded-lg border border-slate-300 px-3 py-2"
                            placeholder="Category (optional)"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                        />
                        <input
                            className="rounded-lg border border-slate-300 px-3 py-2"
                            placeholder="Reference number (optional)"
                            value={referenceNumber}
                            onChange={(e) => setReferenceNumber(e.target.value)}
                        />
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="w-fit rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                        >
                            {isSaving ? 'Saving...' : 'Save Expense'}
                        </button>
                    </form>

                    <div className="mt-4">
                        <ComplianceWarning
                            title="Expense Compliance Warning"
                            warnings={complianceWarnings}
                            hasBlockingWarnings={hasBlockingWarnings}
                            onProceed={hasBlockingWarnings ? undefined : saveExpense}
                            onCancel={() => {
                                setComplianceWarnings([])
                                setHasBlockingWarnings(false)
                            }}
                        />
                    </div>

                    <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-semibold text-slate-700">Total Expenses</p>
                        <p className="mt-1 text-xl font-semibold text-slate-900">${totalExpenses.toFixed(2)}</p>
                    </div>

                    <div className="mt-6 space-y-3">
                        {expenses.map((item) => (
                            <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="font-semibold text-slate-900">{item.vendor_name}</p>
                                    <p className="text-sm font-semibold text-slate-900">${Number(item.amount).toFixed(2)}</p>
                                </div>
                                <p className="mt-1 text-sm text-slate-600">Date: {item.expense_date}</p>
                                {item.category ? <p className="text-sm text-slate-600">Category: {item.category}</p> : null}
                                {item.vendor_email ? <p className="text-sm text-slate-600">Email: {item.vendor_email}</p> : null}
                                {item.reference_number ? <p className="text-sm text-slate-600">Ref: {item.reference_number}</p> : null}
                            </article>
                        ))}
                        {!isLoading && expenses.length === 0 ? (
                            <EmptyStateCard
                                title="No expenses have been recorded yet."
                                message="Start logging campaign spending so your balance and reports stay accurate."
                                actionLabel="Add Expense"
                                onAction={() => {
                                    const expenseInput = document.getElementById('expense-vendor-name') as HTMLInputElement | null
                                    expenseInput?.focus()
                                }}
                            />
                        ) : null}
                    </div>
                </>
            )}
        </section>
    )
}

export default Expenses
