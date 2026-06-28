import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/authContext'
import { supabase } from '../lib/supabaseClient'

import { buildUserFacingErrorMessage } from '../lib/userFacingError'
type TreasurerRow = {
    id: string
    full_name: string
    email: string | null
    phone: string | null
    certification_id: string | null
}

type AssignmentRow = {
    id: string
    treasurer_id: string
    is_active: boolean
}

function Treasurer() {
    const { session } = useAuth()
    const userId = useMemo(() => session?.user.id ?? '', [session])

    const [candidateId, setCandidateId] = useState<string | null>(null)
    const [treasurers, setTreasurers] = useState<TreasurerRow[]>([])
    const [activeAssignment, setActiveAssignment] = useState<AssignmentRow | null>(null)
    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [phone, setPhone] = useState('')
    const [certificationId, setCertificationId] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [errorMessage, setErrorMessage] = useState('')
    const [statusMessage, setStatusMessage] = useState('')

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
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            setIsLoading(false)
            return
        }

        if (!candidate) {
            setCandidateId(null)
            setIsLoading(false)
            return
        }

        setCandidateId(candidate.id)

        const [treasurersRes, assignmentsRes] = await Promise.all([
            supabase
                .from('treasurers')
                .select('id, full_name, email, phone, certification_id')
                .order('full_name', { ascending: true }),
            supabase
                .from('treasurer_assignments')
                .select('id, treasurer_id, is_active')
                .eq('candidate_id', candidate.id)
                .eq('is_active', true)
                .limit(1),
        ])

        if (treasurersRes.error || assignmentsRes.error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'load', resource: 'treasurer data' }))
            setIsLoading(false)
            return
        }

        setTreasurers((treasurersRes.data ?? []) as TreasurerRow[])
        setActiveAssignment(((assignmentsRes.data ?? [])[0] as AssignmentRow) || null)
        setIsLoading(false)
    }

    useEffect(() => {
        loadData()
    }, [userId])

    const handleCreateTreasurer = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setIsSaving(true)
        setErrorMessage('')
        setStatusMessage('')

        const { error } = await supabase.from('treasurers').insert({
            full_name: fullName,
            email: email || null,
            phone: phone || null,
            certification_id: certificationId || null,
        })

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            setIsSaving(false)
            return
        }

        setFullName('')
        setEmail('')
        setPhone('')
        setCertificationId('')
        setStatusMessage('Treasurer created.')
        setIsSaving(false)
        await loadData()
    }

    const assignTreasurer = async (treasurerId: string) => {
        if (!candidateId) {
            setErrorMessage('Create your candidate profile first.')
            return
        }

        setErrorMessage('')
        setStatusMessage('')

        if (activeAssignment) {
            const { error: updateError } = await supabase
                .from('treasurer_assignments')
                .update({ is_active: false, unassigned_at: new Date().toISOString() })
                .eq('id', activeAssignment.id)

            if (updateError) {
                setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
                return
            }
        }

        const { error: insertError } = await supabase.from('treasurer_assignments').insert({
            candidate_id: candidateId,
            treasurer_id: treasurerId,
            is_active: true,
        })

        if (insertError) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        setStatusMessage('Treasurer assigned to campaign.')
        await loadData()
    }

    const activeTreasurer = activeAssignment
        ? treasurers.find((treasurer) => treasurer.id === activeAssignment.treasurer_id)
        : null

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Treasurer Management</h1>
            <p className="mt-3 text-slate-600">Find, assign, and maintain active treasurer records.</p>

            {isLoading ? <p className="mt-4 text-sm text-slate-600">Loading treasurer records...</p> : null}
            {errorMessage ? <p className="mt-4 text-sm text-red-600">{errorMessage}</p> : null}
            {statusMessage ? <p className="mt-4 text-sm text-emerald-700">{statusMessage}</p> : null}

            {!candidateId ? (
                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                    Create Candidate Profile first before assigning a treasurer.
                </div>
            ) : (
                <>
                    <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-semibold text-slate-700">Active Treasurer</p>
                        <p className="mt-1 text-base font-semibold text-slate-900">
                            {activeTreasurer ? activeTreasurer.full_name : 'No active treasurer assigned'}
                        </p>
                    </div>

                    <form className="mt-6 grid max-w-2xl gap-3" onSubmit={handleCreateTreasurer}>
                        <input
                            className="rounded-lg border border-slate-300 px-3 py-2"
                            placeholder="Full name"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            required
                        />
                        <input
                            className="rounded-lg border border-slate-300 px-3 py-2"
                            placeholder="Email (optional)"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                        <input
                            className="rounded-lg border border-slate-300 px-3 py-2"
                            placeholder="Phone (optional)"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                        />
                        <input
                            className="rounded-lg border border-slate-300 px-3 py-2"
                            placeholder="Certification ID (optional)"
                            value={certificationId}
                            onChange={(e) => setCertificationId(e.target.value)}
                        />
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="w-fit rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                        >
                            {isSaving ? 'Saving...' : 'Create Treasurer'}
                        </button>
                    </form>

                    <div className="mt-6 space-y-3">
                        {treasurers.map((treasurer) => (
                            <article key={treasurer.id} className="rounded-xl border border-slate-200 bg-white p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="font-semibold text-slate-900">{treasurer.full_name}</p>
                                        {treasurer.email ? <p className="text-sm text-slate-600">{treasurer.email}</p> : null}
                                        {treasurer.phone ? <p className="text-sm text-slate-600">{treasurer.phone}</p> : null}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => assignTreasurer(treasurer.id)}
                                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                                    >
                                        {activeAssignment?.treasurer_id === treasurer.id ? 'Assigned' : 'Assign'}
                                    </button>
                                </div>
                            </article>
                        ))}

                        {!isLoading && treasurers.length === 0 ? (
                            <p className="text-sm text-slate-600">No treasurers available yet.</p>
                        ) : null}
                    </div>
                </>
            )}
        </section>
    )
}

export default Treasurer

