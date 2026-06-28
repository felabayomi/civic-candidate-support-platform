import { supabase } from './supabaseClient'

export type CampaignHealthCategory = {
    label: string
    score: number
}

export type CampaignHealthScoreResult = {
    categories: CampaignHealthCategory[]
    score: number
    barText: string
    status: 'Ready for Filing' | 'Nearly Ready' | 'In Progress' | 'Early Setup'
}

export type CampaignHealthInputs = {
    candidateProfileComplete: boolean
    treasurerAssigned: boolean
    banking: {
        obtainEin: boolean
        openBankAccount: boolean
        recordBankInformation: boolean
        bankName: string
        bankAccountLast4: string
        bankRoutingLast4: string
    }
    compliance: {
        completed: number
        total: number
    }
    documents: {
        registrationPaperworkUploaded: boolean
        treasurerDocumentationUploaded: boolean
        bankingRecordsUploaded: boolean
        supportingComplianceDocsUploaded: boolean
    }
    finance: {
        legalEntityName: string
        contributionIntakeEmail: string
        perDonorContributionLimit: string
        processorAccountReady: boolean
        requireDonorDetails: boolean
        complianceNoticeConfirmed: boolean
    }
    volunteers: {
        createdVolunteerNeeds: boolean
        publishedOpportunities: boolean
        invitedSupporters: boolean
        supporterEmails: string
    }
}

type StepThreeDraft = {
    completed?: boolean
}

type StepFourDraft = {
    obtainEin?: boolean
    openBankAccount?: boolean
    recordBankInformation?: boolean
    bankName?: string
    bankAccountLast4?: string
    bankRoutingLast4?: string
}

type StepFiveDraft = {
    milestones?: Array<{ done?: boolean }>
}

type StepSixDraft = {
    legalEntityName?: string
    contributionIntakeEmail?: string
    perDonorContributionLimit?: string
    processorAccountReady?: boolean
    requireDonorDetails?: boolean
    complianceNoticeConfirmed?: boolean
}

type StepSevenDraft = {
    createdVolunteerNeeds?: boolean
    publishedOpportunities?: boolean
    invitedSupporters?: boolean
    supporterEmails?: string
}

type StepEightDraft = {
    registrationPaperworkUploaded?: boolean
    treasurerDocumentationUploaded?: boolean
    bankingRecordsUploaded?: boolean
    supportingComplianceDocsUploaded?: boolean
}

type CampaignHealthRow = {
    user_id: string
    overall_score: number
    readiness_status: CampaignHealthScoreResult['status']
    readiness_bar_text: string
    category_scores: Record<string, number> | null
}

const CATEGORY_ORDER = [
    'Candidate profile',
    'Treasurer assigned',
    'Banking',
    'Compliance',
    'Documents',
    'Finance',
    'Volunteers',
    'Reporting',
] as const

const clampPercentage = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

const getStatus = (score: number): CampaignHealthScoreResult['status'] => {
    if (score >= 90) return 'Ready for Filing'
    if (score >= 75) return 'Nearly Ready'
    if (score >= 50) return 'In Progress'
    return 'Early Setup'
}

const categoriesToRecord = (categories: CampaignHealthCategory[]): Record<string, number> => {
    return categories.reduce<Record<string, number>>((acc, category) => {
        acc[category.label] = category.score
        return acc
    }, {})
}

const recordToCategories = (record: Record<string, number> | null): CampaignHealthCategory[] => {
    return CATEGORY_ORDER.map((label) => ({
        label,
        score: clampPercentage(record?.[label] ?? 0),
    }))
}

const buildBarText = (score: number) => {
    const totalBlocks = 10
    const filledBlocks = Math.round((score / 100) * totalBlocks)
    return `${'█'.repeat(filledBlocks)}${'░'.repeat(totalBlocks - filledBlocks)}`
}

