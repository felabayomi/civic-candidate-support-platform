import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/authContext'
import { supabase } from '../lib/supabaseClient'

import { buildUserFacingErrorMessage } from '../lib/userFacingError'
type TreasurerProfileRow = {
    id: string
    full_name: string
    email: string | null
    phone: string | null
    certification_id: string | null
    notes: string | null
    is_verified: boolean
}

function TreasurerProfile() {
    const { session } = useAuth()
    const userId = useMemo(() => session?.user.id ?? '', [session])

    const [role, setRole] = useState('candidate')
    const [profileId, setProfileId] = useState<string | null>(null)
    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [phone, setPhone] = useState('')
    const [certificationId, setCertificationId] = useState('')
    const [notes, setNotes] = useState('')
    const [isVerified, setIsVerified] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [errorMessage, setErrorMessage] = useState('')
    const [statusMessage, setStatusMessage] = useState('')

    useEffect(() => {
        const loadProfile = async () => {
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

            const currentRole = roleProfile?.role ?? 'candidate'
            setRole(currentRole)

            const { data: treasurerProfile, error } = await supabase
                .from('treasurers')
                .select('id, full_name, email, phone, certification_id, notes, is_verified')
                .eq('user_id', userId)
                .maybeSingle<TreasurerProfileRow>()

            if (error) {
                setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
                setIsLoading(false)
                return
            }

            if (treasurerProfile) {
                setProfileId(treasurerProfile.id)
                setFullName(treasurerProfile.full_name)
                setEmail(treasurerProfile.email ?? '')
                setPhone(treasurerProfile.phone ?? '')
                setCertificationId(treasurerProfile.certification_id ?? '')
                setNotes(treasurerProfile.notes ?? '')
                setIsVerified(treasurerProfile.is_verified)
            }

            setIsLoading(false)
        }

        loadProfile()
    }, [userId])

    const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!userId) return

        setIsSaving(true)
        setStatusMessage('')
        setErrorMessage('')

        const payload = {
            user_id: userId,
            full_name: fullName,
            email: email || null,
            phone: phone || null,
            certification_id: certificationId || null,
            notes: notes || null,
            updated_at: new Date().toISOString(),
        }

        const query = profileId
            ? supabase.from('treasurers').update(payload).eq('id', profileId)
            : supabase.from('treasurers').insert(payload).select('id').single()

        const { data, error } = await query

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            setIsSaving(false)
            return
        }

        if (!profileId && data && 'id' in data) {
            setProfileId(data.id as string)
        }

        setStatusMessage('Treasurer profile saved.')
        setIsSaving(false)
    }

    if (isLoading) {
        return (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <p className="text-slate-600">Loading treasurer profile...</p>
            </section>
        )
    }

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Treasurer Profile</h1>
            <p className="mt-3 text-slate-600">Treasurers can maintain their marketplace profile and credentials.</p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-700">Current Role: <span className="font-semibold">{role}</span></p>
                <p className="mt-1 text-sm text-slate-700">
                    Verification: <span className="font-semibold">{isVerified ? 'Verified' : 'Pending verification'}</span>
                </p>
            </div>

            <form className="mt-6 grid max-w-2xl gap-3" onSubmit={saveProfile}>
                <input
                    className="rounded-lg border border-slate-300 px-3 py-2"
                    placeholder="Full name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                />
                <input
                    className="rounded-lg border border-slate-300 px-3 py-2"
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                />
                <input
                    className="rounded-lg border border-slate-300 px-3 py-2"
                    placeholder="Phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                />
                <input
                    className="rounded-lg border border-slate-300 px-3 py-2"
                    placeholder="Certification ID"
                    value={certificationId}
                    onChange={(event) => setCertificationId(event.target.value)}
                />
                <textarea
                    rows={3}
                    className="rounded-lg border border-slate-300 px-3 py-2"
                    placeholder="Professional notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                />

                {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
                {statusMessage ? <p className="text-sm text-emerald-700">{statusMessage}</p> : null}

                <button
                    type="submit"
                    disabled={isSaving}
                    className="w-fit rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                >
                    {isSaving ? 'Saving...' : 'Save Treasurer Profile'}
                </button>
            </form>
        </section>
    )
}

export default TreasurerProfile

