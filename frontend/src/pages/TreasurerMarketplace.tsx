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
    notes: string | null
    is_verified: boolean
}

type RequestRow = {
    id: string
    status: 'pending' | 'accepted' | 'declined' | 'cancelled'
    notes: string | null
    created_at: string
    treasurer: { full_name: string } | null
}

type RequestQueryRow = {
    id: string
    status: 'pending' | 'accepted' | 'declined' | 'cancelled'
    notes: string | null
    created_at: string
    treasurer: Array<{ full_name: string }>
}

function TreasurerMarketplace() {
    const { session } = useAuth()
    const userId = useMemo(() => session?.user.id ?? '', [session])

    const [role, setRole] = useState('candidate')
    const [candidateId, setCandidateId] = useState<string | null>(null)
    const [treasurers, setTreasurers] = useState<TreasurerRow[]>([])
    const [requests, setRequests] = useState<RequestRow[]>([])
    const [requestNotes, setRequestNotes] = useState<Record<string, string>>({})
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState('')
    const [statusMessage, setStatusMessage] = useState('')

    const loadData = async () => {
        if (!userId) {
            setIsLoading(false)
            return
        }

        setIsLoading(true)
        setErrorMessage('')

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .maybeSingle<{ role: string }>()

        const currentRole = profile?.role ?? 'candidate'
        setRole(currentRole)

        const { data: treasurerRows, error: treasurerError } = await supabase
            .from('treasurers')
            .select('id, full_name, email, phone, certification_id, notes, is_verified')
            .order('is_verified', { ascending: false })
            .order('full_name', { ascending: true })

        if (treasurerError) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            setIsLoading(false)
            return
        }

        setTreasurers((treasurerRows ?? []) as TreasurerRow[])

        if (currentRole === 'candidate') {
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

            const resolvedCandidateId = candidate?.id ?? null
            setCandidateId(resolvedCandidateId)

            if (resolvedCandidateId) {
                const { data: requestRows, error: requestError } = await supabase
                    .from('treasurer_requests')
                    .select('id, status, notes, created_at, treasurer:treasurers(full_name)')
                    .eq('candidate_id', resolvedCandidateId)
                    .order('created_at', { ascending: false })

                if (requestError) {
                    setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
                    setIsLoading(false)
                    return
                }

                const normalizedRows = ((requestRows ?? []) as RequestQueryRow[]).map((row) => ({
                    id: row.id,
                    status: row.status,
                    notes: row.notes,
                    created_at: row.created_at,
                    treasurer: row.treasurer?.[0] ?? null,
                }))

                setRequests(normalizedRows)
            } else {
                setRequests([])
            }
        } else {
            setCandidateId(null)
            setRequests([])
        }

        setIsLoading(false)
    }

    useEffect(() => {
        loadData()
    }, [userId])

    const createRequest = async (event: FormEvent<HTMLFormElement>, treasurerId: string) => {
        event.preventDefault()
        if (!candidateId || !userId) {
            setErrorMessage('Create candidate profile first before requesting a treasurer.')
            return
        }

        setErrorMessage('')
        setStatusMessage('')

        const { error } = await supabase.from('treasurer_requests').insert({
            candidate_id: candidateId,
            treasurer_id: treasurerId,
            requested_by_user_id: userId,
            notes: requestNotes[treasurerId] || null,
            status: 'pending',
        })

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        setRequestNotes((prev) => ({ ...prev, [treasurerId]: '' }))
        setStatusMessage('Treasurer request submitted.')
        await loadData()
    }

    const toggleVerification = async (treasurer: TreasurerRow) => {
        if (role !== 'admin' || !userId) return

        const nextVerified = !treasurer.is_verified
        const { error } = await supabase
            .from('treasurers')
            .update({
                is_verified: nextVerified,
                verified_by: nextVerified ? userId : null,
                verified_at: nextVerified ? new Date().toISOString() : null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', treasurer.id)

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        setStatusMessage(nextVerified ? 'Treasurer verified.' : 'Treasurer verification removed.')
        await loadData()
    }

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Treasurer Marketplace</h1>
            <p className="mt-3 text-slate-600">
                Candidates can request treasurers, treasurers can review requests, and admins can verify listings.
            </p>

            {isLoading ? <p className="mt-4 text-sm text-slate-600">Loading marketplace...</p> : null}
            {errorMessage ? <p className="mt-4 text-sm text-red-600">{errorMessage}</p> : null}
            {statusMessage ? <p className="mt-4 text-sm text-emerald-700">{statusMessage}</p> : null}

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {treasurers.map((treasurer) => (
                    <article key={treasurer.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-semibold text-slate-900">{treasurer.full_name}</p>
                                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    {treasurer.is_verified ? 'Verified' : 'Unverified'}
                                </p>
                            </div>
                            {role === 'admin' ? (
                                <button
                                    type="button"
                                    onClick={() => toggleVerification(treasurer)}
                                    className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                                >
                                    {treasurer.is_verified ? 'Unverify' : 'Verify'}
                                </button>
                            ) : null}
                        </div>

                        <div className="mt-2 space-y-1 text-sm text-slate-600">
                            {treasurer.email ? <p>Email: {treasurer.email}</p> : null}
                            {treasurer.phone ? <p>Phone: {treasurer.phone}</p> : null}
                            {treasurer.certification_id ? <p>Certification: {treasurer.certification_id}</p> : null}
                            {treasurer.notes ? <p>Notes: {treasurer.notes}</p> : null}
                        </div>

                        {role === 'candidate' ? (
                            <form className="mt-3 grid gap-2" onSubmit={(event) => createRequest(event, treasurer.id)}>
                                <textarea
                                    rows={2}
                                    value={requestNotes[treasurer.id] ?? ''}
                                    onChange={(event) =>
                                        setRequestNotes((prev) => ({ ...prev, [treasurer.id]: event.target.value }))
                                    }
                                    placeholder="Optional note for treasurer request"
                                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                />
                                <button
                                    type="submit"
                                    disabled={!candidateId}
                                    className="w-fit rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                                >
                                    Request Treasurer
                                </button>
                            </form>
                        ) : null}
                    </article>
                ))}
            </div>

            {role === 'candidate' ? (
                <div className="mt-8">
                    <h2 className="text-lg font-semibold text-slate-900">Your Treasurer Requests</h2>
                    <div className="mt-3 space-y-3">
                        {requests.map((request) => (
                            <article key={request.id} className="rounded-xl border border-slate-200 bg-white p-4">
                                <p className="font-semibold text-slate-900">{request.treasurer?.full_name ?? 'Treasurer'}</p>
                                <p className="mt-1 text-sm text-slate-600">Status: {request.status}</p>
                                {request.notes ? <p className="mt-1 text-sm text-slate-600">Note: {request.notes}</p> : null}
                            </article>
                        ))}
                        {!isLoading && requests.length === 0 ? (
                            <p className="text-sm text-slate-600">No requests submitted yet.</p>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </section>
    )
}

export default TreasurerMarketplace