export const computeCampaignHealthScore = (inputs: CampaignHealthInputs): CampaignHealthScoreResult => {
    const bankingChecks = [
        inputs.banking.obtainEin,
        inputs.banking.openBankAccount,
        inputs.banking.recordBankInformation,
        !!inputs.banking.bankName.trim(),
        !!inputs.banking.bankAccountLast4.trim(),
        !!inputs.banking.bankRoutingLast4.trim(),
    ]
    const banking = clampPercentage((bankingChecks.filter(Boolean).length / bankingChecks.length) * 100)

    const compliance =
        inputs.compliance.total > 0
            ? clampPercentage((inputs.compliance.completed / inputs.compliance.total) * 100)
            : 0

    const documentChecks = [
        inputs.documents.registrationPaperworkUploaded,
        inputs.documents.treasurerDocumentationUploaded,
        inputs.documents.bankingRecordsUploaded,
        inputs.documents.supportingComplianceDocsUploaded,
    ]
    const documents = clampPercentage((documentChecks.filter(Boolean).length / documentChecks.length) * 100)

    const limitValue = Number.parseFloat(inputs.finance.perDonorContributionLimit)
    const financeChecks = [
        !!inputs.finance.legalEntityName.trim(),
        !!inputs.finance.contributionIntakeEmail.trim(),
        Number.isFinite(limitValue) && limitValue > 0,
        inputs.finance.processorAccountReady,
        inputs.finance.requireDonorDetails,
        inputs.finance.complianceNoticeConfirmed,
    ]
    const finance = clampPercentage((financeChecks.filter(Boolean).length / financeChecks.length) * 100)

    const volunteerEmailCount = inputs.volunteers.supporterEmails
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0).length
    const volunteerChecks = [
        inputs.volunteers.createdVolunteerNeeds,
        inputs.volunteers.publishedOpportunities,
        inputs.volunteers.invitedSupporters,
        volunteerEmailCount > 0,
    ]
    const volunteers = clampPercentage((volunteerChecks.filter(Boolean).length / volunteerChecks.length) * 100)

    const reportingChecks = [
        compliance >= 70,
        documents >= 75,
        finance >= 75,
    ]
    const reporting = clampPercentage((reportingChecks.filter(Boolean).length / reportingChecks.length) * 100)

    const categories: CampaignHealthCategory[] = [
        { label: 'Candidate profile', score: inputs.candidateProfileComplete ? 100 : 0 },
        { label: 'Treasurer assigned', score: inputs.treasurerAssigned ? 100 : 0 },
        { label: 'Banking', score: banking },
        { label: 'Compliance', score: compliance },
        { label: 'Documents', score: documents },
        { label: 'Finance', score: finance },
        { label: 'Volunteers', score: volunteers },
        { label: 'Reporting', score: reporting },
    ]

    const score =
        categories.length > 0
            ? clampPercentage(categories.reduce((sum, category) => sum + category.score, 0) / categories.length)
            : 0

    const barText = buildBarText(score)

    return {
        categories,
        score,
        barText,
        status: getStatus(score),
    }
}

