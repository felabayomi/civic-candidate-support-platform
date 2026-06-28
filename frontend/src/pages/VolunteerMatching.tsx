import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../lib/authContext'
import { supabase } from '../lib/supabaseClient'

import { buildUserFacingErrorMessage } from '../lib/userFacingError'
type VolunteerProfileRow = {
    id: string
    full_name: string | null
    email: string | null
    county: string | null
    skills: string[]
    availability: string | null
    bio: string | null
}

type CandidateSummary = {
    campaign_name: string
    office_title: string
    jurisdiction: string
}

type CandidateNeedRow = {
    id: string
    candidate_id: string
    title: string
    description: string | null
    county: string | null
    skills: string[]
    priority: 'low' | 'medium' | 'high'
    status: 'open' | 'filled' | 'closed'
    created_at: string
    candidate: CandidateSummary | CandidateSummary[] | null
}

type VolunteerApplicationRow = {
    id: string
    need_id: string
    candidate_id: string
    volunteer_id: string
    message: string | null
    status: 'pending' | 'accepted' | 'rejected' | 'withdrawn'
    reviewed_by: string | null
    reviewed_at: string | null
    created_at: string
}

type CandidateIdRow = {
    id: string
}

type CandidatePreviewTarget = {
    id: string
    campaign_name: string
}

type MatchResult = {
    volunteer: VolunteerProfileRow
    commonSkills: string[]
    countyMatch: boolean
    score: number
}

const normalizeSkills = (value: string) =>
    value
        .split(',')
        .map((skill) => skill.trim())
        .filter((skill) => skill.length > 0)

const normalizeCandidate = (candidate: CandidateSummary | CandidateSummary[] | null): CandidateSummary | null => {
    if (!candidate) return null
    return Array.isArray(candidate) ? candidate[0] ?? null : candidate
}

const lowercase = (value: string | null | undefined) => (value ?? '').trim().toLowerCase()

const getMatchesForNeed = (need: CandidateNeedRow, volunteers: VolunteerProfileRow[]): MatchResult[] => {
    const needSkills = (need.skills ?? []).map((skill) => skill.toLowerCase())
    const needCounty = lowercase(need.county)

    return volunteers
        .map((volunteer) => {
            const volunteerSkills = (volunteer.skills ?? []).map((skill) => skill.toLowerCase())
            const commonSkills = needSkills.filter((skill) => volunteerSkills.includes(skill))
            const countyMatch = needCounty.length > 0 && needCounty === lowercase(volunteer.county)
            const score = commonSkills.length + (countyMatch ? 2 : 0)

            return {
                volunteer,
                commonSkills,
                countyMatch,
                score,
            }
        })
        .filter((match) => match.score > 0)
        .sort((a, b) => b.score - a.score)
}

