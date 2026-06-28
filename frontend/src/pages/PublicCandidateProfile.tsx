import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

import { buildUserFacingErrorMessage } from '../lib/userFacingError'
type PublicCandidateRow = {
    id: string
    public_profile_slug: string | null
    campaign_name: string
    office_title: string
    biography: string | null
    campaign_website: string | null
    volunteer_opportunities: string | null
    is_public_profile: boolean | null
}

function PublicCandidateProfile() {
    const { candidateKey = '' } = useParams()
    const [profile, setProfile] = useState<PublicCandidateRow | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState('')

    useEffect(() => {
        const loadProfile = async () => {
            if (!candidateKey) {
                setErrorMessage('Candidate profile link is invalid.')
                setIsLoading(false)
                return
            }

            setIsLoading(true)
            setErrorMessage('')

            const isUuidLookup = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateKey)

            let query = supabase
                .from('candidates')
                .select('id, public_profile_slug, campaign_name, office_title, biography, campaign_website, volunteer_opportunities, is_public_profile')
                .eq('is_public_profile', true)

            query = isUuidLookup ? query.eq('id', candidateKey) : query.eq('public_profile_slug', candidateKey.toLowerCase())

            const { data, error } = await query.maybeSingle<PublicCandidateRow>()

            if (error) {
                setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
                setIsLoading(false)
                return
            }

            if (!data) {
                setErrorMessage('This public candidate profile is unavailable.')
                setIsLoading(false)
                return
            }

            setProfile(data)
            setIsLoading(false)
        }

        void loadProfile()
    }, [candidateKey])

    if (isLoading) {
        return (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <p className="text-slate-600">Loading public candidate profile...</p>
            </section>
        )
    }

    if (!profile) {
        return (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <h1 className="text-2xl font-semibold text-slate-900">Public Candidate Profile</h1>
                <p className="mt-3 text-sm text-red-600">{errorMessage || 'Profile not found.'}</p>
                <Link to="/" className="mt-4 inline-block text-sm font-semibold text-amber-700 hover:text-amber-800">
                    Back to CCSP CivicOS
                </Link>
            </section>
        )
    }

    return (
        <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Public Candidate Profile</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{profile.campaign_name}</h1>
                <p className="mt-2 text-slate-600">Office sought: {profile.office_title}</p>
            </div>

            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="text-lg font-semibold text-slate-900">Biography</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                    {profile.biography?.trim() || 'Biography coming soon.'}
                </p>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="text-lg font-semibold text-slate-900">Campaign Website</h2>
                {profile.campaign_website ? (
                    <a
                        href={profile.campaign_website}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-sm font-semibold text-amber-700 hover:text-amber-800"
                    >
                        Visit campaign website
                    </a>
                ) : (
                    <p className="mt-2 text-sm text-slate-700">Campaign website will be posted soon.</p>
                )}
            </article>

            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="text-lg font-semibold text-slate-900">Volunteer Opportunities</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                    {profile.volunteer_opportunities?.trim() || 'Volunteer opportunities will be shared soon.'}
                </p>
            </article>

            <p className="text-xs text-slate-500">
                This public page only shows campaign outreach details. Compliance tools and operational data remain private.
            </p>
        </section>
    )
}

export default PublicCandidateProfile

