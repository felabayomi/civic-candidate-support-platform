import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/authContext'
import { supabase } from '../lib/supabaseClient'

import { buildUserFacingErrorMessage } from '../lib/userFacingError'
type VolunteerProfileRow = {
    id: string
    full_name: string | null
    email: string | null
    phone: string | null
    county: string | null
    skills: string[]
    availability: string | null
    bio: string | null
}

const normalizeSkills = (value: string) =>
    value
        .split(',')
        .map((skill) => skill.trim())
        .filter((skill) => skill.length > 0)

function VolunteerProfile() {
    const { session } = useAuth()
    const userId = useMemo(() => session?.user.id ?? '', [session])

    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [statusMessage, setStatusMessage] = useState('')
    const [errorMessage, setErrorMessage] = useState('')

    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState(session?.user.email ?? '')
    const [phone, setPhone] = useState('')
    const [county, setCounty] = useState('')
    const [skillsText, setSkillsText] = useState('')
    const [availability, setAvailability] = useState('')
    const [bio, setBio] = useState('')

    useEffect(() => {
        const loadProfile = async () => {
            if (!userId) {
                setIsLoading(false)
                return
            }

            setIsLoading(true)
            setErrorMessage('')

            const { data, error } = await supabase
                .from('volunteer_profiles')
                .select('id, full_name, email, phone, county, skills, availability, bio')
                .eq('id', userId)
                .maybeSingle<VolunteerProfileRow>()

            if (error) {
                setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
                setIsLoading(false)
                return
            }

            if (data) {
                setFullName(data.full_name ?? '')
                setEmail(data.email ?? session?.user.email ?? '')
                setPhone(data.phone ?? '')
                setCounty(data.county ?? '')
                setSkillsText((data.skills ?? []).join(', '))
                setAvailability(data.availability ?? '')
                setBio(data.bio ?? '')
            } else {
                setEmail(session?.user.email ?? '')
            }

            setIsLoading(false)
        }

        loadProfile()
    }, [userId, session?.user.email])

    const saveProfile = async () => {
        if (!userId) return

        setIsSaving(true)
        setStatusMessage('')
        setErrorMessage('')

        const payload = {
            id: userId,
            full_name: fullName || null,
            email: email || null,
            phone: phone || null,
            county: county || null,
            skills: normalizeSkills(skillsText),
            availability: availability || null,
            bio: bio || null,
            updated_at: new Date().toISOString(),
        }

        const { error } = await supabase.from('volunteer_profiles').upsert(payload, { onConflict: 'id' })

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            setIsSaving(false)
            return
        }

        setStatusMessage('Volunteer profile saved.')
        setIsSaving(false)
    }

    if (isLoading) {
        return (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <p className="text-slate-600">Loading volunteer profile...</p>
            </section>
        )
    }

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Volunteer Profile</h1>
            <p className="mt-3 text-slate-600">Set your skills and county so campaigns can find good matches.</p>

            <div className="mt-6 grid max-w-3xl gap-4">
                <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-700">Full Name</span>
                    <input
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        placeholder="Jane Volunteer"
                    />
                </label>

                <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-700">Email</span>
                    <input
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        placeholder="volunteer@example.com"
                    />
                </label>

                <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-700">Phone</span>
                    <input
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        placeholder="(555) 555-0101"
                    />
                </label>

                <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-700">County</span>
                    <input
                        value={county}
                        onChange={(event) => setCounty(event.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        placeholder="Cumberland, MD"
                    />
                </label>

                <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-700">Skills (comma separated)</span>
                    <input
                        value={skillsText}
                        onChange={(event) => setSkillsText(event.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        placeholder="Canvassing, Phone banking, Data entry"
                    />
                </label>

                <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-700">Availability</span>
                    <input
                        value={availability}
                        onChange={(event) => setAvailability(event.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        placeholder="Weeknights and weekends"
                    />
                </label>

                <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-700">Bio</span>
                    <textarea
                        value={bio}
                        onChange={(event) => setBio(event.target.value)}
                        className="min-h-[120px] rounded-lg border border-slate-300 px-3 py-2"
                        placeholder="Share your volunteer background and interests."
                    />
                </label>

                {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
                {statusMessage ? <p className="text-sm text-emerald-700">{statusMessage}</p> : null}

                <button
                    type="button"
                    onClick={saveProfile}
                    disabled={isSaving}
                    className="w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                >
                    {isSaving ? 'Saving...' : 'Save Volunteer Profile'}
                </button>
            </div>
        </section>
    )
}

export default VolunteerProfile

