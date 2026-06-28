import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/authContext'
import { supabase } from '../lib/supabaseClient'
import { buildUserFacingErrorMessage } from '../lib/userFacingError'
import EmptyStateCard from '../components/EmptyStateCard'

type ChecklistItem = {
    id: string
    title: string
    description: string | null
    due_date: string | null
    status: 'pending' | 'completed'
}

function ComplianceChecklist() {
    const { session } = useAuth()
    const userId = useMemo(() => session?.user.id ?? '', [session])

    const [candidateId, setCandidateId] = useState<string | null>(null)
    const [items, setItems] = useState<ChecklistItem[]>([])
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [dueDate, setDueDate] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [errorMessage, setErrorMessage] = useState('')
    const [statusMessage, setStatusMessage] = useState('')
    const [fieldErrors, setFieldErrors] = useState<{ title?: string }>({})

    const loadChecklist = async () => {
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
            setErrorMessage(buildUserFacingErrorMessage({ action: 'load', resource: 'checklist data' }))
            setIsLoading(false)
            return
        }

        if (!candidate) {
            setCandidateId(null)
            setItems([])
            setIsLoading(false)
            return
        }

        setCandidateId(candidate.id)

        const { data, error } = await supabase
            .from('checklist_items')
            .select('id, title, description, due_date, status')
            .eq('candidate_id', candidate.id)
            .order('due_date', { ascending: true, nullsFirst: false })

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'load', resource: 'checklist items' }))
            setIsLoading(false)
            return
        }

        setItems((data ?? []) as ChecklistItem[])
        setIsLoading(false)
    }

    useEffect(() => {
        loadChecklist()
    }, [userId])

    const handleCreateItem = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        const nextFieldErrors: { title?: string } = {}
        if (!title.trim()) {
            nextFieldErrors.title = 'Checklist title is required.'
        }
        setFieldErrors(nextFieldErrors)

        if (Object.keys(nextFieldErrors).length > 0) {
            setErrorMessage('Please fix the highlighted form fields and try again.')
            return
        }

        if (!candidateId) {
            setErrorMessage('Create your candidate profile first.')
            return
        }

        setIsSaving(true)
        setErrorMessage('')
        setStatusMessage('')

        const { error } = await supabase.from('checklist_items').insert({
            candidate_id: candidateId,
            title,
            description: description || null,
            due_date: dueDate || null,
            status: 'pending',
        })

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'save', resource: 'checklist item' }))
            setIsSaving(false)
            return
        }

        setTitle('')
        setDescription('')
        setDueDate('')
        setStatusMessage('Checklist item added.')
        setIsSaving(false)
        await loadChecklist()
    }

    const toggleStatus = async (item: ChecklistItem) => {
        const nextStatus = item.status === 'completed' ? 'pending' : 'completed'
        const { error } = await supabase
            .from('checklist_items')
            .update({
                status: nextStatus,
                completed_at: nextStatus === 'completed' ? new Date().toISOString() : null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', item.id)

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'update', resource: 'checklist item' }))
            return
        }

        await loadChecklist()
    }

    const completedCount = items.filter((item) => item.status === 'completed').length

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Compliance Checklist</h1>
            <p className="mt-3 text-slate-600">Track filing tasks and requirement completion.</p>

            {isLoading ? <p className="mt-4 text-sm text-slate-600">Loading checklist...</p> : null}
            {errorMessage ? <p className="mt-4 text-sm text-red-700" role="alert">{errorMessage}</p> : null}
            {statusMessage ? <p className="mt-4 text-sm text-emerald-700">{statusMessage}</p> : null}

            {!candidateId ? (
                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                    Create Candidate Profile first to generate your checklist.
                </div>
            ) : (
                <>
                    <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-semibold text-slate-700">Progress</p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">
                            {completedCount}/{items.length} completed
                        </p>
                    </div>

                    <form className="mt-6 grid max-w-2xl gap-3" onSubmit={handleCreateItem}>
                        <input
                            id="checklist-title"
                            className="rounded-lg border border-slate-300 px-3 py-2"
                            placeholder="Checklist title"
                            value={title}
                            onChange={(e) => {
                                setTitle(e.target.value)
                                setFieldErrors((prev) => ({ ...prev, title: undefined }))
                            }}
                            aria-invalid={Boolean(fieldErrors.title)}
                            aria-describedby={fieldErrors.title ? 'checklist-title-error' : undefined}
                            required
                        />
                        {fieldErrors.title ? (
                            <p id="checklist-title-error" className="text-sm text-red-700" role="alert">
                                {fieldErrors.title}
                            </p>
                        ) : null}
                        <textarea
                            className="rounded-lg border border-slate-300 px-3 py-2"
                            placeholder="Description (optional)"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                        />
                        <input
                            className="rounded-lg border border-slate-300 px-3 py-2"
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                        />
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="w-fit rounded-lg bg-[#0f4c81] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0b3c65] disabled:opacity-60"
                        >
                            {isSaving ? 'Saving...' : 'Add Checklist Item'}
                        </button>
                    </form>

                    <div className="mt-6 space-y-3">
                        {items.map((item) => (
                            <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="font-semibold text-slate-900">{item.title}</p>
                                    <button
                                        type="button"
                                        onClick={() => toggleStatus(item)}
                                        className={`rounded-md px-3 py-1 text-xs font-semibold ${item.status === 'completed'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-amber-100 text-amber-800'
                                            }`}
                                    >
                                        {item.status === 'completed' ? 'Completed' : 'Pending'}
                                    </button>
                                </div>
                                {item.description ? <p className="mt-1 text-sm text-slate-600">{item.description}</p> : null}
                                {item.due_date ? <p className="mt-1 text-sm text-slate-600">Due: {item.due_date}</p> : null}
                            </article>
                        ))}

                        {!isLoading && items.length === 0 ? (
                            <EmptyStateCard
                                title="No checklist items yet."
                                message="Start your filing checklist now so you can track progress toward submission readiness."
                                actionLabel="Add Checklist Item"
                                onAction={() => {
                                    const checklistTitleInput = document.getElementById('checklist-title') as HTMLInputElement | null
                                    checklistTitleInput?.focus()
                                }}
                            />
                        ) : null}
                    </div>
                </>
            )}
        </section>
    )
}

export default ComplianceChecklist