export const saveCampaignHealthSnapshot = async ({
    userId,
    candidateId,
    campaignId,
    health,
    source,
}: {
    userId: string
    candidateId?: string | null
    campaignId?: string | null
    health: CampaignHealthScoreResult
    source?: string
}) => {
    if (!userId) return { error: null as string | null }

    const payload = {
        user_id: userId,
        candidate_id: candidateId ?? null,
        campaign_id: campaignId ?? null,
        overall_score: health.score,
        readiness_status: health.status,
        readiness_bar_text: health.barText,
        category_scores: categoriesToRecord(health.categories),
        source: source ?? 'wizard',
        calculated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('campaign_health_scores').upsert(
        payload,
        { onConflict: 'user_id' }
    )

    if (!error) {
        return {
            error: null,
        }
    }

    // Backward compatibility for older schema deployments.
    const { error: fallbackError } = await supabase.from('campaign_health').upsert(
        payload,
        { onConflict: 'user_id' }
    )

    return {
        error: fallbackError?.message ?? error.message,
    }
}

export const fetchCampaignHealthSnapshot = async (userId: string): Promise<CampaignHealthScoreResult | null> => {
    if (!userId) return null

    const query =
        async (tableName: 'campaign_health_scores' | 'campaign_health') =>
            supabase
                .from(tableName)
                .select('user_id, overall_score, readiness_status, readiness_bar_text, category_scores')
                .eq('user_id', userId)
                .maybeSingle<CampaignHealthRow>()

    const { data, error } = await query('campaign_health_scores')

    if (error || !data) {
        const { data: fallbackData, error: fallbackError } = await query('campaign_health')
        if (fallbackError || !fallbackData) return null

        const fallbackScore = clampPercentage(fallbackData.overall_score ?? 0)
        const fallbackStatus = fallbackData.readiness_status ?? getStatus(fallbackScore)
        const fallbackBarText = fallbackData.readiness_bar_text || buildBarText(fallbackScore)

        return {
            categories: recordToCategories(fallbackData.category_scores),
            score: fallbackScore,
            status: fallbackStatus,
            barText: fallbackBarText,
        }
    }

    const score = clampPercentage(data.overall_score ?? 0)
    const status = data.readiness_status ?? getStatus(score)
    const barText = data.readiness_bar_text || buildBarText(score)

    return {
        categories: recordToCategories(data.category_scores),
        score,
        status,
        barText,
    }
}

const parseDraft = <T>(key: string): T | null => {
    if (typeof window === 'undefined') return null

    const raw = window.localStorage.getItem(key)
    if (!raw) return null

    try {
        return JSON.parse(raw) as T
    } catch {
        return null
    }
}

export const buildCampaignHealthFromLaunchDraft = ({
    userId,
    candidateProfileComplete,
}: {
    userId: string
    candidateProfileComplete: boolean
}): CampaignHealthScoreResult => {
    if (!userId) {
        return computeCampaignHealthScore({
            candidateProfileComplete,
            treasurerAssigned: false,
            banking: {
                obtainEin: false,
                openBankAccount: false,
                recordBankInformation: false,
                bankName: '',
                bankAccountLast4: '',
                bankRoutingLast4: '',
            },
            compliance: { completed: 0, total: 0 },
            documents: {
                registrationPaperworkUploaded: false,
                treasurerDocumentationUploaded: false,
                bankingRecordsUploaded: false,
                supportingComplianceDocsUploaded: false,
            },
            finance: {
                legalEntityName: '',
                contributionIntakeEmail: '',
                perDonorContributionLimit: '',
                processorAccountReady: false,
                requireDonorDetails: false,
                complianceNoticeConfirmed: false,
            },
            volunteers: {
                createdVolunteerNeeds: false,
                publishedOpportunities: false,
                invitedSupporters: false,
                supporterEmails: '',
            },
        })
    }

    const stepThree = parseDraft<StepThreeDraft>(`campaign-launch-step3-${userId}`)
    const stepFour = parseDraft<StepFourDraft>(`campaign-launch-step4-${userId}`)
    const stepFive = parseDraft<StepFiveDraft>(`campaign-launch-step5-${userId}`)
    const stepSix = parseDraft<StepSixDraft>(`campaign-launch-step6-${userId}`)
    const stepSeven = parseDraft<StepSevenDraft>(`campaign-launch-step7-${userId}`)
    const stepEight = parseDraft<StepEightDraft>(`campaign-launch-step8-${userId}`)

    const milestones = Array.isArray(stepFive?.milestones) ? stepFive.milestones : []
    const completedMilestones = milestones.filter((item) => item.done).length

    return computeCampaignHealthScore({
        candidateProfileComplete,
        treasurerAssigned: !!stepThree?.completed,
        banking: {
            obtainEin: !!stepFour?.obtainEin,
            openBankAccount: !!stepFour?.openBankAccount,
            recordBankInformation: !!stepFour?.recordBankInformation,
            bankName: stepFour?.bankName ?? '',
            bankAccountLast4: stepFour?.bankAccountLast4 ?? '',
            bankRoutingLast4: stepFour?.bankRoutingLast4 ?? '',
        },
        compliance: {
            completed: completedMilestones,
            total: milestones.length,
        },
        documents: {
            registrationPaperworkUploaded: !!stepEight?.registrationPaperworkUploaded,
            treasurerDocumentationUploaded: !!stepEight?.treasurerDocumentationUploaded,
            bankingRecordsUploaded: !!stepEight?.bankingRecordsUploaded,
            supportingComplianceDocsUploaded: !!stepEight?.supportingComplianceDocsUploaded,
        },
        finance: {
            legalEntityName: stepSix?.legalEntityName ?? '',
            contributionIntakeEmail: stepSix?.contributionIntakeEmail ?? '',
            perDonorContributionLimit: stepSix?.perDonorContributionLimit ?? '',
            processorAccountReady: !!stepSix?.processorAccountReady,
            requireDonorDetails: stepSix?.requireDonorDetails !== false,
            complianceNoticeConfirmed: !!stepSix?.complianceNoticeConfirmed,
        },
        volunteers: {
            createdVolunteerNeeds: !!stepSeven?.createdVolunteerNeeds,
            publishedOpportunities: !!stepSeven?.publishedOpportunities,
            invitedSupporters: !!stepSeven?.invitedSupporters,
            supporterEmails: stepSeven?.supporterEmails ?? '',
        },
    })
}
