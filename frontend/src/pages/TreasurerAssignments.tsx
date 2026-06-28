import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/authContext'
import { supabase } from '../lib/supabaseClient'

import { buildUserFacingErrorMessage } from '../lib/userFacingError'
type RequestRow = {
    id: string
    candidate_id: string
    status: 'pending' | 'accepted' | 'declined' | 'cancelled'
    notes: string | null
    created_at: string
    candidate: {
        campaign_name: string
        office_title: string
        jurisdiction: string
    } | null
}

type RequestQueryRow = {
    id: string
    candidate_id: string
    status: 'pending' | 'accepted' | 'declined' | 'cancelled'
    notes: string | null
    created_at: string
    candidate: Array<{
        campaign_name: string
        office_title: string
        jurisdiction: string
    }>
}

function TreasurerAssignments() {
    const { session } = useAuth()
    const userId = useMemo(() => session?.user.id ?? '', [session])

    const [role, setRole] = useState('candidate')
    const [treasurerId, setTreasurerId] = useState<string | null>(null)
    const [pendingRequests, setPendingRequests] = useState<RequestRow[]>([])
    const [historyRequests, setHistoryRequests] = useState<RequestRow[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState('')
    const [statusMessage, setStatusMessage] = useState('')

    const loadRequests = async () => {
        if (!userId) {
            setIsLoading(false)
            return
        }

        setIsLoading(true)
        setErrorMessage('')

        const { data: roleProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .maybeSingle<{ role: string }>()
        setRole(roleProfile?.role ?? 'candidate')

        const { data: treasurer, error: treasurerError } = await supabase
            .from('treasurers')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle<{ id: string }>()

        if (treasurerError) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            setIsLoading(false)
            return
        }

        if (!treasurer) {
            setTreasurerId(null)
            setPendingRequests([])
            setHistoryRequests([])
            setIsLoading(false)
            return
        }

        setTreasurerId(treasurer.id)

        const { data, error } = await supabase
            .from('treasurer_requests')
            .select('id, candidate_id, status, notes, created_at, candidate:candidates(campaign_name, office_title, jurisdiction)')
            .eq('treasurer_id', treasurer.id)
            .order('created_at', { ascending: false })

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            setIsLoading(false)
            return
        }

        const rows = ((data ?? []) as RequestQueryRow[]).map((row) => ({
            id: row.id,
            candidate_id: row.candidate_id,
            status: row.status,
            notes: row.notes,
            created_at: row.created_at,
            candidate: row.candidate?.[0] ?? null,
        }))
        setPendingRequests(rows.filter((row) => row.status === 'pending'))
        setHistoryRequests(rows.filter((row) => row.status !== 'pending'))
        setIsLoading(false)
    }

    useEffect(() => {
        loadRequests()
    }, [userId])

    const respondToRequest = async (request: RequestRow, decision: 'accepted' | 'declined') => {
        if (!treasurerId) return

        setErrorMessage('')
        setStatusMessage('')

        const { error: requestUpdateError } = await supabase
            .from('treasurer_requests')
            .update({
                status: decision,
                responded_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', request.id)

        if (requestUpdateError) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        if (decision === 'accepted') {
            const { data: existingActiveAssignments } = await supabase
                .from('treasurer_assignments')
                .select('id')
                .eq('candidate_id', request.candidate_id)
                .eq('is_active', true)

            const activeIds = (existingActiveAssignments ?? []).map((item) => item.id)
            if (activeIds.length > 0) {
                const { error: deactivateError } = await supabase
                    .from('treasurer_assignments')
                    .update({ is_active: false, status: 'inactive', unassigned_at: new Date().toISOString() })
                    .in('id', activeIds)

                if (deactivateError) {
                    setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
                    return
                }
            }

            const { error: insertAssignmentError } = await supabase.from('treasurer_assignments').insert({
                candidate_id: request.candidate_id,
                treasurer_id: treasurerId,
                request_id: request.id,
                status: 'active',
                is_active: true,
            })

            if (insertAssignmentError) {
                setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
                return
            }
        }

        setStatusMessage(`Request ${decision}.`)
        await loadRequests()
    }

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Treasurer Assignments</h1>
            <p className="mt-3 text-slate-600">Treasurers can accept or decline candidate assignment requests.</p>

            {isLoading ? <p className="mt-4 text-sm text-slate-600">Loading assignment requests...</p> : null}
            {errorMessage ? <p className="mt-4 text-sm text-red-600">{errorMessage}</p> : null}
            {statusMessage ? <p className="mt-4 text-sm text-emerald-700">{statusMessage}</p> : null}

            {!treasurerId ? (
                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                    Create your Treasurer Profile first to receive assignment requests.
                </div>
            ) : (
                <>
                    <div className="mt-6 space-y-3">
                        <h2 className="text-lg font-semibold text-slate-900">Pending Requests</h2>
                        {pendingRequests.map((request) => (
                            <article key={request.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <p className="font-semibold text-slate-900">{request.candidate?.campaign_name ?? 'Campaign'}</p>
                                <p className="mt-1 text-sm text-slate-600">
                                    {request.candidate?.office_title} - {request.candidate?.jurisdiction}
                                </p>
                                {request.notes ? <p className="mt-1 text-sm text-slate-600">Note: {request.notes}</p> : null}
                                {role === 'treasurer' ? (
                                    <div className="mt-3 flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => respondToRequest(request, 'accepted')}
                                            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                                        >
                                            Accept
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => respondToRequest(request, 'declined')}
                                            className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                                        >
                                            Decline
                                        </button>
                                    </div>
                                ) : (
                                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Admin review mode
                                    </p>
                                )}
                            </article>
                        ))}
                        {!isLoading && pendingRequests.length === 0 ? (
                            <p className="text-sm text-slate-600">No pending requests.</p>
                        ) : null}
                    </div>

                    <div className="mt-8 space-y-3">
                        <h2 className="text-lg font-semibold text-slate-900">Request History</h2>
                        {historyRequests.map((request) => (
                            <article key={request.id} className="rounded-xl border border-slate-200 bg-white p-4">
                                <p className="font-semibold text-slate-900">{request.candidate?.campaign_name ?? 'Campaign'}</p>
                                <p className="mt-1 text-sm text-slate-600">Status: {request.status}</p>
                            </article>
                        ))}
                        {!isLoading && historyRequests.length === 0 ? (
                            <p className="text-sm text-slate-600">No request history yet.</p>
                        ) : null}
                    </div>
                </>
            )}
        </section>
    )
}

export default TreasurerAssignments