function VolunteerMatching() {
    const { session, role } = useAuth()
    const userId = useMemo(() => session?.user.id ?? '', [session])
    const isAdminUser = role === 'admin'

    const [isLoading, setIsLoading] = useState(true)
    const [isSavingNeed, setIsSavingNeed] = useState(false)
    const [statusMessage, setStatusMessage] = useState('')
    const [errorMessage, setErrorMessage] = useState('')

    const [candidateId, setCandidateId] = useState<string | null>(null)
    const [needs, setNeeds] = useState<CandidateNeedRow[]>([])
    const [volunteers, setVolunteers] = useState<VolunteerProfileRow[]>([])
    const [myVolunteerProfile, setMyVolunteerProfile] = useState<VolunteerProfileRow | null>(null)
    const [applications, setApplications] = useState<VolunteerApplicationRow[]>([])
    const [previewCandidateTarget, setPreviewCandidateTarget] = useState<CandidatePreviewTarget | null>(null)
    const [applyMessageByNeed, setApplyMessageByNeed] = useState<Record<string, string>>({})
    const [isApplyingByNeed, setIsApplyingByNeed] = useState<Record<string, boolean>>({})
    const [isUpdatingApplicationById, setIsUpdatingApplicationById] = useState<Record<string, boolean>>({})
    const [isContactingApplicationById, setIsContactingApplicationById] = useState<Record<string, boolean>>({})

    const [needTitle, setNeedTitle] = useState('')
    const [needDescription, setNeedDescription] = useState('')
    const [needCounty, setNeedCounty] = useState('')
    const [needSkills, setNeedSkills] = useState('')
    const [needPriority, setNeedPriority] = useState<'low' | 'medium' | 'high'>('medium')
    const [previewRole, setPreviewRole] = useState<'off' | 'volunteer' | 'candidate' | 'treasurer' | 'advisor'>('off')

    const effectiveRole = isAdminUser && previewRole !== 'off' ? previewRole : role

    const loadData = async () => {
        if (!userId) {
            setIsLoading(false)
            return
        }

        setIsLoading(true)
        setErrorMessage('')

        const [candidateRes, previewCandidateRes, needsRes, volunteersRes, myProfileRes, applicationsRes] = await Promise.all([
            supabase.from('candidates').select('id').eq('user_id', userId).maybeSingle<CandidateIdRow>(),
            supabase
                .from('candidates')
                .select('id, campaign_name')
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle<CandidatePreviewTarget>(),
            supabase
                .from('candidate_volunteer_needs')
                .select('id, candidate_id, title, description, county, skills, priority, status, created_at, candidate:candidates(campaign_name, office_title, jurisdiction)')
                .order('created_at', { ascending: false }),
            supabase
                .from('volunteer_profiles')
                .select('id, full_name, email, county, skills, availability, bio')
                .order('created_at', { ascending: false }),
            supabase
                .from('volunteer_profiles')
                .select('id, full_name, email, county, skills, availability, bio')
                .eq('id', userId)
                .maybeSingle<VolunteerProfileRow>(),
            supabase
                .from('candidate_volunteer_applications')
                .select('id, need_id, candidate_id, volunteer_id, message, status, reviewed_by, reviewed_at, created_at')
                .order('created_at', { ascending: false }),
        ])

        if (candidateRes.error || previewCandidateRes.error || needsRes.error || volunteersRes.error || myProfileRes.error || applicationsRes.error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'load', resource: 'volunteer matching data' }))
            setIsLoading(false)
            return
        }

        setCandidateId(candidateRes.data?.id ?? null)
        setPreviewCandidateTarget((previewCandidateRes.data ?? null) as CandidatePreviewTarget | null)
        setNeeds((needsRes.data ?? []) as CandidateNeedRow[])
        setVolunteers((volunteersRes.data ?? []) as VolunteerProfileRow[])
        setMyVolunteerProfile((myProfileRes.data ?? null) as VolunteerProfileRow | null)
        setApplications((applicationsRes.data ?? []) as VolunteerApplicationRow[])
        setIsLoading(false)
    }

    useEffect(() => {
        loadData()
    }, [userId])

    const createNeed = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        const targetCandidateId = candidateId ?? (isAdminUser ? previewCandidateTarget?.id ?? null : null)

        if (!targetCandidateId) {
            setErrorMessage('Candidate profile is required before posting volunteer needs.')
            return
        }

        setStatusMessage('')
        setErrorMessage('')
        setIsSavingNeed(true)

        const { error } = await supabase.from('candidate_volunteer_needs').insert({
            candidate_id: targetCandidateId,
            title: needTitle,
            description: needDescription || null,
            county: needCounty || null,
            skills: normalizeSkills(needSkills),
            priority: needPriority,
            status: 'open',
            created_by: userId,
            updated_at: new Date().toISOString(),
        })

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            setIsSavingNeed(false)
            return
        }

        setNeedTitle('')
        setNeedDescription('')
        setNeedCounty('')
        setNeedSkills('')
        setNeedPriority('medium')
        setStatusMessage('Volunteer need posted.')
        setIsSavingNeed(false)
        await loadData()
    }

    const createSampleNeed = async () => {
        if (!isAdminUser) return
        if (!previewCandidateTarget?.id) {
            setErrorMessage('No candidate profile exists yet. Create one Candidate Profile first.')
            return
        }

        setStatusMessage('')
        setErrorMessage('')
        setIsSavingNeed(true)

        const { error } = await supabase.from('candidate_volunteer_needs').insert({
            candidate_id: previewCandidateTarget.id,
            title: 'Volunteer Need Template',
            description: 'Admin-created starter need to validate volunteer apply and contact workflow.',
            county: null,
            skills: ['outreach', 'canvassing'],
            priority: 'medium',
            status: 'open',
            created_by: userId,
            updated_at: new Date().toISOString(),
        })

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            setIsSavingNeed(false)
            return
        }

        setStatusMessage('Starter open need created. You can now validate Apply and Contact Candidate flows.')
        setIsSavingNeed(false)
        await loadData()
    }

    const setNeedStatus = async (needId: string, status: 'open' | 'filled' | 'closed') => {
        const { error } = await supabase
            .from('candidate_volunteer_needs')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', needId)

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        setStatusMessage(`Need status updated to ${status}.`)
        await loadData()
    }

    const applyToNeed = async (need: CandidateNeedRow) => {
        if (!effectiveVolunteerProfile) {
            setErrorMessage('Create your Volunteer Profile first before applying.')
            return
        }

        setStatusMessage('')
        setErrorMessage('')
        setIsApplyingByNeed((prev) => ({ ...prev, [need.id]: true }))

        const { error } = await supabase.from('candidate_volunteer_applications').insert({
            need_id: need.id,
            candidate_id: need.candidate_id,
            volunteer_id: userId,
            message: applyMessageByNeed[need.id]?.trim() || null,
            status: 'pending',
            updated_at: new Date().toISOString(),
        })

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            setIsApplyingByNeed((prev) => ({ ...prev, [need.id]: false }))
            return
        }

        setApplyMessageByNeed((prev) => ({ ...prev, [need.id]: '' }))
        setStatusMessage('Interest sent to candidate.')
        setIsApplyingByNeed((prev) => ({ ...prev, [need.id]: false }))
        await loadData()
    }

    const updateApplicationStatus = async (
        application: VolunteerApplicationRow,
        status: 'accepted' | 'rejected' | 'withdrawn'
    ) => {
        setStatusMessage('')
        setErrorMessage('')
        setIsUpdatingApplicationById((prev) => ({ ...prev, [application.id]: true }))

        const payload: {
            status: 'accepted' | 'rejected' | 'withdrawn'
            reviewed_at: string | null
            reviewed_by: string | null
            updated_at: string
        } = {
            status,
            reviewed_at: status === 'accepted' || status === 'rejected' ? new Date().toISOString() : null,
            reviewed_by: status === 'accepted' || status === 'rejected' ? userId : null,
            updated_at: new Date().toISOString(),
        }

        const { error } = await supabase
            .from('candidate_volunteer_applications')
            .update(payload)
            .eq('id', application.id)

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            setIsUpdatingApplicationById((prev) => ({ ...prev, [application.id]: false }))
            return
        }

        if (status === 'accepted') {
            const { error: needStatusError } = await supabase
                .from('candidate_volunteer_needs')
                .update({ status: 'filled', updated_at: new Date().toISOString() })
                .eq('id', application.need_id)

            if (needStatusError) {
                setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
                setIsUpdatingApplicationById((prev) => ({ ...prev, [application.id]: false }))
                return
            }
        }

        if (status === 'accepted' || status === 'rejected') {
            const emailInvoke = await supabase.functions.invoke('ccsp-deadline-reminders', {
                body: {
                    action: 'volunteer-decision',
                    applicationId: application.id,
                    decisionStatus: status,
                    triggeredBy: 'volunteer-matching',
                },
            })

            if (emailInvoke.error) {
                setErrorMessage(
                    `Application status saved, but ${buildUserFacingErrorMessage({ action: 'send', resource: 'volunteer notification email' })}`
                )
            }
        }

        setStatusMessage(`Application ${status}.`)
        setIsUpdatingApplicationById((prev) => ({ ...prev, [application.id]: false }))
        await loadData()
    }

    const contactVolunteer = async (application: VolunteerApplicationRow) => {
        setStatusMessage('')
        setErrorMessage('')
        setIsContactingApplicationById((prev) => ({ ...prev, [application.id]: true }))

        const invokeResult = await supabase.functions.invoke('ccsp-deadline-reminders', {
            body: {
                action: 'contact-volunteer',
                applicationId: application.id,
                triggeredBy: 'volunteer-matching-contact',
            },
        })

        if (invokeResult.error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'send', resource: 'volunteer follow-up email' }))
            setIsContactingApplicationById((prev) => ({ ...prev, [application.id]: false }))
            return
        }

        setStatusMessage('Follow-up email sent to volunteer.')
        setIsContactingApplicationById((prev) => ({ ...prev, [application.id]: false }))
    }

    const myNeedMatches = useMemo(() => {
        if (isAdminUser && previewRole === 'candidate') return needs
        if (!candidateId) return [] as CandidateNeedRow[]
        return needs.filter((need) => need.candidate_id === candidateId)
    }, [needs, candidateId, isAdminUser, previewRole])

    const previewVolunteerProfile = useMemo(() => {
        if (!(isAdminUser && previewRole === 'volunteer') || myVolunteerProfile) return null
        return {
            id: userId,
            full_name: session?.user.user_metadata?.full_name ?? 'Admin Volunteer Preview',
            email: session?.user.email ?? null,
            county: null,
            skills: [],
            availability: null,
            bio: null,
        } as VolunteerProfileRow
    }, [isAdminUser, previewRole, myVolunteerProfile, session, userId])

    const effectiveVolunteerProfile = previewVolunteerProfile ?? myVolunteerProfile

    const canManageNeeds = effectiveRole === 'candidate' || effectiveRole === 'admin'
    const canViewVolunteerNeeds = effectiveRole === 'volunteer' || effectiveRole === 'admin'

    const volunteerNeedMatches = useMemo(() => {
        if (!effectiveVolunteerProfile) return [] as Array<{ need: CandidateNeedRow; score: number; commonSkills: string[]; countyMatch: boolean }>

        const profileSkills = (effectiveVolunteerProfile.skills ?? []).map((skill) => skill.toLowerCase())
        const profileCounty = lowercase(effectiveVolunteerProfile.county)

        return needs
            .filter((need) => need.status === 'open')
            .map((need) => {
                const needSkills = (need.skills ?? []).map((skill) => skill.toLowerCase())
                const commonSkills = needSkills.filter((skill) => profileSkills.includes(skill))
                const countyMatch = profileCounty.length > 0 && profileCounty === lowercase(need.county)
                const score = commonSkills.length + (countyMatch ? 2 : 0)
                return { need, score, commonSkills, countyMatch }
            })
            .sort((a, b) => b.score - a.score)
    }, [needs, effectiveVolunteerProfile])

    const myApplicationsByNeed = useMemo(() => {
        const map = new Map<string, VolunteerApplicationRow>()
        applications
            .filter((application) => application.volunteer_id === userId)
            .forEach((application) => {
                map.set(application.need_id, application)
            })
        return map
    }, [applications, userId])

    const applicationsForMyNeeds = useMemo(() => {
        if (isAdminUser && previewRole === 'candidate') return applications
        if (!candidateId) return [] as VolunteerApplicationRow[]
        return applications.filter((application) => application.candidate_id === candidateId)
    }, [applications, candidateId, isAdminUser, previewRole])

    const openNeeds = useMemo(() => {
        return needs.filter((need) => need.status === 'open')
    }, [needs])

    const volunteersById = useMemo(() => {
        const map = new Map<string, VolunteerProfileRow>()
        volunteers.forEach((volunteer) => {
            map.set(volunteer.id, volunteer)
        })
        return map
    }, [volunteers])

    if (isLoading) {
        return (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <p className="text-slate-600">Loading volunteer matching...</p>
            </section>
        )
    }

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Volunteer Matching</h1>
            <p className="mt-3 text-slate-600">Match volunteers to campaign needs by shared skills and county.</p>
            <p className="mt-2 text-xs text-slate-500">
                Sidebar links: Volunteer Profile and Volunteer Matching. Volunteers apply from the Volunteer View section below.
            </p>

            {isAdminUser ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Admin Workspace Mode</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="text-xs font-medium text-amber-900" htmlFor="preview-role-select">
                            Switch role view:
                        </label>
                        <select
                            id="preview-role-select"
                            value={previewRole}
                            onChange={(event) =>
                                setPreviewRole(
                                    event.target.value as 'off' | 'volunteer' | 'candidate' | 'treasurer' | 'advisor'
                                )
                            }
                            className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs"
                        >
                            <option value="off">off</option>
                            <option value="volunteer">volunteer</option>
                            <option value="candidate">candidate</option>
                            <option value="treasurer">treasurer</option>
                            <option value="advisor">advisor</option>
                        </select>
                    </div>
                    <p className="mt-2 text-xs text-amber-900">
                        Active role view: {effectiveRole || 'none'}.
                        {previewRole === 'volunteer' && !myVolunteerProfile
                            ? ' Using a volunteer role view so you can validate apply flow without creating a volunteer profile.'
                            : ''}
                    </p>
                </div>
            ) : null}

            {errorMessage ? <p className="mt-4 text-sm text-red-600">{errorMessage}</p> : null}
            {statusMessage ? <p className="mt-4 text-sm text-emerald-700">{statusMessage}</p> : null}

            {canManageNeeds ? (
                <div className="mt-6 rounded-xl border border-slate-200 p-4">
                    <h2 className="text-lg font-semibold text-slate-900">Post Candidate Need</h2>
                    {!candidateId ? (
                        <p className="mt-2 text-sm text-amber-700">Create your Candidate Profile first to post volunteer needs.</p>
                    ) : (
                        <form className="mt-3 grid gap-3" onSubmit={createNeed}>
                            <input
                                value={needTitle}
                                onChange={(event) => setNeedTitle(event.target.value)}
                                className="rounded-lg border border-slate-300 px-3 py-2"
                                placeholder="Need title (example: Weekend canvassing team)"
                                required
                            />
                            <textarea
                                value={needDescription}
                                onChange={(event) => setNeedDescription(event.target.value)}
                                className="min-h-[90px] rounded-lg border border-slate-300 px-3 py-2"
                                placeholder="Describe duties and expected hours"
                            />
                            <div className="grid gap-3 sm:grid-cols-3">
                                <input
                                    value={needCounty}
                                    onChange={(event) => setNeedCounty(event.target.value)}
                                    className="rounded-lg border border-slate-300 px-3 py-2"
                                    placeholder="County"
                                />
                                <input
                                    value={needSkills}
                                    onChange={(event) => setNeedSkills(event.target.value)}
                                    className="rounded-lg border border-slate-300 px-3 py-2"
                                    placeholder="Skills (comma separated)"
                                />
                                <select
                                    value={needPriority}
                                    onChange={(event) => setNeedPriority(event.target.value as 'low' | 'medium' | 'high')}
                                    className="rounded-lg border border-slate-300 px-3 py-2"
                                >
                                    <option value="low">low</option>
                                    <option value="medium">medium</option>
                                    <option value="high">high</option>
                                </select>
                            </div>
                            <button
                                type="submit"
                                disabled={isSavingNeed}
                                className="w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                            >
                                {isSavingNeed ? 'Posting...' : 'Post Need'}
                            </button>
                        </form>
                    )}
                </div>
            ) : null}

            {canManageNeeds ? (
                <div className="mt-6 rounded-xl border border-slate-200 p-4">
                    <h2 className="text-lg font-semibold text-slate-900">Need-to-Volunteer Matches</h2>
                    <div className="mt-3 space-y-3">
                        {myNeedMatches.length === 0 ? (
                            <p className="text-sm text-slate-600">No candidate needs found yet.</p>
                        ) : (
                            myNeedMatches.map((need) => {
                                const candidate = normalizeCandidate(need.candidate)
                                const topMatches = getMatchesForNeed(need, volunteers).slice(0, 5)
                                return (
                                    <article key={need.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div>
                                                <p className="font-semibold text-slate-900">{need.title}</p>
                                                <p className="text-sm text-slate-600">
                                                    {candidate ? `${candidate.campaign_name} | ${candidate.jurisdiction}` : 'Campaign need'}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    County: {need.county || 'Any'} | Priority: {need.priority} | Status: {need.status}
                                                </p>
                                            </div>
                                            {need.candidate_id === candidateId ? (
                                                <select
                                                    value={need.status}
                                                    onChange={(event) =>
                                                        setNeedStatus(need.id, event.target.value as 'open' | 'filled' | 'closed')
                                                    }
                                                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                                                >
                                                    <option value="open">open</option>
                                                    <option value="filled">filled</option>
                                                    <option value="closed">closed</option>
                                                </select>
                                            ) : null}
                                        </div>

                                        {topMatches.length === 0 ? (
                                            <p className="mt-2 text-sm text-slate-600">No strong matches yet.</p>
                                        ) : (
                                            <ul className="mt-2 space-y-2 text-sm text-slate-700">
                                                {topMatches.map((match) => (
                                                    <li key={`${need.id}-${match.volunteer.id}`} className="rounded-md border border-slate-200 bg-white px-2 py-2">
                                                        <p className="font-semibold text-slate-900">
                                                            {match.volunteer.full_name || match.volunteer.email || 'Volunteer'}
                                                        </p>
                                                        <p className="text-xs text-slate-600">
                                                            County: {match.volunteer.county || 'N/A'} | Score: {match.score}
                                                        </p>
                                                        <p className="text-xs text-slate-600">
                                                            Common skills: {match.commonSkills.length > 0 ? match.commonSkills.join(', ') : 'None'}
                                                            {match.countyMatch ? ' | County match' : ''}
                                                        </p>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}

                                        {need.candidate_id === candidateId ? (
                                            <div className="mt-3 rounded-md border border-slate-200 bg-white p-2">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Applications</p>
                                                {applicationsForMyNeeds.filter((application) => application.need_id === need.id).length === 0 ? (
                                                    <p className="mt-1 text-xs text-slate-600">No volunteer applications yet.</p>
                                                ) : (
                                                    <ul className="mt-2 space-y-2">
                                                        {applicationsForMyNeeds
                                                            .filter((application) => application.need_id === need.id)
                                                            .map((application) => {
                                                                const volunteer = volunteersById.get(application.volunteer_id)
                                                                const volunteerLabel = volunteer?.full_name || volunteer?.email || 'Volunteer (profile not created yet)'
                                                                const isUpdating = !!isUpdatingApplicationById[application.id]
                                                                const isContacting = !!isContactingApplicationById[application.id]
                                                                return (
                                                                    <li key={application.id} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                                                                        <p className="text-sm font-semibold text-slate-900">
                                                                            {volunteerLabel}
                                                                        </p>
                                                                        <p className="text-xs text-slate-600">
                                                                            Email: {volunteer?.email || 'N/A'} | County: {volunteer?.county || 'N/A'}
                                                                        </p>
                                                                        <p className="text-xs text-slate-600">
                                                                            Status: {application.status}
                                                                        </p>
                                                                        {application.message ? (
                                                                            <p className="mt-1 text-xs text-slate-700">Message: {application.message}</p>
                                                                        ) : null}
                                                                        {application.status === 'pending' ? (
                                                                            <div className="mt-2 flex flex-wrap gap-2">
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={isUpdating}
                                                                                    onClick={() => updateApplicationStatus(application, 'accepted')}
                                                                                    className="rounded-md bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                                                                                >
                                                                                    {isUpdating ? 'Working...' : 'Accept'}
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={isUpdating}
                                                                                    onClick={() => updateApplicationStatus(application, 'rejected')}
                                                                                    className="rounded-md bg-rose-700 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-60"
                                                                                >
                                                                                    {isUpdating ? 'Working...' : 'Reject'}
                                                                                </button>
                                                                            </div>
                                                                        ) : null}
                                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                                            <button
                                                                                type="button"
                                                                                disabled={isContacting}
                                                                                onClick={() => contactVolunteer(application)}
                                                                                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                                                                            >
                                                                                {isContacting ? 'Sending...' : 'Contact Volunteer'}
                                                                            </button>
                                                                        </div>
                                                                    </li>
                                                                )
                                                            })}
                                                    </ul>
                                                )}
                                            </div>
                                        ) : null}
                                    </article>
                                )
                            })
                        )}
                    </div>
                </div>
            ) : null}

            {canViewVolunteerNeeds ? (
                <div className="mt-6 rounded-xl border border-slate-200 p-4">
                    <h2 className="text-lg font-semibold text-slate-900">Volunteer View: Best Matching Needs</h2>
                    <div className="mt-3 space-y-2">
                        {effectiveVolunteerProfile ? (
                            <p className="text-sm text-slate-700">
                                Profile county: {effectiveVolunteerProfile.county || 'N/A'} | Skills: {(effectiveVolunteerProfile.skills ?? []).join(', ') || 'N/A'}
                            </p>
                        ) : (
                            <p className="text-sm text-amber-700">
                                Create your Volunteer Profile first to apply. You can still browse open needs below.
                            </p>
                        )}

                        {(effectiveVolunteerProfile ? volunteerNeedMatches.length : openNeeds.length) === 0 ? (
                            <div className="space-y-2">
                                <p className="text-sm text-slate-600">No open volunteer needs found yet.</p>
                                {isAdminUser ? (
                                    <button
                                        type="button"
                                        onClick={createSampleNeed}
                                        disabled={isSavingNeed || !previewCandidateTarget}
                                        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                                    >
                                        {isSavingNeed ? 'Creating...' : 'Create Starter Open Need'}
                                    </button>
                                ) : null}
                            </div>
                        ) : (
                            <ul className="space-y-2">
                                {(effectiveVolunteerProfile
                                    ? volunteerNeedMatches.slice(0, 8).map((item) => ({ need: item.need, score: item.score, commonSkills: item.commonSkills, countyMatch: item.countyMatch }))
                                    : openNeeds.slice(0, 8).map((need) => ({ need, score: 0, commonSkills: [] as string[], countyMatch: false }))
                                ).map((item) => (
                                    <li key={item.need.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                                        <p className="font-semibold text-slate-900">{item.need.title}</p>
                                        <p className="text-xs text-slate-600">
                                            County: {item.need.county || 'Any'} | Score: {item.score}
                                        </p>
                                        <p className="text-xs text-slate-600">
                                            Common skills: {item.commonSkills.length > 0 ? item.commonSkills.join(', ') : 'None'}
                                            {item.countyMatch ? ' | County match' : ''}
                                        </p>
                                        {(() => {
                                            const existingApplication = myApplicationsByNeed.get(item.need.id)
                                            if (existingApplication) {
                                                return (
                                                    <div className="mt-2 rounded-md border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700">
                                                        <p>Status: {existingApplication.status}</p>
                                                        {existingApplication.message ? <p>Message: {existingApplication.message}</p> : null}
                                                        {(existingApplication.status === 'pending' || existingApplication.status === 'accepted') ? (
                                                            <button
                                                                type="button"
                                                                disabled={!!isUpdatingApplicationById[existingApplication.id]}
                                                                onClick={() => updateApplicationStatus(existingApplication, 'withdrawn')}
                                                                className="mt-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                                                            >
                                                                {isUpdatingApplicationById[existingApplication.id] ? 'Working...' : 'Withdraw'}
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                )
                                            }

                                            return (
                                                <div className="mt-2 rounded-md border border-slate-200 bg-white p-2">
                                                    <label className="grid gap-1">
                                                        <span className="text-xs font-medium text-slate-700">Message to candidate (optional)</span>
                                                        <textarea
                                                            value={applyMessageByNeed[item.need.id] ?? ''}
                                                            onChange={(event) =>
                                                                setApplyMessageByNeed((prev) => ({
                                                                    ...prev,
                                                                    [item.need.id]: event.target.value,
                                                                }))
                                                            }
                                                            className="min-h-[70px] rounded-md border border-slate-300 px-2 py-1 text-xs"
                                                            placeholder="Introduce yourself and share availability."
                                                        />
                                                    </label>
                                                    <button
                                                        type="button"
                                                        onClick={() => applyToNeed(item.need)}
                                                        disabled={!effectiveVolunteerProfile || !!isApplyingByNeed[item.need.id]}
                                                        className="mt-2 rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                                                    >
                                                        {isApplyingByNeed[item.need.id] ? 'Sending...' : 'Apply / Contact Candidate'}
                                                    </button>
                                                </div>
                                            )
                                        })()}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            ) : null}
        </section>
    )
}

export default VolunteerMatching

