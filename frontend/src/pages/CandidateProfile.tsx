import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import CampaignHealthScoreCard from '../components/CampaignHealthScoreCard'
import {
    buildCampaignHealthFromLaunchDraft,
    fetchCampaignHealthSnapshot,
    type CampaignHealthScoreResult,
} from '../lib/campaignHealthScore'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/authContext'
import { buildUserFacingErrorMessage } from '../lib/userFacingError'

type CandidateRow = {
    id: string
    user_id: string
    campaign_name: string
    office_title: string
    jurisdiction: string
    election_date: string | null
    party_affiliation: string | null
    biography: string | null
    campaign_website: string | null
    volunteer_opportunities: string | null
    is_public_profile: boolean | null
    public_profile_slug: string | null
}

const defaultChecklistTemplates = [
    'Open campaign bank account',
    'File treasurer designation',
    'Set up contribution tracking process',
    'Prepare first campaign finance report',
]

type StarterDeadline = {
    label: string
    due_date: string
}

const getStarterDeadlines = (electionDateValue: string): StarterDeadline[] => {
    const election = new Date(electionDateValue)
    const preElection = new Date(election.getTime() - 14 * 24 * 60 * 60 * 1000)
    const finalReport = new Date(election.getTime() + 30 * 24 * 60 * 60 * 1000)

    return [
        {
            label: 'Pre-election finance report',
            due_date: preElection.toISOString().slice(0, 10),
        },
        {
            label: 'Post-election finance report',
            due_date: finalReport.toISOString().slice(0, 10),
        },
    ]
}

const inferStateCodeFromJurisdiction = (jurisdictionValue: string) => {
    const match = jurisdictionValue.trim().match(/([A-Za-z]{2})\s*$/)
    return match?.[1] ? match[1].toUpperCase() : 'ALL'
}

const slugifyPublicProfile = (value: string) =>
    value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

const buildDefaultPublicProfileSlug = (campaignNameValue: string, officeTitleValue: string, userIdValue: string) => {
    const baseSlug = slugifyPublicProfile(`${campaignNameValue}-${officeTitleValue}`) || 'candidate-profile'
    const userSuffix = userIdValue.slice(0, 8).toLowerCase() || 'campaign'
    return `${baseSlug}-${userSuffix}`
}

const ensureDefaultCampaign = async (
    candidateProfileId: string,
    resolvedCampaignName: string,
    resolvedJurisdiction: string
) => {
    const inferredStateCode = inferStateCodeFromJurisdiction(resolvedJurisdiction)

    const { data: existingCampaign, error: existingCampaignError } = await supabase
        .from('campaigns')
        .select('id, campaign_name, state_code')
        .eq('candidate_id', candidateProfileId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; campaign_name: string | null; state_code: string | null }>()

    if (existingCampaignError) {
        throw existingCampaignError
    }

    if (!existingCampaign) {
        const { error: createCampaignError } = await supabase.from('campaigns').insert({
            candidate_id: candidateProfileId,
            campaign_name: resolvedCampaignName,
            state_code: inferredStateCode,
            status: 'active',
            updated_at: new Date().toISOString(),
        })

        if (createCampaignError) {
            throw createCampaignError
        }
        return
    }

    const hasCampaignName = Boolean(existingCampaign.campaign_name && existingCampaign.campaign_name.trim().length > 0)
    const normalizedStateCode = (existingCampaign.state_code ?? '').trim().toUpperCase()
    const shouldUpdateName = !hasCampaignName
    const shouldUpdateStateCode = normalizedStateCode !== inferredStateCode

    if (shouldUpdateName || shouldUpdateStateCode) {
        const updatePayload: { campaign_name?: string; state_code?: string; updated_at: string } = {
            updated_at: new Date().toISOString(),
        }

        if (shouldUpdateName) {
            updatePayload.campaign_name = resolvedCampaignName
        }

        if (shouldUpdateStateCode) {
            updatePayload.state_code = inferredStateCode
        }

        const { error: updateCampaignNameError } = await supabase
            .from('campaigns')
            .update(updatePayload)
            .eq('id', existingCampaign.id)

        if (updateCampaignNameError) {
            throw updateCampaignNameError
        }
    }
}

