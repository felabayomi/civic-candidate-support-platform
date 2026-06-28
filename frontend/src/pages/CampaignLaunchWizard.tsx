import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import ComplianceResultList from '../components/ComplianceResultList'
import { useAuth } from '../lib/authContext'
import { computeCampaignHealthScore, saveCampaignHealthSnapshot } from '../lib/campaignHealthScore'
import { runCampaignComplianceCheck, type ComplianceResult } from '../lib/complianceEvaluator'
import {
    fetchCampaignProgressSnapshot,
    saveCampaignMilestones,
    saveCampaignProgressSnapshot,
} from '../lib/campaignSetupSync'
import { supabase } from '../lib/supabaseClient'
import { buildUserFacingErrorMessage } from '../lib/userFacingError'

type CandidateRow = {
    id: string
    campaign_name: string
    office_title: string
    jurisdiction: string
    election_date: string | null
    party_affiliation: string | null
}

type WizardStepOne = {
    legalName: string
    preferredCampaignName: string
    address: string
    officeSought: string
    electionCycle: string
    partyAffiliation: string
    contactEmail: string
    contactPhone: string
}

type WizardStepTwo = {
    committeeName: string
    committeeAddress: string
    committeePhone: string
    committeeEmail: string
}

type WizardStepFour = {
    obtainEin: boolean
    openBankAccount: boolean
    recordBankInformation: boolean
    bankName: string
    bankAccountLast4: string
    bankRoutingLast4: string
}

type MilestoneCategory = 'filing' | 'election' | 'fundraising' | 'volunteer'

type LaunchMilestone = {
    id: string
    title: string
    date: string
    category: MilestoneCategory
    done: boolean
}

type WizardStepSix = {
    legalEntityName: string
    contributionIntakeEmail: string
    paymentProcessor: 'stripe' | 'actblue' | 'anedot' | 'other'
    processorAccountReady: boolean
    perDonorContributionLimit: string
    requireDonorDetails: boolean
    complianceNoticeConfirmed: boolean
}

type WizardStepSeven = {
    createdVolunteerNeeds: boolean
    publishedOpportunities: boolean
    invitedSupporters: boolean
    supporterEmails: string
    inviteMessage: string
}

type WizardStepEight = {
    registrationPaperworkUploaded: boolean
    treasurerDocumentationUploaded: boolean
    bankingRecordsUploaded: boolean
    supportingComplianceDocsUploaded: boolean
    additionalDocumentNotes: string
}

type WizardStepNine = {
    reviewedHealthScore: boolean
}

const TOTAL_STEPS = 10
const STEP_ONE = 1
const STEP_TWO = 2
const STEP_THREE = 3
const STEP_FOUR = 4
const STEP_FIVE = 5
const STEP_SIX = 6
const STEP_SEVEN = 7
const STEP_EIGHT = 8
const STEP_NINE = 9
const STEP_TEN = 10
const LAST_IMPLEMENTED_STEP = STEP_TEN

type TreasurerChoice = 'already-have' | 'find-verified' | 'self-serve'