function CandidateProfile() {
    const { session } = useAuth()
    const userId = useMemo(() => session?.user.id ?? '', [session])
    const userEmail = session?.user.email ?? ''

    const [candidateId, setCandidateId] = useState<string | null>(null)
    const [campaignName, setCampaignName] = useState('')
    const [officeTitle, setOfficeTitle] = useState('')
    const [jurisdiction, setJurisdiction] = useState('')
    const [electionDate, setElectionDate] = useState('')
    const [partyAffiliation, setPartyAffiliation] = useState('')
    const [biography, setBiography] = useState('')
    const [campaignWebsite, setCampaignWebsite] = useState('')
    const [volunteerOpportunities, setVolunteerOpportunities] = useState('')
    const [isPublicProfile, setIsPublicProfile] = useState(false)
    const [publicProfileSlug, setPublicProfileSlug] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [statusMessage, setStatusMessage] = useState('')
    const [errorMessage, setErrorMessage] = useState('')
    const [fieldErrors, setFieldErrors] = useState<{
        campaignName?: string
        officeTitle?: string
        jurisdiction?: string
        campaignWebsite?: string
        publicProfileSlug?: string
    }>({})

    const publicProfileUrl = useMemo(() => {
        if (!candidateId || !isPublicProfile || typeof window === 'undefined') return ''
        const pathSegment = slugifyPublicProfile(publicProfileSlug) || candidateId
        return `${window.location.origin}/candidate/${pathSegment}`
    }, [candidateId, isPublicProfile, publicProfileSlug])

    const candidateProfileComplete = useMemo(
        () =>
            !!candidateId ||
            (!!campaignName.trim() && !!officeTitle.trim() && !!jurisdiction.trim()),
        [candidateId, campaignName, officeTitle, jurisdiction]
    )

    const fallbackHealth = useMemo(
        () =>
            buildCampaignHealthFromLaunchDraft({
                userId,
                candidateProfileComplete,
            }),
        [userId, candidateProfileComplete]
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

    const ensureStarterDeadlines = async (candidateProfileId: string, electionDateValue: string | null) => {
        if (!electionDateValue) return

        const starterDeadlines = getStarterDeadlines(electionDateValue)
        const labels = starterDeadlines.map((item) => item.label)

        const { data: existingDeadlines, error: deadlinesError } = await supabase
            .from('deadlines')
            .select('label')
            .eq('candidate_id', candidateProfileId)
            .in('label', labels)

        if (deadlinesError) {
            throw deadlinesError
        }

        const existingLabelSet = new Set((existingDeadlines ?? []).map((item) => item.label))
        const missingDeadlines = starterDeadlines.filter((item) => !existingLabelSet.has(item.label))

        if (missingDeadlines.length === 0) return

        const { error: insertDeadlinesError } = await supabase.from('deadlines').insert(
            missingDeadlines.map((item) => ({
                candidate_id: candidateProfileId,
                label: item.label,
                due_date: item.due_date,
                status: 'upcoming',
            }))
        )

        if (insertDeadlinesError) {
            throw insertDeadlinesError
        }
    }

    const ensureStarterData = async (candidateProfileId: string) => {
        const { data: existingItems, error: checklistError } = await supabase
            .from('checklist_items')
            .select('id')
            .eq('candidate_id', candidateProfileId)
            .limit(1)

        if (checklistError) {
            throw checklistError
        }

        if (!existingItems || existingItems.length === 0) {
            const starterItems = defaultChecklistTemplates.map((title, index) => ({
                candidate_id: candidateProfileId,
                title,
                description: `${title} for ${officeTitle} in ${jurisdiction}`,
                status: 'pending',
                due_date: electionDate
                    ? new Date(
                        new Date(electionDate).getTime() - (30 - index * 5) * 24 * 60 * 60 * 1000
                    )
                        .toISOString()
                        .slice(0, 10)
                    : null,
            }))

            const { error: insertChecklistError } = await supabase.from('checklist_items').insert(starterItems)
            if (insertChecklistError) {
                throw insertChecklistError
            }
        }

        await ensureStarterDeadlines(candidateProfileId, electionDate || null)
    }

    useEffect(() => {
        const loadCandidateProfile = async () => {
            if (!userId) {
                setIsLoading(false)
                return
            }

            setIsLoading(true)
            setErrorMessage('')

            const { data, error } = await supabase
                .from('candidates')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle<CandidateRow>()

            if (error) {
                setErrorMessage(buildUserFacingErrorMessage({ action: 'load', resource: 'candidate profile' }))
            }

            if (data) {
                setCandidateId(data.id)
                setCampaignName(data.campaign_name ?? '')
                setOfficeTitle(data.office_title ?? '')
                setJurisdiction(data.jurisdiction ?? '')
                setElectionDate(data.election_date ?? '')
                setPartyAffiliation(data.party_affiliation ?? '')
                setBiography(data.biography ?? '')
                setCampaignWebsite(data.campaign_website ?? '')
                setVolunteerOpportunities(data.volunteer_opportunities ?? '')
                setIsPublicProfile(Boolean(data.is_public_profile))
                setPublicProfileSlug(data.public_profile_slug ?? '')

                if (data.election_date) {
                    try {
                        await ensureStarterDeadlines(data.id, data.election_date)
                    } catch (seedError) {
                        setErrorMessage(buildUserFacingErrorMessage({ action: 'prepare', resource: 'starter deadlines' }))
                    }
                }
            }

            setIsLoading(false)
        }

        loadCandidateProfile()
    }, [userId])

    const handleSave = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!userId) return

        const nextFieldErrors: {
            campaignName?: string
            officeTitle?: string
            jurisdiction?: string
            campaignWebsite?: string
            publicProfileSlug?: string
        } = {}

        if (!campaignName.trim()) {
            nextFieldErrors.campaignName = 'Campaign name is required.'
        }
        if (!officeTitle.trim()) {
            nextFieldErrors.officeTitle = 'Office title is required.'
        }
        if (!jurisdiction.trim()) {
            nextFieldErrors.jurisdiction = 'Jurisdiction is required.'
        }
        if (campaignWebsite.trim()) {
            const isValidUrl = /^https?:\/\//i.test(campaignWebsite.trim())
            if (!isValidUrl) {
                nextFieldErrors.campaignWebsite = 'Campaign website must start with http:// or https://'
            }
        }
        if (isPublicProfile && publicProfileSlug.trim()) {
            const normalizedSlug = slugifyPublicProfile(publicProfileSlug)
            if (normalizedSlug.length < 4) {
                nextFieldErrors.publicProfileSlug = 'Slug should be at least 4 characters long.'
            }
        }

        setFieldErrors(nextFieldErrors)
        if (Object.keys(nextFieldErrors).length > 0) {
            setErrorMessage('Please fix the highlighted form fields and try again.')
            return
        }

        setIsSaving(true)
        setErrorMessage('')
        setStatusMessage('')

        // Ensure related user profile row exists for FK constraints.
        const { error: userError } = await supabase.from('users').upsert(
            {
                id: userId,
                email: userEmail,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
        )

        if (userError) {
            setIsSaving(false)
            setErrorMessage(
                userError.message.includes('row-level security')
                    ? 'User profile policy missing in database. Run the policy patch and try again.'
                    : buildUserFacingErrorMessage({ action: 'save', resource: 'candidate profile' })
            )
            return
        }

        const payload = {
            public_profile_slug: isPublicProfile
                ? (slugifyPublicProfile(publicProfileSlug) || buildDefaultPublicProfileSlug(campaignName, officeTitle, userId))
                : null,
            user_id: userId,
            campaign_name: campaignName,
            office_title: officeTitle,
            jurisdiction,
            election_date: electionDate || null,
            party_affiliation: partyAffiliation || null,
            biography: biography.trim() || null,
            campaign_website: campaignWebsite.trim() || null,
            volunteer_opportunities: volunteerOpportunities.trim() || null,
            is_public_profile: isPublicProfile,
            updated_at: new Date().toISOString(),
        }

        const query = candidateId
            ? supabase.from('candidates').update(payload).eq('id', candidateId)
            : supabase.from('candidates').insert(payload).select('id').single()

        const { data, error } = await query

        if (error) {
            setErrorMessage(
                error.message.includes('idx_candidates_public_profile_slug_unique') || error.message.includes('duplicate key value')
                    ? 'That public profile URL slug is already in use. Choose a different slug and save again.'
                    : buildUserFacingErrorMessage({ action: 'save', resource: 'candidate profile' })
            )
            setIsSaving(false)
            return
        }

        if (isPublicProfile) {
            setPublicProfileSlug(
                slugifyPublicProfile(publicProfileSlug) || buildDefaultPublicProfileSlug(campaignName, officeTitle, userId)
            )
        }

        const effectiveCandidateId = candidateId || (data && 'id' in data ? (data.id as string) : null)
        if (effectiveCandidateId) {
            setCandidateId(effectiveCandidateId)
            try {
                await ensureDefaultCampaign(effectiveCandidateId, campaignName, jurisdiction)
                await ensureStarterData(effectiveCandidateId)
            } catch (seedError) {
                setErrorMessage(buildUserFacingErrorMessage({ action: 'prepare', resource: 'starter campaign setup' }))
                setIsSaving(false)
                return
            }
        }

        setStatusMessage('Candidate profile saved successfully.')
        setIsSaving(false)
    }

    if (isLoading) {
        return (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <p className="text-slate-600">Loading candidate profile...</p>
            </section>
        )
    }

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Candidate Profile</h1>
            <p className="mt-3 text-slate-600">Set office, jurisdiction, election date, and campaign details.</p>

            <CampaignHealthScoreCard health={campaignHealth} className="mt-6 max-w-2xl" />

            <form className="mt-6 grid max-w-2xl gap-4" onSubmit={handleSave}>
                <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-700">Campaign Name</span>
                    <input
                        id="candidate-campaign-name"
                        value={campaignName}
                        onChange={(e) => {
                            setCampaignName(e.target.value)
                            setFieldErrors((prev) => ({ ...prev, campaignName: undefined }))
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        placeholder="Friends of Your Name"
                        aria-invalid={Boolean(fieldErrors.campaignName)}
                        aria-describedby={fieldErrors.campaignName ? 'candidate-campaign-name-error' : undefined}
                        required
                    />
                    {fieldErrors.campaignName ? (
                        <p id="candidate-campaign-name-error" className="text-sm text-red-700" role="alert">{fieldErrors.campaignName}</p>
                    ) : null}
                </label>

                <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-700">Office Title</span>
                    <input
                        id="candidate-office-title"
                        value={officeTitle}
                        onChange={(e) => {
                            setOfficeTitle(e.target.value)
                            setFieldErrors((prev) => ({ ...prev, officeTitle: undefined }))
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        placeholder="City Council, District 3"
                        aria-invalid={Boolean(fieldErrors.officeTitle)}
                        aria-describedby={fieldErrors.officeTitle ? 'candidate-office-title-error' : undefined}
                        required
                    />
                    {fieldErrors.officeTitle ? (
                        <p id="candidate-office-title-error" className="text-sm text-red-700" role="alert">{fieldErrors.officeTitle}</p>
                    ) : null}
                </label>

                <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-700">Jurisdiction</span>
                    <input
                        id="candidate-jurisdiction"
                        value={jurisdiction}
                        onChange={(e) => {
                            setJurisdiction(e.target.value)
                            setFieldErrors((prev) => ({ ...prev, jurisdiction: undefined }))
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        placeholder="Austin, TX"
                        aria-invalid={Boolean(fieldErrors.jurisdiction)}
                        aria-describedby={fieldErrors.jurisdiction ? 'candidate-jurisdiction-error' : undefined}
                        required
                    />
                    {fieldErrors.jurisdiction ? (
                        <p id="candidate-jurisdiction-error" className="text-sm text-red-700" role="alert">{fieldErrors.jurisdiction}</p>
                    ) : null}
                </label>

                <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-700">Election Date</span>
                    <input
                        type="date"
                        value={electionDate}
                        onChange={(e) => setElectionDate(e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                    />
                </label>

                <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-700">Party Affiliation (Optional)</span>
                    <input
                        value={partyAffiliation}
                        onChange={(e) => setPartyAffiliation(e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        placeholder="Independent"
                    />
                </label>

                <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-700">Biography (Public)</span>
                    <textarea
                        value={biography}
                        onChange={(e) => setBiography(e.target.value)}
                        className="min-h-28 rounded-lg border border-slate-300 px-3 py-2"
                        placeholder="Short candidate biography visible on your public profile"
                    />
                </label>

                <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-700">Campaign Website (Public)</span>
                    <input
                        id="candidate-campaign-website"
                        value={campaignWebsite}
                        onChange={(e) => {
                            setCampaignWebsite(e.target.value)
                            setFieldErrors((prev) => ({ ...prev, campaignWebsite: undefined }))
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        placeholder="https://www.yourcampaign.org"
                        aria-invalid={Boolean(fieldErrors.campaignWebsite)}
                        aria-describedby={fieldErrors.campaignWebsite ? 'candidate-campaign-website-error' : undefined}
                    />
                    {fieldErrors.campaignWebsite ? (
                        <p id="candidate-campaign-website-error" className="text-sm text-red-700" role="alert">{fieldErrors.campaignWebsite}</p>
                    ) : null}
                </label>

                <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-700">Volunteer Opportunities (Public)</span>
                    <textarea
                        value={volunteerOpportunities}
                        onChange={(e) => setVolunteerOpportunities(e.target.value)}
                        className="min-h-24 rounded-lg border border-slate-300 px-3 py-2"
                        placeholder="How supporters can volunteer with your campaign"
                    />
                </label>

                <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <input
                        type="checkbox"
                        checked={isPublicProfile}
                        onChange={(e) => setIsPublicProfile(e.target.checked)}
                        className="mt-1 h-4 w-4"
                    />
                    <span className="text-sm text-slate-700">
                        Publish a public candidate profile with biography, office sought, campaign website, and volunteer opportunities.
                    </span>
                </label>

                {isPublicProfile ? (
                    <label className="grid gap-1">
                        <span className="text-sm font-medium text-slate-700">Public Profile URL Slug</span>
                        <div className="flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                            <span className="text-slate-500">/candidate/</span>
                            <input
                                value={publicProfileSlug}
                                onChange={(e) => {
                                    setPublicProfileSlug(e.target.value)
                                    setFieldErrors((prev) => ({ ...prev, publicProfileSlug: undefined }))
                                }}
                                className="ml-1 w-full border-none p-0 text-slate-900 outline-none"
                                placeholder="your-name-for-office"
                                aria-invalid={Boolean(fieldErrors.publicProfileSlug)}
                                aria-describedby={fieldErrors.publicProfileSlug ? 'candidate-public-profile-slug-error' : undefined}
                            />
                        </div>
                        <p className="text-xs text-slate-500">Use lowercase letters, numbers, and hyphens for best results.</p>
                        {fieldErrors.publicProfileSlug ? (
                            <p id="candidate-public-profile-slug-error" className="text-sm text-red-700" role="alert">{fieldErrors.publicProfileSlug}</p>
                        ) : null}
                    </label>
                ) : null}

                {publicProfileUrl ? (
                    <p className="text-sm text-slate-600">
                        Public profile link:{' '}
                        <a
                            href={publicProfileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-amber-700 hover:text-amber-800"
                        >
                            {publicProfileUrl}
                        </a>
                    </p>
                ) : null}

                {errorMessage ? <p className="text-sm text-red-700" role="alert">{errorMessage}</p> : null}
                {statusMessage ? <p className="text-sm text-emerald-700">{statusMessage}</p> : null}

                <button
                    type="submit"
                    disabled={isSaving}
                    className="w-fit rounded-lg bg-[#0f4c81] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b3c65] disabled:opacity-60"
                >
                    {isSaving ? 'Saving...' : 'Save Profile'}
                </button>
            </form>
        </section>
    )
}

export default CandidateProfile