const buildComplianceMilestones = (electionCycle: string): LaunchMilestone[] => {
    const parsedYear = Number.parseInt(electionCycle, 10)
    const year = Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear()

    const toIso = (month: number, day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    return [
        { id: 'filing-jan', title: 'Initial campaign filing due', date: toIso(1, 31), category: 'filing', done: false },
        { id: 'filing-jul', title: 'Mid-year filing deadline', date: toIso(7, 15), category: 'filing', done: false },
        { id: 'filing-oct', title: 'Pre-election filing deadline', date: toIso(10, 15), category: 'filing', done: false },
        { id: 'election-primary', title: 'Primary election milestone', date: toIso(6, 4), category: 'election', done: false },
        { id: 'election-general', title: 'General election day milestone', date: toIso(11, 5), category: 'election', done: false },
        { id: 'fundraising-kickoff', title: 'Fundraising kickoff target', date: toIso(2, 15), category: 'fundraising', done: false },
        { id: 'fundraising-mid', title: 'Mid-cycle fundraising target', date: toIso(8, 1), category: 'fundraising', done: false },
        { id: 'volunteer-early', title: 'Volunteer recruitment target #1', date: toIso(4, 1), category: 'volunteer', done: false },
        { id: 'volunteer-final', title: 'Volunteer recruitment target #2', date: toIso(9, 1), category: 'volunteer', done: false },
    ]
}

const categoryLabel: Record<MilestoneCategory, string> = {
    filing: 'Filing Deadline',
    election: 'Election Milestone',
    fundraising: 'Fundraising Milestone',
    volunteer: 'Volunteer Target',
}

function CampaignLaunchWizard() {
    const { session, role } = useAuth()
    const navigate = useNavigate()
    const userId = useMemo(() => session?.user.id ?? '', [session])
    const userEmail = useMemo(() => session?.user.email ?? '', [session])

    const [hasStarted, setHasStarted] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isSavingStepTwo, setIsSavingStepTwo] = useState(false)
    const [isSavingStepThree, setIsSavingStepThree] = useState(false)
    const [isSavingStepFour, setIsSavingStepFour] = useState(false)
    const [isSavingStepFive, setIsSavingStepFive] = useState(false)
    const [isSavingStepSix, setIsSavingStepSix] = useState(false)
    const [isSavingStepSeven, setIsSavingStepSeven] = useState(false)
    const [isSavingStepEight, setIsSavingStepEight] = useState(false)
    const [isSavingStepNine, setIsSavingStepNine] = useState(false)
    const [statusMessage, setStatusMessage] = useState('')
    const [errorMessage, setErrorMessage] = useState('')
    const [existingCandidateId, setExistingCandidateId] = useState<string | null>(null)
    const [currentStep, setCurrentStep] = useState<number>(STEP_ONE)
    const [isStepTwoComplete, setIsStepTwoComplete] = useState(false)
    const [isStepThreeComplete, setIsStepThreeComplete] = useState(false)
    const [isStepFourComplete, setIsStepFourComplete] = useState(false)
    const [isStepFiveComplete, setIsStepFiveComplete] = useState(false)
    const [isStepSixComplete, setIsStepSixComplete] = useState(false)
    const [isStepSevenComplete, setIsStepSevenComplete] = useState(false)
    const [isStepEightComplete, setIsStepEightComplete] = useState(false)
    const [isStepNineComplete, setIsStepNineComplete] = useState(false)
    const [isStepTenComplete, setIsStepTenComplete] = useState(false)
    const [stepThreeChoice, setStepThreeChoice] = useState<TreasurerChoice>('already-have')
    const [stepFiveView, setStepFiveView] = useState<'list' | 'calendar'>('list')

    const [stepOne, setStepOne] = useState<WizardStepOne>({
        legalName: '',
        preferredCampaignName: '',
        address: '',
        officeSought: '',
        electionCycle: new Date().getFullYear().toString(),
        partyAffiliation: 'unaffiliated',
        contactEmail: '',
        contactPhone: '',
    })

    const [stepTwo, setStepTwo] = useState<WizardStepTwo>({
        committeeName: '',
        committeeAddress: '',
        committeePhone: '',
        committeeEmail: '',
    })

    const [stepFour, setStepFour] = useState<WizardStepFour>({
        obtainEin: false,
        openBankAccount: false,
        recordBankInformation: false,
        bankName: '',
        bankAccountLast4: '',
        bankRoutingLast4: '',
    })

    const [stepFiveMilestones, setStepFiveMilestones] = useState<LaunchMilestone[]>([])

    const [stepSix, setStepSix] = useState<WizardStepSix>({
        legalEntityName: '',
        contributionIntakeEmail: userEmail || '',
        paymentProcessor: 'stripe',
        processorAccountReady: false,
        perDonorContributionLimit: '',
        requireDonorDetails: true,
        complianceNoticeConfirmed: false,
    })

    const [stepSeven, setStepSeven] = useState<WizardStepSeven>({
        createdVolunteerNeeds: false,
        publishedOpportunities: false,
        invitedSupporters: false,
        supporterEmails: '',
        inviteMessage: 'Hi! We are building our campaign volunteer team and would love your support.',
    })

    const [stepEight, setStepEight] = useState<WizardStepEight>({
        registrationPaperworkUploaded: false,
        treasurerDocumentationUploaded: false,
        bankingRecordsUploaded: false,
        supportingComplianceDocsUploaded: false,
        additionalDocumentNotes: '',
    })

    const [stepNine, setStepNine] = useState<WizardStepNine>({
        reviewedHealthScore: false,
    })
    const [ruleCheckResults, setRuleCheckResults] = useState<ComplianceResult[]>([])
    const [isLoadingRuleChecks, setIsLoadingRuleChecks] = useState(false)

    const getStepTitle = (step: number) => {
        if (step === STEP_ONE) return 'Candidate Information'
        if (step === STEP_TWO) return 'Campaign Committee'
        if (step === STEP_THREE) return 'Treasurer'
        if (step === STEP_FOUR) return 'Banking Checklist'
        if (step === STEP_FIVE) return 'Compliance Calendar'
        if (step === STEP_SIX) return 'Fundraising Setup'
        if (step === STEP_SEVEN) return 'Volunteer Recruitment'
        if (step === STEP_EIGHT) return 'Document Checklist'
        if (step === STEP_NINE) return 'Campaign Health Score'
        if (step === STEP_TEN) return 'Launch Dashboard'
        return 'Campaign Launch'
    }

    const completedStepNumbers = useMemo(() => {
        const stepOneComplete =
            !!existingCandidateId ||
            (!!stepOne.legalName.trim() &&
                !!stepOne.preferredCampaignName.trim() &&
                !!stepOne.officeSought.trim() &&
                !!stepOne.address.trim() &&
                !!stepOne.contactEmail.trim())

        const steps: number[] = []
        if (stepOneComplete) steps.push(STEP_ONE)
        if (isStepTwoComplete) steps.push(STEP_TWO)
        if (isStepThreeComplete) steps.push(STEP_THREE)
        if (isStepFourComplete) steps.push(STEP_FOUR)
        if (isStepFiveComplete) steps.push(STEP_FIVE)
        if (isStepSixComplete) steps.push(STEP_SIX)
        if (isStepSevenComplete) steps.push(STEP_SEVEN)
        if (isStepEightComplete) steps.push(STEP_EIGHT)
        if (isStepNineComplete) steps.push(STEP_NINE)
        if (isStepTenComplete) steps.push(STEP_TEN)
        return steps
    }, [
        existingCandidateId,
        stepOne.legalName,
        stepOne.preferredCampaignName,
        stepOne.officeSought,
        stepOne.address,
        stepOne.contactEmail,
        isStepTwoComplete,
        isStepThreeComplete,
        isStepFourComplete,
        isStepFiveComplete,
        isStepSixComplete,
        isStepSevenComplete,
        isStepEightComplete,
        isStepNineComplete,
        isStepTenComplete,
    ])

    const campaignHealth = useMemo(() => {
        return computeCampaignHealthScore({
            candidateProfileComplete:
                !!existingCandidateId ||
                (!!stepOne.legalName.trim() &&
                    !!stepOne.preferredCampaignName.trim() &&
                    !!stepOne.officeSought.trim() &&
                    !!stepOne.address.trim() &&
                    !!stepOne.contactEmail.trim()),
            treasurerAssigned: isStepThreeComplete,
            banking: {
                obtainEin: stepFour.obtainEin,
                openBankAccount: stepFour.openBankAccount,
                recordBankInformation: stepFour.recordBankInformation,
                bankName: stepFour.bankName,
                bankAccountLast4: stepFour.bankAccountLast4,
                bankRoutingLast4: stepFour.bankRoutingLast4,
            },
            compliance: {
                completed: stepFiveMilestones.filter((item) => item.done).length,
                total: stepFiveMilestones.length,
            },
            documents: {
                registrationPaperworkUploaded: stepEight.registrationPaperworkUploaded,
                treasurerDocumentationUploaded: stepEight.treasurerDocumentationUploaded,
                bankingRecordsUploaded: stepEight.bankingRecordsUploaded,
                supportingComplianceDocsUploaded: stepEight.supportingComplianceDocsUploaded,
            },
            finance: {
                legalEntityName: stepSix.legalEntityName,
                contributionIntakeEmail: stepSix.contributionIntakeEmail,
                perDonorContributionLimit: stepSix.perDonorContributionLimit,
                processorAccountReady: stepSix.processorAccountReady,
                requireDonorDetails: stepSix.requireDonorDetails,
                complianceNoticeConfirmed: stepSix.complianceNoticeConfirmed,
            },
            volunteers: {
                createdVolunteerNeeds: stepSeven.createdVolunteerNeeds,
                publishedOpportunities: stepSeven.publishedOpportunities,
                invitedSupporters: stepSeven.invitedSupporters,
                supporterEmails: stepSeven.supporterEmails,
            },
        })
    }, [
        existingCandidateId,
        isStepThreeComplete,
        stepOne.legalName,
        stepOne.preferredCampaignName,
        stepOne.officeSought,
        stepOne.address,
        stepOne.contactEmail,
        stepFour.obtainEin,
        stepFour.openBankAccount,
        stepFour.recordBankInformation,
        stepFour.bankName,
        stepFour.bankAccountLast4,
        stepFour.bankRoutingLast4,
        stepFiveMilestones,
        stepEight.registrationPaperworkUploaded,
        stepEight.treasurerDocumentationUploaded,
        stepEight.bankingRecordsUploaded,
        stepEight.supportingComplianceDocsUploaded,
        stepSix.legalEntityName,
        stepSix.contributionIntakeEmail,
        stepSix.perDonorContributionLimit,
        stepSix.processorAccountReady,
        stepSix.requireDonorDetails,
        stepSix.complianceNoticeConfirmed,
        stepSeven.createdVolunteerNeeds,
        stepSeven.publishedOpportunities,
        stepSeven.invitedSupporters,
        stepSeven.supporterEmails,
    ])

    const readinessCategories = campaignHealth.categories
    const campaignReadinessScore = campaignHealth.score
    const readinessBarText = campaignHealth.barText
    const readinessStatus = campaignHealth.status
    const ruleBlockingCount = useMemo(
        () => ruleCheckResults.filter((result) => !result.passed && result.severity === 'blocking').length,
        [ruleCheckResults]
    )

    const stepFiveCompletionCount = useMemo(
        () => stepFiveMilestones.filter((item) => item.done).length,
        [stepFiveMilestones]
    )

    const stepFiveCalendarMeta = useMemo(() => {
        const parsedYear = Number.parseInt(stepOne.electionCycle, 10)
        const year = Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear()
        const month = 10
        const firstDay = new Date(year, month, 1).getDay()
        const totalDays = new Date(year, month + 1, 0).getDate()
        const startOffset = (firstDay + 6) % 7

        const byDay = new Map<number, LaunchMilestone[]>()
        stepFiveMilestones.forEach((item) => {
            const dateObj = new Date(`${item.date}T00:00:00`)
            if (dateObj.getFullYear() === year && dateObj.getMonth() === month) {
                const day = dateObj.getDate()
                byDay.set(day, [...(byDay.get(day) ?? []), item])
            }
        })

        return {
            year,
            monthLabel: 'November',
            startOffset,
            totalDays,
            byDay,
        }
    }, [stepOne.electionCycle, stepFiveMilestones])

    useEffect(() => {
        if (!userId) return

        const loadInitialData = async () => {
            setIsLoading(true)
            setErrorMessage('')

            const { data: candidateData, error: candidateError } = await supabase
                .from('candidates')
                .select('id, campaign_name, office_title, jurisdiction, election_date, party_affiliation')
                .eq('user_id', userId)
                .maybeSingle<CandidateRow>()

            if (candidateError) {
                setErrorMessage(buildUserFacingErrorMessage({ action: 'load', resource: 'launch wizard data' }))
                setIsLoading(false)
                return
            }

            const { data: userData } = await supabase
                .from('users')
                .select('full_name, email')
                .eq('id', userId)
                .maybeSingle<{ full_name: string | null; email: string | null }>()

            const legalName = userData?.full_name ?? ''
            const contactEmail = userData?.email ?? userEmail
            const savedStepKey = `campaign-launch-current-step-${userId}`
            const savedStepRaw = window.localStorage.getItem(savedStepKey)
            const parsedSavedStep = Number.parseInt(savedStepRaw ?? '', 10)
            const serverProgress = await fetchCampaignProgressSnapshot(userId)
            const serverStep = serverProgress?.currentStep ?? null
            const savedStep = Number.isFinite(parsedSavedStep)
                ? Math.max(STEP_ONE, Math.min(parsedSavedStep, LAST_IMPLEMENTED_STEP))
                : null
            const resumeStep = Math.max(savedStep ?? STEP_ONE, serverStep ?? STEP_ONE)

            if (candidateData?.id) {
                setExistingCandidateId(candidateData.id)
                setCurrentStep(Math.max(STEP_TWO, resumeStep))
                setStepOne((prev) => ({
                    ...prev,
                    legalName: legalName || prev.legalName,
                    preferredCampaignName: candidateData.campaign_name || prev.preferredCampaignName,
                    officeSought: candidateData.office_title || prev.officeSought,
                    address: candidateData.jurisdiction || prev.address,
                    electionCycle: candidateData.election_date ? new Date(candidateData.election_date).getFullYear().toString() : prev.electionCycle,
                    partyAffiliation: candidateData.party_affiliation || prev.partyAffiliation,
                    contactEmail: contactEmail || prev.contactEmail,
                }))
                setHasStarted(true)
            } else {
                if (savedStep || serverStep) {
                    setCurrentStep(resumeStep)
                    setHasStarted(true)
                }
                setStepOne((prev) => ({
                    ...prev,
                    legalName: legalName || prev.legalName,
                    contactEmail: contactEmail || prev.contactEmail,
                }))
            }

            setIsLoading(false)
        }

        loadInitialData()
    }, [userId, userEmail])

    useEffect(() => {
        if (!userId) return
        const draftKey = `campaign-launch-step1-${userId}`
        const storedDraft = window.localStorage.getItem(draftKey)

        if (!storedDraft) return

        try {
            const parsed = JSON.parse(storedDraft) as Partial<WizardStepOne>
            setStepOne((prev) => ({ ...prev, ...parsed }))
        } catch {
            // Ignore malformed local draft and continue with server-loaded state.
        }
    }, [userId])

    useEffect(() => {
        if (!userId) return
        const draftKey = `campaign-launch-step1-${userId}`
        window.localStorage.setItem(draftKey, JSON.stringify(stepOne))
    }, [stepOne, userId])

    useEffect(() => {
        if (!userId) return
        const draftKey = `campaign-launch-step2-${userId}`
        const storedDraft = window.localStorage.getItem(draftKey)

        if (!storedDraft) return

        try {
            const parsed = JSON.parse(storedDraft) as Partial<WizardStepTwo> & { completed?: boolean }
            setStepTwo((prev) => ({
                ...prev,
                committeeName: parsed.committeeName ?? prev.committeeName,
                committeeAddress: parsed.committeeAddress ?? prev.committeeAddress,
                committeePhone: parsed.committeePhone ?? prev.committeePhone,
                committeeEmail: parsed.committeeEmail ?? prev.committeeEmail,
            }))
            if (parsed.completed) {
                setIsStepTwoComplete(true)
            }
        } catch {
            // Ignore malformed local draft and continue.
        }
    }, [userId])

    useEffect(() => {
        if (!userId) return
        const draftKey = `campaign-launch-step2-${userId}`
        window.localStorage.setItem(
            draftKey,
            JSON.stringify({
                ...stepTwo,
                completed: isStepTwoComplete,
            })
        )
    }, [stepTwo, isStepTwoComplete, userId])

    useEffect(() => {
        if (!userId) return
        const draftKey = `campaign-launch-step3-${userId}`
        const storedDraft = window.localStorage.getItem(draftKey)

        if (!storedDraft) return

        try {
            const parsed = JSON.parse(storedDraft) as { choice?: TreasurerChoice; completed?: boolean }
            if (parsed.choice) {
                setStepThreeChoice(parsed.choice)
            }
            if (parsed.completed) {
                setIsStepThreeComplete(true)
            }
        } catch {
            // Ignore malformed local draft and continue.
        }
    }, [userId])

    useEffect(() => {
        if (!userId) return
        const draftKey = `campaign-launch-step3-${userId}`
        window.localStorage.setItem(
            draftKey,
            JSON.stringify({
                choice: stepThreeChoice,
                completed: isStepThreeComplete,
            })
        )
    }, [stepThreeChoice, isStepThreeComplete, userId])

    useEffect(() => {
        if (!userId) return
        const draftKey = `campaign-launch-step4-${userId}`
        const storedDraft = window.localStorage.getItem(draftKey)

        if (!storedDraft) return

        try {
            const parsed = JSON.parse(storedDraft) as Partial<WizardStepFour> & { completed?: boolean }
            setStepFour((prev) => ({
                ...prev,
                obtainEin: parsed.obtainEin ?? prev.obtainEin,
                openBankAccount: parsed.openBankAccount ?? prev.openBankAccount,
                recordBankInformation: parsed.recordBankInformation ?? prev.recordBankInformation,
                bankName: parsed.bankName ?? prev.bankName,
                bankAccountLast4: parsed.bankAccountLast4 ?? prev.bankAccountLast4,
                bankRoutingLast4: parsed.bankRoutingLast4 ?? prev.bankRoutingLast4,
            }))
            if (parsed.completed) {
                setIsStepFourComplete(true)
            }
        } catch {
            // Ignore malformed local draft and continue.
        }
    }, [userId])

    useEffect(() => {
        if (!userId) return
        const draftKey = `campaign-launch-step4-${userId}`
        window.localStorage.setItem(
            draftKey,
            JSON.stringify({
                ...stepFour,
                completed: isStepFourComplete,
            })
        )
    }, [stepFour, isStepFourComplete, userId])

    useEffect(() => {
        if (!userId) return
        const draftKey = `campaign-launch-step5-${userId}`
        const storedDraft = window.localStorage.getItem(draftKey)

        if (!storedDraft) {
            setStepFiveMilestones(buildComplianceMilestones(stepOne.electionCycle))
            return
        }

        try {
            const parsed = JSON.parse(storedDraft) as {
                milestones?: LaunchMilestone[]
                completed?: boolean
                view?: 'list' | 'calendar'
            }
            if (parsed.milestones?.length) {
                setStepFiveMilestones(parsed.milestones)
            } else {
                setStepFiveMilestones(buildComplianceMilestones(stepOne.electionCycle))
            }
            if (typeof parsed.completed === 'boolean') {
                setIsStepFiveComplete(parsed.completed)
            }
            if (parsed.view === 'list' || parsed.view === 'calendar') {
                setStepFiveView(parsed.view)
            }
        } catch {
            setStepFiveMilestones(buildComplianceMilestones(stepOne.electionCycle))
        }
    }, [userId, stepOne.electionCycle])

    useEffect(() => {
        if (!userId) return
        const draftKey = `campaign-launch-step5-${userId}`
        window.localStorage.setItem(
            draftKey,
            JSON.stringify({
                milestones: stepFiveMilestones,
                completed: isStepFiveComplete,
                view: stepFiveView,
            })
        )
    }, [stepFiveMilestones, isStepFiveComplete, stepFiveView, userId])

    useEffect(() => {
        if (!userId) return
        const draftKey = `campaign-launch-step6-${userId}`
        const storedDraft = window.localStorage.getItem(draftKey)

        if (!storedDraft) return

        try {
            const parsed = JSON.parse(storedDraft) as Partial<WizardStepSix> & { completed?: boolean }
            setStepSix((prev) => ({
                ...prev,
                legalEntityName: parsed.legalEntityName ?? prev.legalEntityName,
                contributionIntakeEmail: parsed.contributionIntakeEmail ?? prev.contributionIntakeEmail,
                paymentProcessor: parsed.paymentProcessor ?? prev.paymentProcessor,
                processorAccountReady: parsed.processorAccountReady ?? prev.processorAccountReady,
                perDonorContributionLimit: parsed.perDonorContributionLimit ?? prev.perDonorContributionLimit,
                requireDonorDetails: parsed.requireDonorDetails ?? prev.requireDonorDetails,
                complianceNoticeConfirmed: parsed.complianceNoticeConfirmed ?? prev.complianceNoticeConfirmed,
            }))
            if (typeof parsed.completed === 'boolean') {
                setIsStepSixComplete(parsed.completed)
            }
        } catch {
            // Ignore malformed local draft and continue.
        }
    }, [userId])

    useEffect(() => {
        if (!userId) return
        const draftKey = `campaign-launch-step6-${userId}`
        window.localStorage.setItem(
            draftKey,
            JSON.stringify({
                ...stepSix,
                completed: isStepSixComplete,
            })
        )
    }, [stepSix, isStepSixComplete, userId])

    useEffect(() => {
        if (!userId) return
        const draftKey = `campaign-launch-step7-${userId}`
        const storedDraft = window.localStorage.getItem(draftKey)

        if (!storedDraft) return

        try {
            const parsed = JSON.parse(storedDraft) as Partial<WizardStepSeven> & { completed?: boolean }
            setStepSeven((prev) => ({
                ...prev,
                createdVolunteerNeeds: parsed.createdVolunteerNeeds ?? prev.createdVolunteerNeeds,
                publishedOpportunities: parsed.publishedOpportunities ?? prev.publishedOpportunities,
                invitedSupporters: parsed.invitedSupporters ?? prev.invitedSupporters,
                supporterEmails: parsed.supporterEmails ?? prev.supporterEmails,
                inviteMessage: parsed.inviteMessage ?? prev.inviteMessage,
            }))
            if (typeof parsed.completed === 'boolean') {
                setIsStepSevenComplete(parsed.completed)
            }
        } catch {
            // Ignore malformed local draft and continue.
        }
    }, [userId])

    useEffect(() => {
        if (!userId) return
        const draftKey = `campaign-launch-step7-${userId}`
        window.localStorage.setItem(
            draftKey,
            JSON.stringify({
                ...stepSeven,
                completed: isStepSevenComplete,
            })
        )
    }, [stepSeven, isStepSevenComplete, userId])

    useEffect(() => {
        if (!userId) return
        const draftKey = `campaign-launch-step8-${userId}`
        const storedDraft = window.localStorage.getItem(draftKey)

        if (!storedDraft) return

        try {
            const parsed = JSON.parse(storedDraft) as Partial<WizardStepEight> & { completed?: boolean }
            setStepEight((prev) => ({
                ...prev,
                registrationPaperworkUploaded: parsed.registrationPaperworkUploaded ?? prev.registrationPaperworkUploaded,
                treasurerDocumentationUploaded: parsed.treasurerDocumentationUploaded ?? prev.treasurerDocumentationUploaded,
                bankingRecordsUploaded: parsed.bankingRecordsUploaded ?? prev.bankingRecordsUploaded,
                supportingComplianceDocsUploaded: parsed.supportingComplianceDocsUploaded ?? prev.supportingComplianceDocsUploaded,
                additionalDocumentNotes: parsed.additionalDocumentNotes ?? prev.additionalDocumentNotes,
            }))
            if (typeof parsed.completed === 'boolean') {
                setIsStepEightComplete(parsed.completed)
            }
        } catch {
            // Ignore malformed local draft and continue.
        }
    }, [userId])

    useEffect(() => {
        if (!userId) return
        const draftKey = `campaign-launch-step8-${userId}`
        window.localStorage.setItem(
            draftKey,
            JSON.stringify({
                ...stepEight,
                completed: isStepEightComplete,
            })
        )
    }, [stepEight, isStepEightComplete, userId])

    useEffect(() => {
        if (!userId) return
        const draftKey = `campaign-launch-step9-${userId}`
        const storedDraft = window.localStorage.getItem(draftKey)

        if (!storedDraft) return

        try {
            const parsed = JSON.parse(storedDraft) as Partial<WizardStepNine> & { completed?: boolean }
            setStepNine((prev) => ({
                ...prev,
                reviewedHealthScore: parsed.reviewedHealthScore ?? prev.reviewedHealthScore,
            }))
            if (typeof parsed.completed === 'boolean') {
                setIsStepNineComplete(parsed.completed)
            }
        } catch {
            // Ignore malformed local draft and continue.
        }
    }, [userId])

    useEffect(() => {
        if (!userId) return
        const draftKey = `campaign-launch-step9-${userId}`
        window.localStorage.setItem(
            draftKey,
            JSON.stringify({
                ...stepNine,
                completed: isStepNineComplete,
            })
        )
    }, [stepNine, isStepNineComplete, userId])

    useEffect(() => {
        if (!userId) return
        const stepKey = `campaign-launch-current-step-${userId}`
        window.localStorage.setItem(stepKey, String(currentStep))
    }, [currentStep, userId])

    useEffect(() => {
        if (!userId || !hasStarted) return

        const timer = window.setTimeout(() => {
            void saveCampaignProgressSnapshot({
                userId,
                candidateId: existingCandidateId,
                currentStep,
                totalSteps: TOTAL_STEPS,
                completedSteps: completedStepNumbers,
            })
        }, 500)

        return () => {
            window.clearTimeout(timer)
        }
    }, [userId, hasStarted, existingCandidateId, currentStep, completedStepNumbers])

    useEffect(() => {
        if (!userId || !hasStarted) return

        const timer = window.setTimeout(() => {
            void saveCampaignMilestones({
                userId,
                candidateId: existingCandidateId,
                milestones: stepFiveMilestones.map((item) => ({
                    key: item.id,
                    title: item.title,
                    dueDate: item.date,
                    category: item.category,
                    done: item.done,
                })),
            })
        }, 500)

        return () => {
            window.clearTimeout(timer)
        }
    }, [userId, hasStarted, existingCandidateId, stepFiveMilestones])

    useEffect(() => {
        if (!userId || !hasStarted) return

        const timer = window.setTimeout(() => {
            void saveCampaignHealthSnapshot({
                userId,
                candidateId: existingCandidateId,
                health: campaignHealth,
                source: 'wizard',
            })
        }, 500)

        return () => {
            window.clearTimeout(timer)
        }
    }, [userId, hasStarted, existingCandidateId, campaignHealth])

    useEffect(() => {
        const shouldCheckRules = currentStep === STEP_NINE || currentStep === STEP_TEN
        if (!existingCandidateId || !shouldCheckRules) return

        const loadRuleChecks = async () => {
            setIsLoadingRuleChecks(true)

            const { data: campaign } = await supabase
                .from('campaigns')
                .select('id')
                .eq('candidate_id', existingCandidateId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle<{ id: string }>()

            if (!campaign?.id) {
                setRuleCheckResults([])
                setIsLoadingRuleChecks(false)
                return
            }

            try {
                const results = await runCampaignComplianceCheck(campaign.id)
                setRuleCheckResults(results)
            } catch {
                setRuleCheckResults([])
            } finally {
                setIsLoadingRuleChecks(false)
            }
        }

        void loadRuleChecks()
    }, [existingCandidateId, currentStep])

    const submitStepOne = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!userId) return

        setIsSaving(true)
        setStatusMessage('')
        setErrorMessage('')

        const electionYear = Number.parseInt(stepOne.electionCycle, 10)
        const electionDate = Number.isFinite(electionYear)
            ? `${electionYear}-11-01`
            : null

        const { error: userError } = await supabase
            .from('users')
            .update({
                full_name: stepOne.legalName.trim() || null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', userId)

        if (userError) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'save', resource: 'candidate information' }))
            setIsSaving(false)
            return
        }

        const { data: upsertedCandidate, error: candidateError } = await supabase
            .from('candidates')
            .upsert(
                {
                    user_id: userId,
                    campaign_name: stepOne.preferredCampaignName.trim(),
                    office_title: stepOne.officeSought.trim(),
                    jurisdiction: stepOne.address.trim(),
                    election_date: electionDate,
                    party_affiliation: stepOne.partyAffiliation.trim() || null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id' }
            )
            .select('id')
            .single<{ id: string }>()

        if (candidateError) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'save', resource: 'candidate information' }))
            setIsSaving(false)
            return
        }

        setExistingCandidateId(upsertedCandidate?.id ?? existingCandidateId)
        setStatusMessage('Step 1 saved. Candidate information is now connected to your workspace.')
        setCurrentStep(STEP_TWO)
        setIsSaving(false)
    }

    const submitStepTwo = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        setIsSavingStepTwo(true)
        setStatusMessage('')
        setErrorMessage('')

        // Step 2 currently persists in wizard draft storage until committee backend tables are introduced.
        setIsStepTwoComplete(true)
        setStatusMessage('Campaign committee details saved in launch workflow.')
        setCurrentStep(STEP_THREE)
        setIsSavingStepTwo(false)
    }

    const submitStepThree = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        setIsSavingStepThree(true)
        setStatusMessage('')
        setErrorMessage('')

        setIsStepThreeComplete(true)

        if (stepThreeChoice === 'find-verified') {
            setStatusMessage('Opening Treasurer Marketplace to find a verified treasurer...')
            setIsSavingStepThree(false)
            navigate('/treasurer-marketplace')
            return
        }

        if (stepThreeChoice === 'already-have') {
            setStatusMessage('Treasurer path saved: you already have a treasurer.')
        } else {
            setStatusMessage('Treasurer path saved: self-treasurer selected where permitted.')
        }

        setCurrentStep(STEP_FOUR)

        setIsSavingStepThree(false)
    }

    const submitStepFour = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        setIsSavingStepFour(true)
        setStatusMessage('')
        setErrorMessage('')

        if (stepFour.recordBankInformation) {
            if (!stepFour.bankName.trim() || !stepFour.bankAccountLast4.trim() || !stepFour.bankRoutingLast4.trim()) {
                setErrorMessage('Enter bank name, account last 4, and routing last 4 to complete bank information.')
                setIsSavingStepFour(false)
                return
            }
        }

        const isComplete =
            stepFour.obtainEin &&
            stepFour.openBankAccount &&
            stepFour.recordBankInformation &&
            !!stepFour.bankName.trim() &&
            !!stepFour.bankAccountLast4.trim() &&
            !!stepFour.bankRoutingLast4.trim()

        setIsStepFourComplete(isComplete)
        setStatusMessage(isComplete ? '✓ Banking Checklist Complete' : 'Banking checklist progress saved. You can come back later.')
        setCurrentStep(STEP_FIVE)
        setIsSavingStepFour(false)
    }

    const submitStepFive = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        setIsSavingStepFive(true)
        setStatusMessage('')
        setErrorMessage('')

        const complete = stepFiveMilestones.length > 0 && stepFiveMilestones.every((item) => item.done)
        setIsStepFiveComplete(complete)
        setStatusMessage(
            complete
                ? '✓ Compliance Calendar Complete'
                : 'Compliance calendar saved. Continue checking milestones as they are completed.'
        )
        setCurrentStep(STEP_SIX)
        setIsSavingStepFive(false)
    }

    const submitStepSix = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        setIsSavingStepSix(true)
        setStatusMessage('')
        setErrorMessage('')

        const contributionLimit = Number.parseFloat(stepSix.perDonorContributionLimit)
        if (!stepSix.legalEntityName.trim()) {
            setErrorMessage('Enter the legal campaign entity name before enabling contributions.')
            setIsSavingStepSix(false)
            return
        }

        if (!stepSix.contributionIntakeEmail.trim()) {
            setErrorMessage('Enter the intake email that receives contribution notifications.')
            setIsSavingStepSix(false)
            return
        }

        if (!Number.isFinite(contributionLimit) || contributionLimit <= 0) {
            setErrorMessage('Enter a valid per-donor contribution limit greater than 0.')
            setIsSavingStepSix(false)
            return
        }

        if (!stepSix.processorAccountReady) {
            setErrorMessage('Confirm that your payment processor account is configured before accepting donations.')
            setIsSavingStepSix(false)
            return
        }

        if (!stepSix.requireDonorDetails) {
            setErrorMessage('Enable donor detail collection to keep fundraising records compliant.')
            setIsSavingStepSix(false)
            return
        }

        if (!stepSix.complianceNoticeConfirmed) {
            setErrorMessage('Confirm compliance notice review before turning on contribution intake.')
            setIsSavingStepSix(false)
            return
        }

        setIsStepSixComplete(true)
        setStatusMessage('✓ Fundraising Setup Complete. Your campaign is ready to receive contributions.')
        setCurrentStep(STEP_SEVEN)
        setIsSavingStepSix(false)
    }

    const submitStepSeven = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        setIsSavingStepSeven(true)
        setStatusMessage('')
        setErrorMessage('')

        const emailList = stepSeven.supporterEmails
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0)

        if (stepSeven.invitedSupporters && emailList.length === 0) {
            setErrorMessage('Add at least one supporter email (comma-separated) after marking invite supporters complete.')
            setIsSavingStepSeven(false)
            return
        }

        const hasInvalidEmail = emailList.some((email) => !email.includes('@'))
        if (hasInvalidEmail) {
            setErrorMessage('One or more supporter emails appear invalid. Use comma-separated email addresses.')
            setIsSavingStepSeven(false)
            return
        }

        const isComplete =
            stepSeven.createdVolunteerNeeds &&
            stepSeven.publishedOpportunities &&
            stepSeven.invitedSupporters &&
            emailList.length > 0

        setIsStepSevenComplete(isComplete)
        setStatusMessage(
            isComplete
                ? '✓ Volunteer Recruitment Setup Complete'
                : 'Volunteer recruitment progress saved. Continue when ready.'
        )
        setCurrentStep(STEP_EIGHT)
        setIsSavingStepSeven(false)
    }

    const submitStepEight = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        setIsSavingStepEight(true)
        setStatusMessage('')
        setErrorMessage('')

        const isComplete =
            stepEight.registrationPaperworkUploaded &&
            stepEight.treasurerDocumentationUploaded &&
            stepEight.bankingRecordsUploaded &&
            stepEight.supportingComplianceDocsUploaded

        setIsStepEightComplete(isComplete)
        setStatusMessage(
            isComplete
                ? '✓ Document Checklist Complete'
                : 'Document checklist progress saved. Upload remaining items when available.'
        )
        setCurrentStep(STEP_NINE)
        setIsSavingStepEight(false)
    }

    const submitStepNine = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        setIsSavingStepNine(true)
        setStatusMessage('')
        setErrorMessage('')

        const hasReviewed = stepNine.reviewedHealthScore
        const isComplete = hasReviewed && campaignReadinessScore >= 75 && ruleBlockingCount === 0

        setIsStepNineComplete(isComplete)
        setStatusMessage(
            hasReviewed && ruleBlockingCount === 0
                ? `Campaign Health Score saved at ${campaignReadinessScore}% (${readinessStatus}).`
                : hasReviewed && ruleBlockingCount > 0
                    ? `Rule-based blockers detected (${ruleBlockingCount}). Resolve blockers before launch.`
                    : 'Review and acknowledge the score to save this step.'
        )
        if (hasReviewed && ruleBlockingCount === 0) {
            setCurrentStep(STEP_TEN)
        }
        setIsSavingStepNine(false)
    }

    const toggleMilestoneDone = (id: string) => {
        setStepFiveMilestones((prev) =>
            prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
        )
    }

    const moveStep = (direction: 'back' | 'forward') => {
        setStatusMessage('')
        setErrorMessage('')
        setCurrentStep((prev) => {
            if (direction === 'back') {
                return Math.max(STEP_ONE, prev - 1)
            }
            return Math.min(LAST_IMPLEMENTED_STEP, prev + 1)
        })
    }

    const skipStepForLater = () => {
        if (currentStep >= LAST_IMPLEMENTED_STEP) return
        setStatusMessage(`Step ${currentStep} skipped for now. You can come back later.`)
        setErrorMessage('')
        setCurrentStep((prev) => Math.min(LAST_IMPLEMENTED_STEP, prev + 1))
    }

    if (isLoading) {
        return (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <p className="text-slate-600">Loading launch wizard...</p>
            </section>
        )
    }

    if (role && role !== 'candidate' && role !== 'admin') {
        return (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <h1 className="text-2xl font-semibold text-slate-900">Campaign Launch Wizard</h1>
                <p className="mt-3 text-slate-700">This workflow is designed for candidate onboarding.</p>
            </section>
        )
    }

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            {!hasStarted ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 sm:p-8">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Campaign Launch Wizard</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Welcome to the Civic Candidate Support Platform</h1>
                    <p className="mt-3 text-lg text-slate-800">Let&apos;s launch your campaign.</p>
                    <p className="mt-2 text-sm text-slate-600">Estimated setup time: 20-30 minutes</p>
                    <button
                        type="button"
                        onClick={() => setHasStarted(true)}
                        className="mt-6 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
                    >
                        Start
                    </button>
                </div>
            ) : (
                <>
                    <header className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Campaign Launch Wizard</p>
                        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                            Step {currentStep} of {TOTAL_STEPS}: {getStepTitle(currentStep)}
                        </h1>
                        <div className="mt-3 h-2 w-full rounded-full bg-slate-200">
                            <div
                                className="h-2 rounded-full bg-amber-500"
                                style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
                                aria-hidden
                            />
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => moveStep('back')}
                                disabled={currentStep === STEP_ONE}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            >
                                ← Back
                            </button>
                            <button
                                type="button"
                                onClick={() => moveStep('forward')}
                                disabled={currentStep === LAST_IMPLEMENTED_STEP}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            >
                                Next →
                            </button>
                            <button
                                type="button"
                                onClick={skipStepForLater}
                                disabled={currentStep === LAST_IMPLEMENTED_STEP}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            >
                                Skip for now
                            </button>
                        </div>
                    </header>

                    {currentStep === STEP_ONE ? (
                        <form className="mt-6 grid gap-3" onSubmit={submitStepOne}>
                            <label className="grid gap-1">
                                <span className="text-sm font-medium text-slate-700">Legal name</span>
                                <input
                                    value={stepOne.legalName}
                                    onChange={(event) => setStepOne((prev) => ({ ...prev, legalName: event.target.value }))}
                                    className="rounded-lg border border-slate-300 px-3 py-2"
                                    required
                                />
                            </label>

                            <label className="grid gap-1">
                                <span className="text-sm font-medium text-slate-700">Preferred campaign name</span>
                                <input
                                    value={stepOne.preferredCampaignName}
                                    onChange={(event) => setStepOne((prev) => ({ ...prev, preferredCampaignName: event.target.value }))}
                                    className="rounded-lg border border-slate-300 px-3 py-2"
                                    required
                                />
                            </label>

                            <label className="grid gap-1">
                                <span className="text-sm font-medium text-slate-700">Address</span>
                                <input
                                    value={stepOne.address}
                                    onChange={(event) => setStepOne((prev) => ({ ...prev, address: event.target.value }))}
                                    className="rounded-lg border border-slate-300 px-3 py-2"
                                    placeholder="Street, city, state"
                                    required
                                />
                            </label>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="grid gap-1">
                                    <span className="text-sm font-medium text-slate-700">Office sought</span>
                                    <input
                                        value={stepOne.officeSought}
                                        onChange={(event) => setStepOne((prev) => ({ ...prev, officeSought: event.target.value }))}
                                        className="rounded-lg border border-slate-300 px-3 py-2"
                                        required
                                    />
                                </label>
                                <label className="grid gap-1">
                                    <span className="text-sm font-medium text-slate-700">Election cycle</span>
                                    <input
                                        value={stepOne.electionCycle}
                                        onChange={(event) => setStepOne((prev) => ({ ...prev, electionCycle: event.target.value }))}
                                        className="rounded-lg border border-slate-300 px-3 py-2"
                                        placeholder="2026"
                                        required
                                    />
                                </label>
                            </div>

                            <label className="grid gap-1">
                                <span className="text-sm font-medium text-slate-700">Party affiliation</span>
                                <select
                                    value={stepOne.partyAffiliation}
                                    onChange={(event) => setStepOne((prev) => ({ ...prev, partyAffiliation: event.target.value }))}
                                    className="rounded-lg border border-slate-300 px-3 py-2"
                                >
                                    <option value="unaffiliated">Unaffiliated</option>
                                    <option value="democratic">Democratic</option>
                                    <option value="republican">Republican</option>
                                    <option value="independent">Independent</option>
                                    <option value="other">Other</option>
                                </select>
                            </label>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="grid gap-1">
                                    <span className="text-sm font-medium text-slate-700">Contact email</span>
                                    <input
                                        type="email"
                                        value={stepOne.contactEmail}
                                        onChange={(event) => setStepOne((prev) => ({ ...prev, contactEmail: event.target.value }))}
                                        className="rounded-lg border border-slate-300 px-3 py-2"
                                        required
                                    />
                                </label>
                                <label className="grid gap-1">
                                    <span className="text-sm font-medium text-slate-700">Contact phone</span>
                                    <input
                                        value={stepOne.contactPhone}
                                        onChange={(event) => setStepOne((prev) => ({ ...prev, contactPhone: event.target.value }))}
                                        className="rounded-lg border border-slate-300 px-3 py-2"
                                        placeholder="Optional"
                                    />
                                </label>
                            </div>

                            {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
                            {statusMessage ? <p className="text-sm text-emerald-700">{statusMessage}</p> : null}

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                                >
                                    {isSaving ? 'Saving...' : existingCandidateId ? 'Save Step 1' : 'Save and Continue'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigate('/candidate-profile')}
                                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                    Go to Candidate Profile
                                </button>
                            </div>

                            <p className="text-xs text-slate-500">
                                Step 2-10 will guide compliance setup, treasurer, reporting calendar, and volunteer recruiting workflows.
                            </p>
                        </form>
                    ) : currentStep === STEP_TWO ? (
                        <form className="mt-6 grid gap-3" onSubmit={submitStepTwo}>
                            <label className="grid gap-1">
                                <span className="text-sm font-medium text-slate-700">Campaign committee name</span>
                                <input
                                    value={stepTwo.committeeName}
                                    onChange={(event) => setStepTwo((prev) => ({ ...prev, committeeName: event.target.value }))}
                                    className="rounded-lg border border-slate-300 px-3 py-2"
                                    required
                                />
                            </label>

                            <label className="grid gap-1">
                                <span className="text-sm font-medium text-slate-700">Committee address</span>
                                <input
                                    value={stepTwo.committeeAddress}
                                    onChange={(event) => setStepTwo((prev) => ({ ...prev, committeeAddress: event.target.value }))}
                                    className="rounded-lg border border-slate-300 px-3 py-2"
                                    required
                                />
                            </label>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="grid gap-1">
                                    <span className="text-sm font-medium text-slate-700">Committee phone</span>
                                    <input
                                        value={stepTwo.committeePhone}
                                        onChange={(event) => setStepTwo((prev) => ({ ...prev, committeePhone: event.target.value }))}
                                        className="rounded-lg border border-slate-300 px-3 py-2"
                                        required
                                    />
                                </label>
                                <label className="grid gap-1">
                                    <span className="text-sm font-medium text-slate-700">Committee email</span>
                                    <input
                                        type="email"
                                        value={stepTwo.committeeEmail}
                                        onChange={(event) => setStepTwo((prev) => ({ ...prev, committeeEmail: event.target.value }))}
                                        className="rounded-lg border border-slate-300 px-3 py-2"
                                        required
                                    />
                                </label>
                            </div>

                            {isStepTwoComplete ? (
                                <p className="text-sm font-semibold text-emerald-700">✓ Campaign Committee Created</p>
                            ) : null}

                            {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
                            {statusMessage ? <p className="text-sm text-emerald-700">{statusMessage}</p> : null}

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCurrentStep(STEP_ONE)}
                                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                    Back to Step 1
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingStepTwo}
                                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                                >
                                    {isSavingStepTwo ? 'Saving...' : 'Save Step 2'}
                                </button>
                            </div>
                        </form>
                    ) : currentStep === STEP_THREE ? (
                        <form className="mt-6 grid gap-3" onSubmit={submitStepThree}>
                            <p className="text-sm text-slate-700">Choose how you want to handle your campaign treasurer:</p>

                            <label className="flex items-start gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                                <input
                                    type="radio"
                                    name="treasurer-choice"
                                    checked={stepThreeChoice === 'already-have'}
                                    onChange={() => setStepThreeChoice('already-have')}
                                    className="mt-1"
                                />
                                <span className="text-sm text-slate-800">I already have a treasurer</span>
                            </label>

                            <label className="flex items-start gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                                <input
                                    type="radio"
                                    name="treasurer-choice"
                                    checked={stepThreeChoice === 'find-verified'}
                                    onChange={() => setStepThreeChoice('find-verified')}
                                    className="mt-1"
                                />
                                <span className="text-sm text-slate-800">Find a verified treasurer</span>
                            </label>

                            <label className="flex items-start gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                                <input
                                    type="radio"
                                    name="treasurer-choice"
                                    checked={stepThreeChoice === 'self-serve'}
                                    onChange={() => setStepThreeChoice('self-serve')}
                                    className="mt-1"
                                />
                                <span className="text-sm text-slate-800">Serve as my own treasurer (where permitted)</span>
                            </label>

                            {isStepThreeComplete ? (
                                <p className="text-sm font-semibold text-emerald-700">✓ Treasurer Path Selected</p>
                            ) : null}

                            {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
                            {statusMessage ? <p className="text-sm text-emerald-700">{statusMessage}</p> : null}

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCurrentStep(STEP_TWO)}
                                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                    Back to Step 2
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingStepThree}
                                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                                >
                                    {stepThreeChoice === 'find-verified'
                                        ? (isSavingStepThree ? 'Opening...' : 'Find Verified Treasurer')
                                        : (isSavingStepThree ? 'Saving...' : 'Save Step 3')}
                                </button>
                            </div>
                        </form>
                    ) : currentStep === STEP_FOUR ? (
                        <form className="mt-6 grid gap-3" onSubmit={submitStepFour}>
                            <p className="text-sm text-slate-700">
                                Complete these setup tasks to prepare campaign banking. Mark each item as done as you progress.
                            </p>

                            <label className="flex items-start gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={stepFour.obtainEin}
                                    onChange={(event) =>
                                        setStepFour((prev) => ({
                                            ...prev,
                                            obtainEin: event.target.checked,
                                        }))
                                    }
                                    className="mt-1"
                                />
                                <span className="text-sm text-slate-800">Obtain EIN (if needed)</span>
                            </label>

                            <label className="flex items-start gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={stepFour.openBankAccount}
                                    onChange={(event) =>
                                        setStepFour((prev) => ({
                                            ...prev,
                                            openBankAccount: event.target.checked,
                                        }))
                                    }
                                    className="mt-1"
                                />
                                <span className="text-sm text-slate-800">Open campaign bank account</span>
                            </label>

                            <label className="flex items-start gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={stepFour.recordBankInformation}
                                    onChange={(event) =>
                                        setStepFour((prev) => ({
                                            ...prev,
                                            recordBankInformation: event.target.checked,
                                        }))
                                    }
                                    className="mt-1"
                                />
                                <span className="text-sm text-slate-800">Record bank information</span>
                            </label>

                            {stepFour.recordBankInformation ? (
                                <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
                                    <label className="grid gap-1">
                                        <span className="text-sm font-medium text-slate-700">Bank name</span>
                                        <input
                                            value={stepFour.bankName}
                                            onChange={(event) =>
                                                setStepFour((prev) => ({
                                                    ...prev,
                                                    bankName: event.target.value,
                                                }))
                                            }
                                            className="rounded-lg border border-slate-300 px-3 py-2"
                                        />
                                    </label>
                                    <label className="grid gap-1">
                                        <span className="text-sm font-medium text-slate-700">Account last 4</span>
                                        <input
                                            value={stepFour.bankAccountLast4}
                                            onChange={(event) =>
                                                setStepFour((prev) => ({
                                                    ...prev,
                                                    bankAccountLast4: event.target.value,
                                                }))
                                            }
                                            maxLength={4}
                                            className="rounded-lg border border-slate-300 px-3 py-2"
                                        />
                                    </label>
                                    <label className="grid gap-1">
                                        <span className="text-sm font-medium text-slate-700">Routing last 4</span>
                                        <input
                                            value={stepFour.bankRoutingLast4}
                                            onChange={(event) =>
                                                setStepFour((prev) => ({
                                                    ...prev,
                                                    bankRoutingLast4: event.target.value,
                                                }))
                                            }
                                            maxLength={4}
                                            className="rounded-lg border border-slate-300 px-3 py-2"
                                        />
                                    </label>
                                </div>
                            ) : null}

                            {isStepFourComplete ? (
                                <p className="text-sm font-semibold text-emerald-700">✓ Banking Checklist Complete</p>
                            ) : null}

                            {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
                            {statusMessage ? <p className="text-sm text-emerald-700">{statusMessage}</p> : null}

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCurrentStep(STEP_THREE)}
                                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                    Back to Step 3
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingStepFour}
                                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                                >
                                    {isSavingStepFour ? 'Saving...' : 'Save Step 4'}
                                </button>
                            </div>
                        </form>
                    ) : currentStep === STEP_FIVE ? (
                        <form className="mt-6 grid gap-3" onSubmit={submitStepFive}>
                            <p className="text-sm text-slate-700">
                                Filing deadlines, election milestones, fundraising milestones, and volunteer recruitment targets
                                were auto-generated from your election cycle.
                            </p>

                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setStepFiveView('list')}
                                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${stepFiveView === 'list' ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'
                                        }`}
                                >
                                    List View
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStepFiveView('calendar')}
                                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${stepFiveView === 'calendar' ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'
                                        }`}
                                >
                                    Calendar View
                                </button>
                            </div>

                            {stepFiveView === 'list' ? (
                                <ul className="space-y-2">
                                    {stepFiveMilestones.map((item) => (
                                        <li key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                            <label className="flex items-start gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={item.done}
                                                    onChange={() => toggleMilestoneDone(item.id)}
                                                    className="mt-1"
                                                />
                                                <span className="text-sm text-slate-800">
                                                    <span className="font-semibold">{item.title}</span>
                                                    <span className="block text-xs text-slate-600">
                                                        {categoryLabel[item.category]} | {new Date(`${item.date}T00:00:00`).toLocaleDateString()}
                                                    </span>
                                                </span>
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <p className="text-sm font-semibold text-slate-800">
                                        {stepFiveCalendarMeta.monthLabel} {stepFiveCalendarMeta.year}
                                    </p>
                                    <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-600">
                                        <span>Mon</span>
                                        <span>Tue</span>
                                        <span>Wed</span>
                                        <span>Thu</span>
                                        <span>Fri</span>
                                        <span>Sat</span>
                                        <span>Sun</span>
                                    </div>
                                    <div className="mt-1 grid grid-cols-7 gap-1">
                                        {Array.from({ length: stepFiveCalendarMeta.startOffset }).map((_, index) => (
                                            <div key={`empty-${index}`} className="h-20 rounded border border-transparent" />
                                        ))}
                                        {Array.from({ length: stepFiveCalendarMeta.totalDays }).map((_, index) => {
                                            const day = index + 1
                                            const entries = stepFiveCalendarMeta.byDay.get(day) ?? []
                                            return (
                                                <div key={`day-${day}`} className="h-20 rounded border border-slate-200 bg-white p-1 text-xs">
                                                    <p className="font-semibold text-slate-700">{day}</p>
                                                    {entries.slice(0, 2).map((entry) => (
                                                        <p key={entry.id} className="truncate text-[10px] text-slate-700">
                                                            {entry.title}
                                                        </p>
                                                    ))}
                                                    {entries.length > 2 ? (
                                                        <p className="text-[10px] text-slate-500">+{entries.length - 2} more</p>
                                                    ) : null}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            <p className="text-sm text-slate-700">
                                Completed: {stepFiveCompletionCount}/{stepFiveMilestones.length}
                            </p>

                            {isStepFiveComplete ? (
                                <p className="text-sm font-semibold text-emerald-700">✓ Compliance Calendar Complete</p>
                            ) : null}

                            {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
                            {statusMessage ? <p className="text-sm text-emerald-700">{statusMessage}</p> : null}

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCurrentStep(STEP_FOUR)}
                                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                    Back to Step 4
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingStepFive}
                                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                                >
                                    {isSavingStepFive ? 'Saving...' : 'Save Step 5'}
                                </button>
                            </div>
                        </form>
                    ) : currentStep === STEP_SIX ? (
                        <form className="mt-6 grid gap-3" onSubmit={submitStepSix}>
                            <p className="text-sm text-slate-700">
                                Prepare your campaign to receive contributions by providing and validating required fundraising intake settings.
                            </p>

                            <label className="grid gap-1">
                                <span className="text-sm font-medium text-slate-700">Legal campaign entity name</span>
                                <input
                                    value={stepSix.legalEntityName}
                                    onChange={(event) => setStepSix((prev) => ({ ...prev, legalEntityName: event.target.value }))}
                                    className="rounded-lg border border-slate-300 px-3 py-2"
                                    required
                                />
                            </label>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="grid gap-1">
                                    <span className="text-sm font-medium text-slate-700">Contribution intake email</span>
                                    <input
                                        type="email"
                                        value={stepSix.contributionIntakeEmail}
                                        onChange={(event) => setStepSix((prev) => ({ ...prev, contributionIntakeEmail: event.target.value }))}
                                        className="rounded-lg border border-slate-300 px-3 py-2"
                                        required
                                    />
                                </label>
                                <label className="grid gap-1">
                                    <span className="text-sm font-medium text-slate-700">Per-donor contribution limit</span>
                                    <input
                                        type="number"
                                        min="1"
                                        step="0.01"
                                        value={stepSix.perDonorContributionLimit}
                                        onChange={(event) => setStepSix((prev) => ({ ...prev, perDonorContributionLimit: event.target.value }))}
                                        className="rounded-lg border border-slate-300 px-3 py-2"
                                        required
                                    />
                                </label>
                            </div>

                            <label className="grid gap-1">
                                <span className="text-sm font-medium text-slate-700">Payment processor</span>
                                <select
                                    value={stepSix.paymentProcessor}
                                    onChange={(event) => setStepSix((prev) => ({
                                        ...prev,
                                        paymentProcessor: event.target.value as WizardStepSix['paymentProcessor'],
                                    }))}
                                    className="rounded-lg border border-slate-300 px-3 py-2"
                                >
                                    <option value="stripe">Stripe</option>
                                    <option value="actblue">ActBlue</option>
                                    <option value="anedot">Anedot</option>
                                    <option value="other">Other</option>
                                </select>
                            </label>

                            <label className="flex items-start gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={stepSix.processorAccountReady}
                                    onChange={(event) => setStepSix((prev) => ({ ...prev, processorAccountReady: event.target.checked }))}
                                    className="mt-1"
                                />
                                <span className="text-sm text-slate-800">Payment processor account is configured and ready to accept live contributions</span>
                            </label>

                            <label className="flex items-start gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={stepSix.requireDonorDetails}
                                    onChange={(event) => setStepSix((prev) => ({ ...prev, requireDonorDetails: event.target.checked }))}
                                    className="mt-1"
                                />
                                <span className="text-sm text-slate-800">Collect donor details (name, amount, date, and reference metadata) before accepting donations</span>
                            </label>

                            <label className="flex items-start gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={stepSix.complianceNoticeConfirmed}
                                    onChange={(event) => setStepSix((prev) => ({ ...prev, complianceNoticeConfirmed: event.target.checked }))}
                                    className="mt-1"
                                />
                                <span className="text-sm text-slate-800">I reviewed state and local fundraising compliance requirements for my campaign</span>
                            </label>

                            {isStepSixComplete ? (
                                <p className="text-sm font-semibold text-emerald-700">✓ Fundraising Setup Complete</p>
                            ) : null}

                            {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
                            {statusMessage ? <p className="text-sm text-emerald-700">{statusMessage}</p> : null}

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCurrentStep(STEP_FIVE)}
                                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                    Back to Step 5
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingStepSix}
                                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                                >
                                    {isSavingStepSix ? 'Validating...' : 'Validate and Save Step 6'}
                                </button>
                            </div>
                        </form>
                    ) : currentStep === STEP_SEVEN ? (
                        <form className="mt-6 grid gap-3" onSubmit={submitStepSeven}>
                            <p className="text-sm text-slate-700">
                                Set up your volunteer recruitment flow so supporters can discover and join campaign opportunities.
                            </p>

                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <label className="flex items-start gap-2">
                                    <input
                                        type="checkbox"
                                        checked={stepSeven.createdVolunteerNeeds}
                                        onChange={(event) =>
                                            setStepSeven((prev) => ({
                                                ...prev,
                                                createdVolunteerNeeds: event.target.checked,
                                            }))
                                        }
                                        className="mt-1"
                                    />
                                    <span className="text-sm text-slate-800">
                                        Create volunteer needs
                                        <span className="block text-xs text-slate-600">Define roles, skills, and timing for your campaign.</span>
                                    </span>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => navigate('/volunteer-matching')}
                                    className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                    Open Volunteer Matching
                                </button>
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <label className="flex items-start gap-2">
                                    <input
                                        type="checkbox"
                                        checked={stepSeven.publishedOpportunities}
                                        onChange={(event) =>
                                            setStepSeven((prev) => ({
                                                ...prev,
                                                publishedOpportunities: event.target.checked,
                                            }))
                                        }
                                        className="mt-1"
                                    />
                                    <span className="text-sm text-slate-800">
                                        Publish opportunities
                                        <span className="block text-xs text-slate-600">Set open status and ensure opportunities are visible to volunteers.</span>
                                    </span>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => navigate('/volunteer-matching')}
                                    className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                    Review Published Needs
                                </button>
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <label className="flex items-start gap-2">
                                    <input
                                        type="checkbox"
                                        checked={stepSeven.invitedSupporters}
                                        onChange={(event) =>
                                            setStepSeven((prev) => ({
                                                ...prev,
                                                invitedSupporters: event.target.checked,
                                            }))
                                        }
                                        className="mt-1"
                                    />
                                    <span className="text-sm text-slate-800">
                                        Invite supporters
                                        <span className="block text-xs text-slate-600">Add supporter emails and draft invitation copy.</span>
                                    </span>
                                </label>

                                <label className="mt-2 grid gap-1">
                                    <span className="text-xs font-medium text-slate-700">Supporter emails (comma-separated)</span>
                                    <input
                                        value={stepSeven.supporterEmails}
                                        onChange={(event) =>
                                            setStepSeven((prev) => ({
                                                ...prev,
                                                supporterEmails: event.target.value,
                                            }))
                                        }
                                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                        placeholder="supporter1@email.com, supporter2@email.com"
                                    />
                                </label>

                                <label className="mt-2 grid gap-1">
                                    <span className="text-xs font-medium text-slate-700">Invite message</span>
                                    <textarea
                                        value={stepSeven.inviteMessage}
                                        onChange={(event) =>
                                            setStepSeven((prev) => ({
                                                ...prev,
                                                inviteMessage: event.target.value,
                                            }))
                                        }
                                        className="min-h-[90px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                    />
                                </label>
                            </div>

                            {isStepSevenComplete ? (
                                <p className="text-sm font-semibold text-emerald-700">✓ Volunteer Recruitment Setup Complete</p>
                            ) : null}

                            {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
                            {statusMessage ? <p className="text-sm text-emerald-700">{statusMessage}</p> : null}

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCurrentStep(STEP_SIX)}
                                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                    Back to Step 6
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingStepSeven}
                                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                                >
                                    {isSavingStepSeven ? 'Saving...' : 'Save Step 7'}
                                </button>
                            </div>
                        </form>
                    ) : currentStep === STEP_EIGHT ? (
                        <form className="mt-6 grid gap-3" onSubmit={submitStepEight}>
                            <p className="text-sm text-slate-700">
                                Upload key campaign records so your filing and audit workflows are complete and easy to verify.
                            </p>

                            <label className="flex items-start gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={stepEight.registrationPaperworkUploaded}
                                    onChange={(event) =>
                                        setStepEight((prev) => ({
                                            ...prev,
                                            registrationPaperworkUploaded: event.target.checked,
                                        }))
                                    }
                                    className="mt-1"
                                />
                                <span className="text-sm text-slate-800">Registration paperwork uploaded</span>
                            </label>

                            <label className="flex items-start gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={stepEight.treasurerDocumentationUploaded}
                                    onChange={(event) =>
                                        setStepEight((prev) => ({
                                            ...prev,
                                            treasurerDocumentationUploaded: event.target.checked,
                                        }))
                                    }
                                    className="mt-1"
                                />
                                <span className="text-sm text-slate-800">Treasurer documentation uploaded</span>
                            </label>

                            <label className="flex items-start gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={stepEight.bankingRecordsUploaded}
                                    onChange={(event) =>
                                        setStepEight((prev) => ({
                                            ...prev,
                                            bankingRecordsUploaded: event.target.checked,
                                        }))
                                    }
                                    className="mt-1"
                                />
                                <span className="text-sm text-slate-800">Banking records uploaded</span>
                            </label>

                            <label className="flex items-start gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={stepEight.supportingComplianceDocsUploaded}
                                    onChange={(event) =>
                                        setStepEight((prev) => ({
                                            ...prev,
                                            supportingComplianceDocsUploaded: event.target.checked,
                                        }))
                                    }
                                    className="mt-1"
                                />
                                <span className="text-sm text-slate-800">Supporting compliance documents uploaded</span>
                            </label>

                            <label className="grid gap-1">
                                <span className="text-sm font-medium text-slate-700">Additional document notes (optional)</span>
                                <textarea
                                    value={stepEight.additionalDocumentNotes}
                                    onChange={(event) =>
                                        setStepEight((prev) => ({
                                            ...prev,
                                            additionalDocumentNotes: event.target.value,
                                        }))
                                    }
                                    className="min-h-[80px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                    placeholder="Add notes about pending uploads, document versions, or missing records."
                                />
                            </label>

                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                                <p className="text-sm text-amber-900">Need to upload now? Open Documents and attach files by category.</p>
                                <button
                                    type="button"
                                    onClick={() => navigate('/documents')}
                                    className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                    Open Documents
                                </button>
                            </div>

                            {isStepEightComplete ? (
                                <p className="text-sm font-semibold text-emerald-700">✓ Document Checklist Complete</p>
                            ) : null}

                            {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
                            {statusMessage ? <p className="text-sm text-emerald-700">{statusMessage}</p> : null}

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCurrentStep(STEP_SEVEN)}
                                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                    Back to Step 7
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingStepEight}
                                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                                >
                                    {isSavingStepEight ? 'Saving...' : 'Save Step 8'}
                                </button>
                            </div>
                        </form>
                    ) : currentStep === STEP_NINE ? (
                        <form className="mt-6 grid gap-3" onSubmit={submitStepNine}>
                            <p className="text-sm text-slate-700">
                                Your Campaign Health Score summarizes readiness across setup, compliance, operations, and reporting.
                            </p>

                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Campaign Readiness</p>
                                <p className="mt-2 text-xl font-semibold text-slate-900">
                                    {readinessBarText} {campaignReadinessScore}% {readinessStatus}
                                </p>
                                <div className="mt-3 h-2.5 w-full rounded-full bg-slate-200" aria-hidden>
                                    <div
                                        className="h-2.5 rounded-full bg-emerald-500"
                                        style={{ width: `${campaignReadinessScore}%` }}
                                    />
                                </div>
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-white">
                                <ul className="divide-y divide-slate-200">
                                    {readinessCategories.map((category) => (
                                        <li key={category.label} className="flex items-center justify-between px-3 py-2">
                                            <span className="text-sm text-slate-700">{category.label}</span>
                                            <span className="text-sm font-semibold text-slate-900">{category.score}%</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <p className="text-sm font-semibold text-slate-800">Rule-Based Setup Blockers</p>
                                {isLoadingRuleChecks ? <p className="mt-1 text-sm text-slate-600">Checking active compliance rules...</p> : null}
                                {!isLoadingRuleChecks && ruleCheckResults.length === 0 ? (
                                    <p className="mt-1 text-sm text-slate-600">No active rule-set evaluation available for this campaign yet.</p>
                                ) : null}
                                {ruleCheckResults.length > 0 ? (
                                    <>
                                        <p className="mt-1 text-sm text-slate-700">Blocking issues: {ruleBlockingCount}</p>
                                        <div className="mt-2">
                                            <ComplianceResultList results={ruleCheckResults} />
                                        </div>
                                    </>
                                ) : null}
                            </div>

                            <label className="flex items-start gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={stepNine.reviewedHealthScore}
                                    onChange={(event) =>
                                        setStepNine((prev) => ({
                                            ...prev,
                                            reviewedHealthScore: event.target.checked,
                                        }))
                                    }
                                    className="mt-1"
                                />
                                <span className="text-sm text-slate-800">I reviewed this score and will use it as my campaign readiness benchmark.</span>
                            </label>

                            {isStepNineComplete ? (
                                <p className="text-sm font-semibold text-emerald-700">✓ Campaign Health Score Saved</p>
                            ) : null}

                            {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
                            {statusMessage ? <p className="text-sm text-emerald-700">{statusMessage}</p> : null}

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCurrentStep(STEP_EIGHT)}
                                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                    Back to Step 8
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingStepNine}
                                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                                >
                                    {isSavingStepNine ? 'Saving...' : 'Save Step 9'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Launch Dashboard</p>
                            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Congratulations!</h2>
                            <p className="mt-2 text-sm text-slate-700">Your campaign has been successfully set up.</p>
                            <p className="text-sm text-slate-700">Continue to your Dashboard.</p>
                            {ruleBlockingCount > 0 ? (
                                <p className="mt-2 text-sm font-semibold text-red-700">
                                    Resolve {ruleBlockingCount} blocking compliance issue(s) before final filing submissions.
                                </p>
                            ) : null}

                            {errorMessage ? <p className="mt-3 text-sm text-red-600">{errorMessage}</p> : null}
                            {statusMessage ? <p className="mt-3 text-sm text-emerald-700">{statusMessage}</p> : null}

                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsStepTenComplete(true)
                                        setStatusMessage('Campaign launch complete. Opening dashboard...')
                                        navigate('/dashboard')
                                    }}
                                    className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
                                >
                                    Continue to your Dashboard
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCurrentStep(STEP_NINE)}
                                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                    Back to Step 9
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </section>
    )
}

export default CampaignLaunchWizard
