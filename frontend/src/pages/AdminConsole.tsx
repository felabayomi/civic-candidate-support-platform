import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/authContext'
import { supabase } from '../lib/supabaseClient'

import { buildUserFacingErrorMessage } from '../lib/userFacingError'
type RoleValue = 'candidate' | 'treasurer' | 'admin' | 'advisor' | 'volunteer'

type UserRow = {
    id: string
    email: string
    full_name: string | null
    created_at: string
}

type ProfileRow = {
    id: string
    full_name: string | null
    role: RoleValue
    approval_status: 'pending' | 'approved' | 'rejected'
    approved_at: string | null
}

type AdminUserRow = {
    id: string
    email: string
    full_name: string | null
    role: RoleValue
    approval_status: 'pending' | 'approved' | 'rejected'
    approved_at: string | null
    created_at: string
}

type TreasurerRow = {
    id: string
    full_name: string
    email: string | null
    is_verified: boolean
    verified_at: string | null
    created_at: string
}

type CandidateSummary = {
    campaign_name: string
    office_title: string
    jurisdiction: string
}

type CampaignRow = {
    id: string
    campaign_name: string | null
    status: string
    created_at: string
    candidate: CandidateSummary | CandidateSummary[] | null
}

type DocumentRow = {
    id: string
    title: string
    file_path: string
    document_type: string | null
    user_id: string
    created_at: string
}

type DeadlineRow = {
    id: string
    label: string
    due_date: string
    status: string
    created_at: string
    candidate_id: string
    candidate: CandidateSummary | CandidateSummary[] | null
}

type ValidationFailureRow = {
    message: string
}

type ValidationErrorSummary = {
    message: string
    count: number
}

type PlatformAnalytics = {
    signups: number
    campaignsCreated: number
    wizardCompletionRate: number
    volunteerMatches: number
    documentUploads: number
    validationFailures: ValidationErrorSummary[]
}

type AnalyticsWindow = '7d' | '30d' | '90d'

type ComplianceJurisdictionSummary = {
    name: string
    state_code: string
}

type ComplianceRuleSetRow = {
    id: string
    jurisdiction_id: string | null
    office_id: string | null
    name: string
    description: string | null
    version: string
    status: 'draft' | 'active' | 'archived'
    effective_start: string | null
    effective_end: string | null
    source_url: string | null
    jurisdiction: ComplianceJurisdictionSummary | ComplianceJurisdictionSummary[] | null
}

type ComplianceJurisdictionRow = {
    id: string
    name: string
    type: 'state' | 'county' | 'city' | 'district'
    state_code: string
    parent_id: string | null
    is_active: boolean
}

type ComplianceOfficeRow = {
    id: string
    jurisdiction_id: string | null
    office_name: string
    office_level: string
    election_cycle: string | null
    is_active: boolean
}

type ComplianceRuleRow = {
    id: string
    rule_set_id: string | null
    rule_code: string
    title: string
    category: 'candidate_registration' | 'committee_registration' | 'treasurer' | 'banking' | 'contribution' | 'expense' | 'reporting' | 'document' | 'deadline' | 'disclosure'
    severity: 'info' | 'warning' | 'blocking'
    condition: unknown
    message: string
    is_active: boolean
}

type ComplianceRequiredFormRow = {
    id: string
    rule_set_id: string | null
    form_name: string
    form_code: string | null
    filing_url: string | null
    is_active: boolean
}

type ComplianceDeadlineRuleRow = {
    id: string
    rule_set_id: string | null
    title: string
    deadline_type: 'registration' | 'finance_report' | 'pre_election' | 'post_election' | 'annual' | 'custom'
    offset_days: number | null
    severity: string | null
}

type ComplianceRuleDraft = {
    title: string
    category: ComplianceRuleRow['category']
    severity: ComplianceRuleRow['severity']
    condition_text: string
    message: string
    is_active: boolean
}

type RowMutationState = {
    pending: boolean
    error: string
}

type ComplianceRuleSetDraft = {
    name: string
    jurisdiction_id: string
    office_id: string
    status: ComplianceRuleSetRow['status']
    effective_start: string
    effective_end: string
    source_url: string
}

const roleOptions: RoleValue[] = ['candidate', 'treasurer', 'admin', 'advisor', 'volunteer']
const deadlineStatusOptions = ['upcoming', 'due-soon', 'submitted', 'overdue']
const stateCodeOptions = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
    'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
    'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]

const jurisdictionTypeOptions: Array<ComplianceJurisdictionRow['type']> = ['state', 'county', 'city', 'district']
const ruleCategoryOptions: Array<ComplianceRuleRow['category']> = [
    'candidate_registration',
    'committee_registration',
    'treasurer',
    'banking',
    'contribution',
    'expense',
    'reporting',
    'document',
    'deadline',
    'disclosure',
]
const ruleSeverityOptions: Array<ComplianceRuleRow['severity']> = ['info', 'warning', 'blocking']
const deadlineTypeOptions: Array<ComplianceDeadlineRuleRow['deadline_type']> = [
    'registration',
    'finance_report',
    'pre_election',
    'post_election',
    'annual',
    'custom',
]

const normalizeCandidate = (candidate: CandidateSummary | CandidateSummary[] | null): CandidateSummary | null => {
    if (!candidate) return null
    return Array.isArray(candidate) ? candidate[0] ?? null : candidate
}

const normalizeJurisdiction = (
    jurisdiction: ComplianceJurisdictionSummary | ComplianceJurisdictionSummary[] | null
): ComplianceJurisdictionSummary | null => {
    if (!jurisdiction) return null
    return Array.isArray(jurisdiction) ? jurisdiction[0] ?? null : jurisdiction
}

function AdminConsole() {
    const { session } = useAuth()
    const userId = useMemo(() => session?.user.id ?? '', [session])

    const [isLoading, setIsLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [errorMessage, setErrorMessage] = useState('')
    const [statusMessage, setStatusMessage] = useState('')
    const [rowMutationStates, setRowMutationStates] = useState<Record<string, RowMutationState>>({})

    const [users, setUsers] = useState<AdminUserRow[]>([])
    const [treasurers, setTreasurers] = useState<TreasurerRow[]>([])
    const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
    const [complianceJurisdictions, setComplianceJurisdictions] = useState<ComplianceJurisdictionRow[]>([])
    const [complianceOffices, setComplianceOffices] = useState<ComplianceOfficeRow[]>([])
    const [complianceRuleSets, setComplianceRuleSets] = useState<ComplianceRuleSetRow[]>([])
    const [complianceRules, setComplianceRules] = useState<ComplianceRuleRow[]>([])
    const [complianceRequiredForms, setComplianceRequiredForms] = useState<ComplianceRequiredFormRow[]>([])
    const [complianceDeadlineRules, setComplianceDeadlineRules] = useState<ComplianceDeadlineRuleRow[]>([])
    const [documents, setDocuments] = useState<DocumentRow[]>([])
    const [deadlines, setDeadlines] = useState<DeadlineRow[]>([])
    const [analytics, setAnalytics] = useState<PlatformAnalytics>({
        signups: 0,
        campaignsCreated: 0,
        wizardCompletionRate: 0,
        volunteerMatches: 0,
        documentUploads: 0,
        validationFailures: [],
    })
    const [analyticsWindow, setAnalyticsWindow] = useState<AnalyticsWindow>('30d')
    const analyticsWindowStartIso = useMemo(() => {
        const daysBack = analyticsWindow === '7d' ? 7 : analyticsWindow === '30d' ? 30 : 90
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - daysBack)
        return startDate.toISOString()
    }, [analyticsWindow])

    const [roleDrafts, setRoleDrafts] = useState<Record<string, RoleValue>>({})
    const [dueDateDrafts, setDueDateDrafts] = useState<Record<string, string>>({})
    const [ruleSetStatusDrafts, setRuleSetStatusDrafts] = useState<Record<string, 'draft' | 'active' | 'archived'>>({})
    const [ruleSetDrafts, setRuleSetDrafts] = useState<Record<string, ComplianceRuleSetDraft>>({})
    const [jurisdictionDrafts, setJurisdictionDrafts] = useState<Record<string, Omit<ComplianceJurisdictionRow, 'id'>>>({})
    const [officeDrafts, setOfficeDrafts] = useState<Record<string, Omit<ComplianceOfficeRow, 'id'>>>({})
    const [ruleDrafts, setRuleDrafts] = useState<Record<string, ComplianceRuleDraft>>({})
    const [requiredFormDrafts, setRequiredFormDrafts] = useState<Record<string, Omit<ComplianceRequiredFormRow, 'id'>>>({})
    const [deadlineRuleDrafts, setDeadlineRuleDrafts] = useState<Record<string, Omit<ComplianceDeadlineRuleRow, 'id'>>>({})

    const [newJurisdiction, setNewJurisdiction] = useState({ name: '', type: 'state' as ComplianceJurisdictionRow['type'], state_code: 'MD', parent_id: '', is_active: true })
    const [newOffice, setNewOffice] = useState({ jurisdiction_id: '', office_name: '', office_level: '', election_cycle: '', is_active: true })
    const [newRuleSet, setNewRuleSet] = useState({ jurisdiction_id: '', office_id: '', name: '', description: '', version: 'v1', status: 'draft' as ComplianceRuleSetRow['status'], effective_start: '', effective_end: '', source_url: '' })
    const [newRule, setNewRule] = useState({ rule_set_id: '', rule_code: '', title: '', category: 'reporting' as ComplianceRuleRow['category'], severity: 'warning' as ComplianceRuleRow['severity'], condition_text: '{"type":"required_field","table":"candidates","field":"jurisdiction"}', message: '', is_active: true })
    const [newRequiredForm, setNewRequiredForm] = useState({ rule_set_id: '', form_name: '', form_code: '', filing_url: '', is_active: true })
    const [newDeadlineRule, setNewDeadlineRule] = useState({ rule_set_id: '', title: '', deadline_type: 'finance_report' as ComplianceDeadlineRuleRow['deadline_type'], offset_days: 0, severity: 'warning' })
    const [complianceStateFilter, setComplianceStateFilter] = useState('ALL')
    const [complianceJurisdictionFilter, setComplianceJurisdictionFilter] = useState('ALL')
    const [complianceRuleSetFilter, setComplianceRuleSetFilter] = useState('ALL')
    const [ruleSearchInput, setRuleSearchInput] = useState('')
    const [debouncedRuleSearch, setDebouncedRuleSearch] = useState('')
    const [showRuleErrorsOnly, setShowRuleErrorsOnly] = useState(false)
    const [isCreateConditionExpanded, setIsCreateConditionExpanded] = useState(false)
    const [expandedRuleConditionEditors, setExpandedRuleConditionEditors] = useState<Record<string, boolean>>({})

    const [cacheStateCode, setCacheStateCode] = useState('MD')
    const [cacheQuestion, setCacheQuestion] = useState('')
    const [isClearingCache, setIsClearingCache] = useState(false)
    const [reminderRunMode, setReminderRunMode] = useState<'dry-run' | 'live' | null>(null)

    const loadAdminData = async (showFullLoading = false) => {
        if (!userId) {
            setIsLoading(false)
            return
        }

        if (showFullLoading) {
            setIsLoading(true)
        } else {
            setIsRefreshing(true)
        }

        setErrorMessage('')

        const [usersRes, profilesRes, treasurersRes, campaignsRes, jurisdictionsRes, officesRes, ruleSetsRes, rulesRes, requiredFormsRes, deadlineRulesRes, documentsRes, deadlinesRes] = await Promise.all([
            supabase.from('users').select('id, email, full_name, created_at').order('created_at', { ascending: false }),
            supabase
                .from('profiles')
                .select('id, full_name, role, approval_status, approved_at')
                .order('created_at', { ascending: false }),
            supabase
                .from('treasurers')
                .select('id, full_name, email, is_verified, verified_at, created_at')
                .order('created_at', { ascending: false }),
            supabase
                .from('campaigns')
                .select('id, campaign_name, status, created_at, candidate:candidates(campaign_name, office_title, jurisdiction)')
                .order('created_at', { ascending: false })
                .limit(60),
            supabase
                .from('compliance_jurisdictions')
                .select('id, name, type, state_code, parent_id, is_active')
                .order('state_code', { ascending: true })
                .limit(200),
            supabase
                .from('compliance_offices')
                .select('id, jurisdiction_id, office_name, office_level, election_cycle, is_active')
                .order('office_name', { ascending: true })
                .limit(300),
            supabase
                .from('compliance_rule_sets')
                .select('id, jurisdiction_id, office_id, name, description, version, status, effective_start, effective_end, source_url, jurisdiction:compliance_jurisdictions(name, state_code)')
                .order('effective_start', { ascending: false })
                .limit(300),
            supabase
                .from('compliance_rules')
                .select('id, rule_set_id, rule_code, title, category, severity, condition, message, is_active')
                .order('created_at', { ascending: false })
                .limit(400),
            supabase
                .from('compliance_required_forms')
                .select('id, rule_set_id, form_name, form_code, filing_url, is_active')
                .order('created_at', { ascending: false })
                .limit(300),
            supabase
                .from('compliance_deadline_rules')
                .select('id, rule_set_id, title, deadline_type, offset_days, severity')
                .order('created_at', { ascending: false })
                .limit(300),
            supabase
                .from('documents')
                .select('id, title, file_path, document_type, user_id, created_at')
                .order('created_at', { ascending: false })
                .limit(80),
            supabase
                .from('deadlines')
                .select('id, label, due_date, status, created_at, candidate_id, candidate:candidates(campaign_name, office_title, jurisdiction)')
                .order('due_date', { ascending: true })
                .limit(120),
        ])

        const firstError =
            usersRes.error ||
            profilesRes.error ||
            treasurersRes.error ||
            campaignsRes.error ||
            jurisdictionsRes.error ||
            officesRes.error ||
            ruleSetsRes.error ||
            rulesRes.error ||
            requiredFormsRes.error ||
            deadlineRulesRes.error ||
            documentsRes.error ||
            deadlinesRes.error

        if (firstError) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            setIsLoading(false)
            setIsRefreshing(false)
            return
        }

        const userRows = (usersRes.data ?? []) as UserRow[]
        const profileRows = (profilesRes.data ?? []) as ProfileRow[]
        const profileById = new Map(profileRows.map((row) => [row.id, row]))

        const mergedUsers = userRows.map((user) => {
            const profile = profileById.get(user.id)
            return {
                id: user.id,
                email: user.email,
                full_name: profile?.full_name ?? user.full_name ?? null,
                role: profile?.role ?? 'candidate',
                approval_status: profile?.approval_status ?? 'pending',
                approved_at: profile?.approved_at ?? null,
                created_at: user.created_at,
            } satisfies AdminUserRow
        })

        setUsers(mergedUsers)
        setTreasurers((treasurersRes.data ?? []) as TreasurerRow[])
        setCampaigns((campaignsRes.data ?? []) as CampaignRow[])

        const jurisdictionRows = (jurisdictionsRes.data ?? []) as ComplianceJurisdictionRow[]
        setComplianceJurisdictions(jurisdictionRows)
        setJurisdictionDrafts(
            Object.fromEntries(
                jurisdictionRows.map((row) => [
                    row.id,
                    {
                        name: row.name,
                        type: row.type,
                        state_code: row.state_code,
                        parent_id: row.parent_id,
                        is_active: row.is_active,
                    },
                ])
            )
        )

        const officeRows = (officesRes.data ?? []) as ComplianceOfficeRow[]
        setComplianceOffices(officeRows)
        setOfficeDrafts(
            Object.fromEntries(
                officeRows.map((row) => [
                    row.id,
                    {
                        jurisdiction_id: row.jurisdiction_id,
                        office_name: row.office_name,
                        office_level: row.office_level,
                        election_cycle: row.election_cycle,
                        is_active: row.is_active,
                    },
                ])
            )
        )

        const ruleSetRows = (ruleSetsRes.data ?? []) as ComplianceRuleSetRow[]
        setComplianceRuleSets(ruleSetRows)
        setRuleSetStatusDrafts(Object.fromEntries(ruleSetRows.map((row) => [row.id, row.status])))
        setRuleSetDrafts(
            Object.fromEntries(
                ruleSetRows.map((row) => [
                    row.id,
                    {
                        name: row.name,
                        jurisdiction_id: row.jurisdiction_id ?? '',
                        office_id: row.office_id ?? '',
                        status: row.status,
                        effective_start: row.effective_start ?? '',
                        effective_end: row.effective_end ?? '',
                        source_url: row.source_url ?? '',
                    },
                ])
            )
        )

        const ruleRows = (rulesRes.data ?? []) as ComplianceRuleRow[]
        setComplianceRules(ruleRows)
        setRuleDrafts(
            Object.fromEntries(
                ruleRows.map((row) => [
                    row.id,
                    {
                        title: row.title,
                        category: row.category,
                        severity: row.severity,
                        condition_text: JSON.stringify(row.condition ?? {}, null, 2),
                        message: row.message,
                        is_active: row.is_active,
                    },
                ])
            )
        )

        const requiredFormRows = (requiredFormsRes.data ?? []) as ComplianceRequiredFormRow[]
        setComplianceRequiredForms(requiredFormRows)
        setRequiredFormDrafts(
            Object.fromEntries(
                requiredFormRows.map((row) => [
                    row.id,
                    {
                        rule_set_id: row.rule_set_id,
                        form_name: row.form_name,
                        form_code: row.form_code,
                        filing_url: row.filing_url,
                        is_active: row.is_active,
                    },
                ])
            )
        )

        const deadlineRuleRows = (deadlineRulesRes.data ?? []) as ComplianceDeadlineRuleRow[]
        setComplianceDeadlineRules(deadlineRuleRows)
        setDeadlineRuleDrafts(
            Object.fromEntries(
                deadlineRuleRows.map((row) => [
                    row.id,
                    {
                        rule_set_id: row.rule_set_id,
                        title: row.title,
                        deadline_type: row.deadline_type,
                        offset_days: row.offset_days,
                        severity: row.severity,
                    },
                ])
            )
        )

        setDocuments((documentsRes.data ?? []) as DocumentRow[])

        const deadlineRows = (deadlinesRes.data ?? []) as DeadlineRow[]
        setDeadlines(deadlineRows)
        setDueDateDrafts(Object.fromEntries(deadlineRows.map((row) => [row.id, row.due_date])))

        const [
            signupCountRes,
            campaignCountRes,
            wizardTotalRes,
            wizardCompletedRes,
            validationFailuresRes,
            volunteerMatchesRes,
            documentUploadCountRes,
        ] = await Promise.all([
            supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', analyticsWindowStartIso),
            supabase.from('campaigns').select('id', { count: 'exact', head: true }).gte('created_at', analyticsWindowStartIso),
            supabase.from('campaign_progress').select('id', { count: 'exact', head: true }).gte('created_at', analyticsWindowStartIso),
            supabase
                .from('campaign_progress')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'completed')
                .gte('created_at', analyticsWindowStartIso),
            supabase
                .from('compliance_validation_results')
                .select('message')
                .eq('passed', false)
                .gte('created_at', analyticsWindowStartIso)
                .limit(500),
            supabase
                .from('candidate_volunteer_applications')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'accepted')
                .gte('created_at', analyticsWindowStartIso),
            supabase.from('documents').select('id', { count: 'exact', head: true }).gte('created_at', analyticsWindowStartIso),
        ])

        if (
            signupCountRes.error ||
            campaignCountRes.error ||
            wizardTotalRes.error ||
            wizardCompletedRes.error ||
            validationFailuresRes.error ||
            volunteerMatchesRes.error ||
            documentUploadCountRes.error
        ) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'load', resource: 'platform analytics' }))
        } else {
            const wizardTotal = wizardTotalRes.count ?? 0
            const wizardCompleted = wizardCompletedRes.count ?? 0
            const wizardCompletionRate = wizardTotal > 0 ? Math.round((wizardCompleted / wizardTotal) * 100) : 0

            const failureRows = (validationFailuresRes.data ?? []) as ValidationFailureRow[]
            const failureCounts = new Map<string, number>()
            failureRows.forEach((row) => {
                const key = row.message?.trim() || 'Unknown validation error'
                failureCounts.set(key, (failureCounts.get(key) ?? 0) + 1)
            })
            const validationFailures = Array.from(failureCounts.entries())
                .map(([message, count]) => ({ message, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5)

            setAnalytics({
                signups: signupCountRes.count ?? 0,
                campaignsCreated: campaignCountRes.count ?? 0,
                wizardCompletionRate,
                volunteerMatches: volunteerMatchesRes.count ?? 0,
                documentUploads: documentUploadCountRes.count ?? 0,
                validationFailures,
            })
        }

        setRoleDrafts(Object.fromEntries(mergedUsers.map((row) => [row.id, row.role])))
        setIsLoading(false)
        setIsRefreshing(false)
    }

    useEffect(() => {
        loadAdminData(true)
    }, [userId])

    useEffect(() => {
        if (!userId) return
        loadAdminData(false)
    }, [analyticsWindow])

    useEffect(() => {
        const timerId = window.setTimeout(() => {
            setDebouncedRuleSearch(ruleSearchInput.trim())
        }, 300)

        return () => window.clearTimeout(timerId)
    }, [ruleSearchInput])

    const visibleJurisdictions = useMemo(() => {
        if (complianceStateFilter === 'ALL') return complianceJurisdictions
        return complianceJurisdictions.filter((item) => item.state_code === complianceStateFilter)
    }, [complianceJurisdictions, complianceStateFilter])

    const visibleOffices = useMemo(() => {
        const source = complianceOffices.filter((office) => {
            if (complianceJurisdictionFilter === 'ALL') return true
            return office.jurisdiction_id === complianceJurisdictionFilter
        })
        if (complianceStateFilter === 'ALL') return source

        const allowedJurisdictionIds = new Set(visibleJurisdictions.map((item) => item.id))
        return source.filter((office) => office.jurisdiction_id !== null && allowedJurisdictionIds.has(office.jurisdiction_id))
    }, [complianceOffices, complianceJurisdictionFilter, complianceStateFilter, visibleJurisdictions])

    const visibleRuleSets = useMemo(() => {
        return complianceRuleSets.filter((ruleSet) => {
            if (complianceJurisdictionFilter !== 'ALL' && ruleSet.jurisdiction_id !== complianceJurisdictionFilter) return false
            if (complianceStateFilter !== 'ALL') {
                const jurisdiction = ruleSet.jurisdiction_id ? complianceJurisdictions.find((item) => item.id === ruleSet.jurisdiction_id) : null
                if (!jurisdiction || jurisdiction.state_code !== complianceStateFilter) return false
            }
            if (complianceRuleSetFilter !== 'ALL' && ruleSet.id !== complianceRuleSetFilter) return false
            return true
        })
    }, [complianceRuleSets, complianceJurisdictions, complianceJurisdictionFilter, complianceRuleSetFilter, complianceStateFilter])

    const visibleRules = useMemo(() => {
        const visibleRuleSetIds = new Set(visibleRuleSets.map((item) => item.id))
        return complianceRules.filter((rule) => rule.rule_set_id !== null && visibleRuleSetIds.has(rule.rule_set_id))
    }, [complianceRules, visibleRuleSets])

    const visibleRulesFiltered = useMemo(() => {
        const query = debouncedRuleSearch.toLowerCase()

        return visibleRules.filter((rule) => {
            const rowKey = `rule:${rule.id}`
            const draft = ruleDrafts[rule.id]
            const title = (draft?.title ?? rule.title).toLowerCase()
            const message = (draft?.message ?? rule.message).toLowerCase()
            const ruleCode = rule.rule_code.toLowerCase()
            const matchesSearch = !query || title.includes(query) || message.includes(query) || ruleCode.includes(query)
            const matchesErrorsOnly = !showRuleErrorsOnly || Boolean(rowMutationStates[rowKey]?.error)
            return matchesSearch && matchesErrorsOnly
        })
    }, [debouncedRuleSearch, rowMutationStates, ruleDrafts, showRuleErrorsOnly, visibleRules])

    const visibleRequiredForms = useMemo(() => {
        const visibleRuleSetIds = new Set(visibleRuleSets.map((item) => item.id))
        return complianceRequiredForms.filter((row) => row.rule_set_id !== null && visibleRuleSetIds.has(row.rule_set_id))
    }, [complianceRequiredForms, visibleRuleSets])

    const visibleDeadlineRules = useMemo(() => {
        const visibleRuleSetIds = new Set(visibleRuleSets.map((item) => item.id))
        return complianceDeadlineRules.filter((row) => row.rule_set_id !== null && visibleRuleSetIds.has(row.rule_set_id))
    }, [complianceDeadlineRules, visibleRuleSets])

    const parseRuleCondition = (rawText: string): { value: Record<string, unknown> | null; error: string } => {
        const normalized = rawText.trim()
        if (!normalized) {
            return { value: null, error: 'Condition JSON is required.' }
        }

        try {
            const parsed = JSON.parse(normalized) as unknown
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                return { value: null, error: 'Condition must be a JSON object.' }
            }

            const conditionType = (parsed as { type?: unknown }).type
            if (typeof conditionType !== 'string' || conditionType.trim().length === 0) {
                return { value: null, error: 'Condition must include a non-empty type field.' }
            }

            const condition = parsed as Record<string, unknown>
            const type = conditionType.trim()

            if (type === 'required_field') {
                if (typeof condition.table !== 'string' || condition.table.trim().length === 0) {
                    return { value: null, error: 'required_field condition must include a non-empty table value.' }
                }
                if (typeof condition.field !== 'string' || condition.field.trim().length === 0) {
                    return { value: null, error: 'required_field condition must include a non-empty field value.' }
                }
            } else if (type === 'minimum_count') {
                if (typeof condition.table !== 'string' || condition.table.trim().length === 0) {
                    return { value: null, error: 'minimum_count condition must include a non-empty table value.' }
                }
                const minimum = typeof condition.minimum === 'number' ? condition.minimum : Number(condition.minimum)
                if (!Number.isFinite(minimum)) {
                    return { value: null, error: 'minimum_count condition must include a numeric minimum value.' }
                }
            } else if (type === 'max_amount') {
                if (typeof condition.table !== 'string' || condition.table.trim().length === 0) {
                    return { value: null, error: 'max_amount condition must include a non-empty table value.' }
                }
                if (typeof condition.field !== 'string' || condition.field.trim().length === 0) {
                    return { value: null, error: 'max_amount condition must include a non-empty field value.' }
                }
                const max = typeof condition.max === 'number' ? condition.max : Number(condition.max)
                if (!Number.isFinite(max)) {
                    return { value: null, error: 'max_amount condition must include a numeric max value.' }
                }
            } else {
                return { value: null, error: `Unsupported condition type: ${type}` }
            }

            return { value: condition, error: '' }
        } catch {
            return { value: null, error: 'Condition JSON is invalid.' }
        }
    }

    const formatConditionJson = (rawText: string, pretty: boolean): { value: string | null; error: string } => {
        const parsed = parseRuleCondition(rawText)
        if (!parsed.value) {
            return { value: null, error: parsed.error }
        }

        return {
            value: JSON.stringify(parsed.value, null, pretty ? 2 : 0),
            error: '',
        }
    }

    const setRowPending = (rowKey: string, pending: boolean) => {
        setRowMutationStates((prev) => ({
            ...prev,
            [rowKey]: {
                pending,
                error: pending ? '' : prev[rowKey]?.error ?? '',
            },
        }))
    }

    const setRowError = (rowKey: string, error: string) => {
        setRowMutationStates((prev) => ({
            ...prev,
            [rowKey]: {
                pending: false,
                error,
            },
        }))
    }

    const clearRowError = (rowKey: string) => {
        setRowMutationStates((prev) => ({
            ...prev,
            [rowKey]: {
                pending: false,
                error: '',
            },
        }))
    }

    const approveUser = async (profileId: string, nextStatus: 'approved' | 'rejected' | 'pending') => {
        if (!userId) return

        setStatusMessage('')
        setErrorMessage('')

        const payload = {
            approval_status: nextStatus,
            approved_by: nextStatus === 'approved' ? userId : null,
            approved_at: nextStatus === 'approved' ? new Date().toISOString() : null,
        }

        const { error } = await supabase.from('profiles').update(payload).eq('id', profileId)

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        setStatusMessage(`User status set to ${nextStatus}.`)
        await loadAdminData(false)
    }

    const saveUserRole = async (profileId: string) => {
        const nextRole = roleDrafts[profileId]
        if (!nextRole) return

        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase.from('profiles').update({ role: nextRole }).eq('id', profileId)

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        setStatusMessage('User role updated.')
        await loadAdminData(false)
    }

    const toggleTreasurerVerification = async (treasurer: TreasurerRow) => {
        if (!userId) return

        setStatusMessage('')
        setErrorMessage('')

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

        setStatusMessage(nextVerified ? 'Treasurer verified.' : 'Treasurer unverified.')
        await loadAdminData(false)
    }

    const saveDeadlineDueDate = async (deadline: DeadlineRow) => {
        const nextDueDate = dueDateDrafts[deadline.id]
        if (!nextDueDate || nextDueDate === deadline.due_date) return

        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase
            .from('deadlines')
            .update({ due_date: nextDueDate, updated_at: new Date().toISOString() })
            .eq('id', deadline.id)

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        setStatusMessage('Deadline date updated.')
        await loadAdminData(false)
    }

    const updateDeadlineStatus = async (deadlineId: string, status: string) => {
        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase
            .from('deadlines')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', deadlineId)

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        setStatusMessage('Deadline status updated.')
        await loadAdminData(false)
    }

    const openDocument = async (filePath: string) => {
        const parts = filePath.split('/')
        const bucket = parts[0]
        const pathInsideBucket = parts.slice(1).join('/')

        if (!bucket || !pathInsideBucket) {
            setErrorMessage('Invalid document path.')
            return
        }

        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(pathInsideBucket, 120)

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    }

    const clearComplianceCache = async () => {
        setStatusMessage('')
        setErrorMessage('')
        setIsClearingCache(true)

        const normalizedQuestion = cacheQuestion.trim()
        const invokeResult = await supabase.functions.invoke('ccsp-admin-tools', {
            body: {
                action: 'clear_cache',
                stateCode: cacheStateCode,
                question: normalizedQuestion.length > 0 ? normalizedQuestion : null,
            },
        })

        setIsClearingCache(false)

        if (invokeResult.error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        const data = invokeResult.data as { deletedCount?: number; mode?: string } | null
        const deletedCount = data?.deletedCount ?? 0
        const mode = data?.mode ?? 'state'
        setStatusMessage(
            mode === 'question'
                ? `Cache cleared for the selected state and question. Deleted ${deletedCount} row(s).`
                : `Cache cleared for state ${cacheStateCode}. Deleted ${deletedCount} row(s).`
        )
    }

    const saveRuleSetStatus = async (ruleSetId: string) => {
        const nextStatus = ruleSetStatusDrafts[ruleSetId]
        if (!nextStatus) return

        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase
            .from('compliance_rule_sets')
            .update({
                status: nextStatus,
                is_active: nextStatus === 'active',
                updated_at: new Date().toISOString(),
            })
            .eq('id', ruleSetId)

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        setStatusMessage('Rule set status updated.')
        await loadAdminData(false)
    }

    const createJurisdiction = async () => {
        if (!newJurisdiction.name.trim()) return

        const rowKey = 'create-jurisdiction'
        setRowPending(rowKey, true)
        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase.from('compliance_jurisdictions').insert({
            name: newJurisdiction.name.trim(),
            type: newJurisdiction.type,
            state_code: newJurisdiction.state_code,
            parent_id: newJurisdiction.parent_id || null,
            is_active: newJurisdiction.is_active,
        })

        if (error) {
            setRowError(rowKey, buildUserFacingErrorMessage({ action: 'complete', resource: 'admin action' }))
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        clearRowError(rowKey)
        setStatusMessage('Jurisdiction created.')
        setNewJurisdiction({ name: '', type: 'state', state_code: 'MD', parent_id: '', is_active: true })
        await loadAdminData(false)
    }

    const updateJurisdiction = async (id: string) => {
        const draft = jurisdictionDrafts[id]
        if (!draft) return

        const rowKey = `jurisdiction:${id}`
        setRowPending(rowKey, true)
        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase.from('compliance_jurisdictions').update({
            name: draft.name,
            type: draft.type,
            state_code: draft.state_code,
            parent_id: draft.parent_id || null,
            is_active: draft.is_active,
        }).eq('id', id)

        if (error) {
            setRowError(rowKey, buildUserFacingErrorMessage({ action: 'complete', resource: 'admin action' }))
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        clearRowError(rowKey)
        setStatusMessage('Jurisdiction updated.')
        await loadAdminData(false)
    }

    const deleteJurisdiction = async (id: string) => {
        const rowKey = `jurisdiction:${id}`
        setRowPending(rowKey, true)
        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase.from('compliance_jurisdictions').delete().eq('id', id)
        if (error) {
            setRowError(rowKey, buildUserFacingErrorMessage({ action: 'complete', resource: 'admin action' }))
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        clearRowError(rowKey)
        setStatusMessage('Jurisdiction deleted.')
        await loadAdminData(false)
    }

    const createOffice = async () => {
        if (!newOffice.office_name.trim()) return

        const rowKey = 'create-office'
        setRowPending(rowKey, true)
        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase.from('compliance_offices').insert({
            jurisdiction_id: newOffice.jurisdiction_id || null,
            office_name: newOffice.office_name,
            office_level: newOffice.office_level,
            election_cycle: newOffice.election_cycle || null,
            is_active: newOffice.is_active,
        })

        if (error) {
            setRowError(rowKey, buildUserFacingErrorMessage({ action: 'complete', resource: 'admin action' }))
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        clearRowError(rowKey)
        setStatusMessage('Office created.')
        setNewOffice({ jurisdiction_id: '', office_name: '', office_level: '', election_cycle: '', is_active: true })
        await loadAdminData(false)
    }

    const updateOffice = async (id: string) => {
        const draft = officeDrafts[id]
        if (!draft) return

        const rowKey = `office:${id}`
        setRowPending(rowKey, true)
        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase.from('compliance_offices').update({
            jurisdiction_id: draft.jurisdiction_id || null,
            office_name: draft.office_name,
            office_level: draft.office_level,
            election_cycle: draft.election_cycle || null,
            is_active: draft.is_active,
        }).eq('id', id)

        if (error) {
            setRowError(rowKey, buildUserFacingErrorMessage({ action: 'complete', resource: 'admin action' }))
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        clearRowError(rowKey)
        setStatusMessage('Office updated.')
        await loadAdminData(false)
    }

    const deleteOffice = async (id: string) => {
        const rowKey = `office:${id}`
        setRowPending(rowKey, true)
        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase.from('compliance_offices').delete().eq('id', id)
        if (error) {
            setRowError(rowKey, buildUserFacingErrorMessage({ action: 'complete', resource: 'admin action' }))
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        clearRowError(rowKey)
        setStatusMessage('Office deleted.')
        await loadAdminData(false)
    }

    const createRuleSet = async () => {
        if (!newRuleSet.name.trim() || !newRuleSet.jurisdiction_id) return

        const rowKey = 'create-rule-set'
        setRowPending(rowKey, true)
        setStatusMessage('')
        setErrorMessage('')

        const jurisdiction = complianceJurisdictions.find((item) => item.id === newRuleSet.jurisdiction_id)

        const { error } = await supabase.from('compliance_rule_sets').insert({
            name: newRuleSet.name,
            description: newRuleSet.description || null,
            version: newRuleSet.version,
            status: newRuleSet.status,
            is_active: newRuleSet.status === 'active',
            effective_start: newRuleSet.effective_start || new Date().toISOString().slice(0, 10),
            effective_end: newRuleSet.effective_end || null,
            source_url: newRuleSet.source_url || null,
            jurisdiction_id: newRuleSet.jurisdiction_id,
            office_id: newRuleSet.office_id || null,
            state_code: jurisdiction?.state_code ?? 'MD',
            jurisdiction_scope: 'state',
        })

        if (error) {
            setRowError(rowKey, buildUserFacingErrorMessage({ action: 'complete', resource: 'admin action' }))
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        clearRowError(rowKey)
        setStatusMessage('Rule set created.')
        setNewRuleSet({ jurisdiction_id: '', office_id: '', name: '', description: '', version: 'v1', status: 'draft', effective_start: '', effective_end: '', source_url: '' })
        await loadAdminData(false)
    }

    const updateRuleSet = async (id: string) => {
        const draft = ruleSetDrafts[id]
        if (!draft) return

        const rowKey = `rule-set:${id}`
        setRowPending(rowKey, true)
        setStatusMessage('')
        setErrorMessage('')

        const jurisdiction = complianceJurisdictions.find((item) => item.id === draft.jurisdiction_id)

        const { error } = await supabase.from('compliance_rule_sets').update({
            name: draft.name,
            jurisdiction_id: draft.jurisdiction_id || null,
            office_id: draft.office_id || null,
            status: draft.status,
            is_active: draft.status === 'active',
            effective_start: draft.effective_start || null,
            effective_end: draft.effective_end || null,
            source_url: draft.source_url || null,
            state_code: jurisdiction?.state_code ?? 'MD',
            updated_at: new Date().toISOString(),
        }).eq('id', id)

        if (error) {
            setRowError(rowKey, buildUserFacingErrorMessage({ action: 'complete', resource: 'admin action' }))
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        clearRowError(rowKey)
        setStatusMessage('Rule set updated.')
        await loadAdminData(false)
    }

    const deleteRuleSet = async (id: string) => {
        const rowKey = `rule-set:${id}`
        setRowPending(rowKey, true)
        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase
            .from('compliance_rule_sets')
            .update({
                status: 'archived',
                is_active: false,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
        if (error) {
            setRowError(rowKey, buildUserFacingErrorMessage({ action: 'complete', resource: 'admin action' }))
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        clearRowError(rowKey)
        setStatusMessage('Rule set archived.')
        await loadAdminData(false)
    }

    const createRule = async () => {
        if (!newRule.rule_set_id || !newRule.rule_code.trim() || !newRule.title.trim() || !newRule.message.trim()) return

        const rowKey = 'create-rule'
        const conditionResult = parseRuleCondition(newRule.condition_text)
        if (!conditionResult.value) {
            setRowError(rowKey, conditionResult.error)
            return
        }

        setRowPending(rowKey, true)
        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase.from('compliance_rules').insert({
            rule_set_id: newRule.rule_set_id,
            rule_code: newRule.rule_code,
            title: newRule.title,
            category: newRule.category,
            severity: newRule.severity,
            condition: conditionResult.value,
            message: newRule.message,
            is_active: newRule.is_active,
        })

        if (error) {
            setRowError(rowKey, buildUserFacingErrorMessage({ action: 'complete', resource: 'admin action' }))
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        clearRowError(rowKey)
        setStatusMessage('Rule created.')
        setNewRule({ rule_set_id: '', rule_code: '', title: '', category: 'reporting', severity: 'warning', condition_text: '{"type":"required_field","table":"candidates","field":"jurisdiction"}', message: '', is_active: true })
        await loadAdminData(false)
    }

    const updateRule = async (id: string) => {
        const draft = ruleDrafts[id]
        if (!draft) return

        const rowKey = `rule:${id}`
        const conditionResult = parseRuleCondition(draft.condition_text)
        if (!conditionResult.value) {
            setRowError(rowKey, conditionResult.error)
            return
        }

        setRowPending(rowKey, true)
        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase.from('compliance_rules').update({
            title: draft.title,
            category: draft.category,
            severity: draft.severity,
            condition: conditionResult.value,
            message: draft.message,
            is_active: draft.is_active,
        }).eq('id', id)

        if (error) {
            setRowError(rowKey, buildUserFacingErrorMessage({ action: 'complete', resource: 'admin action' }))
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        clearRowError(rowKey)
        setStatusMessage('Rule updated.')
        await loadAdminData(false)
    }

    const deleteRule = async (id: string) => {
        const rowKey = `rule:${id}`
        setRowPending(rowKey, true)
        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase
            .from('compliance_rules')
            .update({ is_active: false })
            .eq('id', id)
        if (error) {
            setRowError(rowKey, buildUserFacingErrorMessage({ action: 'complete', resource: 'admin action' }))
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        clearRowError(rowKey)
        setStatusMessage('Rule deactivated.')
        await loadAdminData(false)
    }

    const createRequiredForm = async () => {
        if (!newRequiredForm.rule_set_id || !newRequiredForm.form_name.trim()) return

        const rowKey = 'create-required-form'
        setRowPending(rowKey, true)
        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase.from('compliance_required_forms').insert({
            rule_set_id: newRequiredForm.rule_set_id,
            form_name: newRequiredForm.form_name,
            form_code: newRequiredForm.form_code || null,
            filing_url: newRequiredForm.filing_url || null,
            required_for: [],
            due_rule: null,
            is_active: newRequiredForm.is_active,
        })

        if (error) {
            setRowError(rowKey, buildUserFacingErrorMessage({ action: 'complete', resource: 'admin action' }))
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        clearRowError(rowKey)
        setStatusMessage('Required form created.')
        setNewRequiredForm({ rule_set_id: '', form_name: '', form_code: '', filing_url: '', is_active: true })
        await loadAdminData(false)
    }

    const updateRequiredForm = async (id: string) => {
        const draft = requiredFormDrafts[id]
        if (!draft) return

        const rowKey = `required-form:${id}`
        setRowPending(rowKey, true)
        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase.from('compliance_required_forms').update({
            rule_set_id: draft.rule_set_id,
            form_name: draft.form_name,
            form_code: draft.form_code || null,
            filing_url: draft.filing_url || null,
            is_active: draft.is_active,
        }).eq('id', id)

        if (error) {
            setRowError(rowKey, buildUserFacingErrorMessage({ action: 'complete', resource: 'admin action' }))
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        clearRowError(rowKey)
        setStatusMessage('Required form updated.')
        await loadAdminData(false)
    }

    const deleteRequiredForm = async (id: string) => {
        const rowKey = `required-form:${id}`
        setRowPending(rowKey, true)
        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase.from('compliance_required_forms').delete().eq('id', id)
        if (error) {
            setRowError(rowKey, buildUserFacingErrorMessage({ action: 'complete', resource: 'admin action' }))
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        clearRowError(rowKey)
        setStatusMessage('Required form deleted.')
        await loadAdminData(false)
    }

    const createDeadlineRule = async () => {
        if (!newDeadlineRule.rule_set_id || !newDeadlineRule.title.trim()) return

        const rowKey = 'create-deadline-rule'
        setRowPending(rowKey, true)
        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase.from('compliance_deadline_rules').insert({
            rule_set_id: newDeadlineRule.rule_set_id,
            title: newDeadlineRule.title,
            deadline_type: newDeadlineRule.deadline_type,
            offset_days: Number(newDeadlineRule.offset_days || 0),
            severity: newDeadlineRule.severity,
        })

        if (error) {
            setRowError(rowKey, buildUserFacingErrorMessage({ action: 'complete', resource: 'admin action' }))
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        clearRowError(rowKey)
        setStatusMessage('Deadline rule created.')
        setNewDeadlineRule({ rule_set_id: '', title: '', deadline_type: 'finance_report', offset_days: 0, severity: 'warning' })
        await loadAdminData(false)
    }

    const updateDeadlineRule = async (id: string) => {
        const draft = deadlineRuleDrafts[id]
        if (!draft) return

        const rowKey = `deadline-rule:${id}`
        setRowPending(rowKey, true)
        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase.from('compliance_deadline_rules').update({
            rule_set_id: draft.rule_set_id,
            title: draft.title,
            deadline_type: draft.deadline_type,
            offset_days: Number(draft.offset_days || 0),
            severity: draft.severity,
        }).eq('id', id)

        if (error) {
            setRowError(rowKey, buildUserFacingErrorMessage({ action: 'complete', resource: 'admin action' }))
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        clearRowError(rowKey)
        setStatusMessage('Deadline rule updated.')
        await loadAdminData(false)
    }

    const deleteDeadlineRule = async (id: string) => {
        const rowKey = `deadline-rule:${id}`
        setRowPending(rowKey, true)
        setStatusMessage('')
        setErrorMessage('')

        const { error } = await supabase.from('compliance_deadline_rules').delete().eq('id', id)
        if (error) {
            setRowError(rowKey, buildUserFacingErrorMessage({ action: 'complete', resource: 'admin action' }))
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        clearRowError(rowKey)
        setStatusMessage('Deadline rule deleted.')
        await loadAdminData(false)
    }

    const runDeadlineReminderEngine = async (dryRun: boolean) => {
        setStatusMessage('')
        setErrorMessage('')
        setReminderRunMode(dryRun ? 'dry-run' : 'live')

        const invokeResult = await supabase.functions.invoke('ccsp-deadline-reminders', {
            body: {
                dryRun,
                triggeredBy: 'admin-console',
            },
        })

        setReminderRunMode(null)

        if (invokeResult.error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
            return
        }

        const data = invokeResult.data as {
            processed?: number
            eligible?: number
            sent?: number
            skipped?: number
            failed?: number
            mode?: string
        } | null

        setStatusMessage(
            `Reminder run completed (${data?.mode ?? (dryRun ? 'dry-run' : 'live')}): processed ${data?.processed ?? 0}, ` +
            `eligible ${data?.eligible ?? 0}, sent ${data?.sent ?? 0}, skipped ${data?.skipped ?? 0}, failed ${data?.failed ?? 0}.`
        )
    }

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Admin Console</h1>
                    <p className="mt-2 text-slate-600">Institutional controls for approvals, oversight, and compliance operations.</p>
                </div>
                <button
                    type="button"
                    onClick={() => loadAdminData(false)}
                    disabled={isLoading || isRefreshing}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                >
                    {isRefreshing ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>

            {isLoading ? <p className="mt-4 text-sm text-slate-600">Loading admin data...</p> : null}
            {errorMessage ? <p className="mt-4 text-sm text-red-600">{errorMessage}</p> : null}
            {statusMessage ? <p className="mt-4 text-sm text-emerald-700">{statusMessage}</p> : null}

            <div className="mt-6 rounded-xl border border-slate-200 p-4">
                <h2 className="text-lg font-semibold text-slate-900">Platform Health Analytics</h2>
                <p className="mt-1 text-sm text-slate-600">
                    Aggregated operational metrics only. No unnecessary personal data is collected here.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label className="text-xs text-slate-700">
                        Date Range
                        <select
                            value={analyticsWindow}
                            onChange={(event) => setAnalyticsWindow(event.target.value as AnalyticsWindow)}
                            className="ml-2 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                        >
                            <option value="7d">Last 7 days</option>
                            <option value="30d">Last 30 days</option>
                            <option value="90d">Last 90 days</option>
                        </select>
                    </label>
                    <p className="text-xs text-slate-500">Metrics update to match the selected window.</p>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Signups</p>
                        <p className="mt-1 text-xl font-semibold text-slate-900">{analytics.signups}</p>
                    </article>
                    <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Campaigns Created</p>
                        <p className="mt-1 text-xl font-semibold text-slate-900">{analytics.campaignsCreated}</p>
                    </article>
                    <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Wizard Completion Rate</p>
                        <p className="mt-1 text-xl font-semibold text-slate-900">{analytics.wizardCompletionRate}%</p>
                    </article>
                    <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Volunteer Matches</p>
                        <p className="mt-1 text-xl font-semibold text-slate-900">{analytics.volunteerMatches}</p>
                    </article>
                    <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Document Uploads</p>
                        <p className="mt-1 text-xl font-semibold text-slate-900">{analytics.documentUploads}</p>
                    </article>
                    <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Most Common Validation Errors</p>
                        {analytics.validationFailures.length === 0 ? (
                            <p className="mt-1 text-sm text-slate-600">No validation failures recorded.</p>
                        ) : (
                            <ul className="mt-1 space-y-1 text-sm text-slate-700">
                                {analytics.validationFailures.map((failure) => (
                                    <li key={failure.message}>
                                        {failure.message} ({failure.count})
                                    </li>
                                ))}
                            </ul>
                        )}
                    </article>
                </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 p-4">
                <h2 className="text-lg font-semibold text-slate-900">Compliance Filters</h2>
                <p className="mt-1 text-sm text-slate-600">Filter compliance data by state, jurisdiction, and rule set.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <label className="text-xs text-slate-700">
                        State
                        <select
                            value={complianceStateFilter}
                            onChange={(event) => {
                                const nextState = event.target.value
                                setComplianceStateFilter(nextState)
                                setComplianceJurisdictionFilter('ALL')
                                setComplianceRuleSetFilter('ALL')
                            }}
                            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
                        >
                            <option value="ALL">All states</option>
                            {stateCodeOptions.map((stateCode) => (
                                <option key={stateCode} value={stateCode}>{stateCode}</option>
                            ))}
                        </select>
                    </label>
                    <label className="text-xs text-slate-700">
                        Jurisdiction
                        <select
                            value={complianceJurisdictionFilter}
                            onChange={(event) => {
                                setComplianceJurisdictionFilter(event.target.value)
                                setComplianceRuleSetFilter('ALL')
                            }}
                            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
                        >
                            <option value="ALL">All jurisdictions</option>
                            {visibleJurisdictions.map((item) => (
                                <option key={item.id} value={item.id}>{item.state_code} - {item.name}</option>
                            ))}
                        </select>
                    </label>
                    <label className="text-xs text-slate-700">
                        Rule Set
                        <select
                            value={complianceRuleSetFilter}
                            onChange={(event) => setComplianceRuleSetFilter(event.target.value)}
                            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
                        >
                            <option value="ALL">All rule sets</option>
                            {visibleRuleSets.map((item) => (
                                <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 p-4">
                <h2 className="text-lg font-semibold text-slate-900">AI Cache Controls</h2>
                <p className="mt-1 text-sm text-slate-600">
                    Admin-only action to clear stale cached answers by state, or by state plus a specific question.
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1 text-xs text-slate-700">
                        State
                        <select
                            value={cacheStateCode}
                            onChange={(event) => setCacheStateCode(event.target.value)}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                        >
                            {stateCodeOptions.map((stateCode) => (
                                <option key={stateCode} value={stateCode}>
                                    {stateCode}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="min-w-[260px] flex-1 text-xs text-slate-700">
                        Question (optional)
                        <input
                            type="text"
                            value={cacheQuestion}
                            onChange={(event) => setCacheQuestion(event.target.value)}
                            placeholder="Leave blank to clear all cached responses for this state"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={clearComplianceCache}
                        disabled={isClearingCache}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                    >
                        {isClearingCache ? 'Clearing...' : 'Clear Cache'}
                    </button>
                </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 p-4">
                <h2 className="text-lg font-semibold text-slate-900">Compliance Jurisdictions</h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                    <input value={newJurisdiction.name} onChange={(e) => setNewJurisdiction((prev) => ({ ...prev, name: e.target.value }))} placeholder="Name" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <select value={newJurisdiction.type} onChange={(e) => setNewJurisdiction((prev) => ({ ...prev, type: e.target.value as ComplianceJurisdictionRow['type'] }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                        {jurisdictionTypeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <select value={newJurisdiction.state_code} onChange={(e) => setNewJurisdiction((prev) => ({ ...prev, state_code: e.target.value }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                        {stateCodeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <select value={newJurisdiction.parent_id} onChange={(e) => setNewJurisdiction((prev) => ({ ...prev, parent_id: e.target.value }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                        <option value="">No parent</option>
                        {visibleJurisdictions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-slate-700"><input type="checkbox" checked={newJurisdiction.is_active} onChange={(e) => setNewJurisdiction((prev) => ({ ...prev, is_active: e.target.checked }))} />Active</label>
                    <button type="button" onClick={createJurisdiction} disabled={rowMutationStates['create-jurisdiction']?.pending} className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{rowMutationStates['create-jurisdiction']?.pending ? 'Saving...' : 'Create'}</button>
                </div>
                {rowMutationStates['create-jurisdiction']?.error ? <p className="mt-1 text-xs text-red-600">{rowMutationStates['create-jurisdiction']?.error}</p> : null}
                <div className="mt-3 space-y-2">
                    {visibleJurisdictions.map((item) => {
                        const draft = jurisdictionDrafts[item.id]
                        if (!draft) return null
                        const rowKey = `jurisdiction:${item.id}`
                        return (
                            <article key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                                    <input value={draft.name} onChange={(e) => setJurisdictionDrafts((prev) => ({ ...prev, [item.id]: { ...draft, name: e.target.value } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                                    <select value={draft.type} onChange={(e) => setJurisdictionDrafts((prev) => ({ ...prev, [item.id]: { ...draft, type: e.target.value as ComplianceJurisdictionRow['type'] } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">{jurisdictionTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                                    <select value={draft.state_code} onChange={(e) => setJurisdictionDrafts((prev) => ({ ...prev, [item.id]: { ...draft, state_code: e.target.value } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">{stateCodeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                                    <select value={draft.parent_id ?? ''} onChange={(e) => setJurisdictionDrafts((prev) => ({ ...prev, [item.id]: { ...draft, parent_id: e.target.value || null } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs"><option value="">No parent</option>{complianceJurisdictions.filter((j) => j.id !== item.id).map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</select>
                                    <label className="flex items-center gap-1 text-xs text-slate-700"><input type="checkbox" checked={draft.is_active} onChange={(e) => setJurisdictionDrafts((prev) => ({ ...prev, [item.id]: { ...draft, is_active: e.target.checked } }))} />Active</label>
                                    <div className="flex gap-1"><button type="button" onClick={() => updateJurisdiction(item.id)} disabled={rowMutationStates[rowKey]?.pending} className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">{rowMutationStates[rowKey]?.pending ? 'Saving...' : 'Save'}</button><button type="button" onClick={() => deleteJurisdiction(item.id)} disabled={rowMutationStates[rowKey]?.pending} className="rounded-lg bg-red-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">Delete</button></div>
                                </div>
                                {rowMutationStates[rowKey]?.error ? <p className="mt-1 text-xs text-red-600">{rowMutationStates[rowKey]?.error}</p> : null}
                            </article>
                        )
                    })}
                </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 p-4">
                <h2 className="text-lg font-semibold text-slate-900">Compliance Offices</h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                    <select value={newOffice.jurisdiction_id} onChange={(e) => setNewOffice((prev) => ({ ...prev, jurisdiction_id: e.target.value }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs"><option value="">Jurisdiction</option>{visibleJurisdictions.map((j) => <option key={j.id} value={j.id}>{j.state_code} - {j.name}</option>)}</select>
                    <input value={newOffice.office_name} onChange={(e) => setNewOffice((prev) => ({ ...prev, office_name: e.target.value }))} placeholder="Office name" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <input value={newOffice.office_level} onChange={(e) => setNewOffice((prev) => ({ ...prev, office_level: e.target.value }))} placeholder="Office level" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <input value={newOffice.election_cycle} onChange={(e) => setNewOffice((prev) => ({ ...prev, election_cycle: e.target.value }))} placeholder="Election cycle" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <label className="flex items-center gap-1 text-xs text-slate-700"><input type="checkbox" checked={newOffice.is_active} onChange={(e) => setNewOffice((prev) => ({ ...prev, is_active: e.target.checked }))} />Active</label>
                    <button type="button" onClick={createOffice} disabled={rowMutationStates['create-office']?.pending} className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{rowMutationStates['create-office']?.pending ? 'Saving...' : 'Create'}</button>
                </div>
                {rowMutationStates['create-office']?.error ? <p className="mt-1 text-xs text-red-600">{rowMutationStates['create-office']?.error}</p> : null}
                <div className="mt-3 space-y-2">
                    {visibleOffices.map((item) => {
                        const draft = officeDrafts[item.id]
                        if (!draft) return null
                        const rowKey = `office:${item.id}`
                        return (
                            <article key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                                    <select value={draft.jurisdiction_id ?? ''} onChange={(e) => setOfficeDrafts((prev) => ({ ...prev, [item.id]: { ...draft, jurisdiction_id: e.target.value || null } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs"><option value="">Jurisdiction</option>{visibleJurisdictions.map((j) => <option key={j.id} value={j.id}>{j.state_code} - {j.name}</option>)}</select>
                                    <input value={draft.office_name} onChange={(e) => setOfficeDrafts((prev) => ({ ...prev, [item.id]: { ...draft, office_name: e.target.value } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                                    <input value={draft.office_level} onChange={(e) => setOfficeDrafts((prev) => ({ ...prev, [item.id]: { ...draft, office_level: e.target.value } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                                    <input value={draft.election_cycle ?? ''} onChange={(e) => setOfficeDrafts((prev) => ({ ...prev, [item.id]: { ...draft, election_cycle: e.target.value || null } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                                    <label className="flex items-center gap-1 text-xs text-slate-700"><input type="checkbox" checked={draft.is_active} onChange={(e) => setOfficeDrafts((prev) => ({ ...prev, [item.id]: { ...draft, is_active: e.target.checked } }))} />Active</label>
                                    <div className="flex gap-1"><button type="button" onClick={() => updateOffice(item.id)} disabled={rowMutationStates[rowKey]?.pending} className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">{rowMutationStates[rowKey]?.pending ? 'Saving...' : 'Save'}</button><button type="button" onClick={() => deleteOffice(item.id)} disabled={rowMutationStates[rowKey]?.pending} className="rounded-lg bg-red-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">Delete</button></div>
                                </div>
                                {rowMutationStates[rowKey]?.error ? <p className="mt-1 text-xs text-red-600">{rowMutationStates[rowKey]?.error}</p> : null}
                            </article>
                        )
                    })}
                </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 p-4">
                <h2 className="text-lg font-semibold text-slate-900">Compliance Rule Sets</h2>
                <p className="mt-1 text-sm text-slate-600">Activate, archive, and monitor jurisdiction rule sets.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
                    <select value={newRuleSet.jurisdiction_id} onChange={(e) => setNewRuleSet((prev) => ({ ...prev, jurisdiction_id: e.target.value }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs"><option value="">Jurisdiction</option>{visibleJurisdictions.map((j) => <option key={j.id} value={j.id}>{j.state_code} - {j.name}</option>)}</select>
                    <select value={newRuleSet.office_id} onChange={(e) => setNewRuleSet((prev) => ({ ...prev, office_id: e.target.value }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs"><option value="">Office (optional)</option>{visibleOffices.map((o) => <option key={o.id} value={o.id}>{o.office_name}</option>)}</select>
                    <input value={newRuleSet.name} onChange={(e) => setNewRuleSet((prev) => ({ ...prev, name: e.target.value }))} placeholder="Rule set name" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <input value={newRuleSet.effective_start} onChange={(e) => setNewRuleSet((prev) => ({ ...prev, effective_start: e.target.value }))} type="date" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <input value={newRuleSet.effective_end} onChange={(e) => setNewRuleSet((prev) => ({ ...prev, effective_end: e.target.value }))} type="date" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <select value={newRuleSet.status} onChange={(e) => setNewRuleSet((prev) => ({ ...prev, status: e.target.value as ComplianceRuleSetRow['status'] }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs"><option value="draft">draft</option><option value="active">active</option><option value="archived">archived</option></select>
                    <button type="button" onClick={createRuleSet} disabled={rowMutationStates['create-rule-set']?.pending} className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{rowMutationStates['create-rule-set']?.pending ? 'Saving...' : 'Create'}</button>
                </div>
                {rowMutationStates['create-rule-set']?.error ? <p className="mt-1 text-xs text-red-600">{rowMutationStates['create-rule-set']?.error}</p> : null}
                <div className="mt-3 space-y-2">
                    {visibleRuleSets.map((ruleSet) => {
                        const draft = ruleSetDrafts[ruleSet.id]
                        const jurisdiction = normalizeJurisdiction(ruleSet.jurisdiction)
                        if (!draft) return null
                        const rowKey = `rule-set:${ruleSet.id}`
                        return (
                            <article key={ruleSet.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
                                    <select value={draft.jurisdiction_id} onChange={(e) => setRuleSetDrafts((prev) => ({ ...prev, [ruleSet.id]: { ...draft, jurisdiction_id: e.target.value } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs"><option value="">Jurisdiction</option>{visibleJurisdictions.map((j) => <option key={j.id} value={j.id}>{j.state_code} - {j.name}</option>)}</select>
                                    <select value={draft.office_id} onChange={(e) => setRuleSetDrafts((prev) => ({ ...prev, [ruleSet.id]: { ...draft, office_id: e.target.value } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs"><option value="">Office</option>{visibleOffices.map((o) => <option key={o.id} value={o.id}>{o.office_name}</option>)}</select>
                                    <input value={draft.name} onChange={(e) => setRuleSetDrafts((prev) => ({ ...prev, [ruleSet.id]: { ...draft, name: e.target.value } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                                    <input value={draft.effective_start} onChange={(e) => setRuleSetDrafts((prev) => ({ ...prev, [ruleSet.id]: { ...draft, effective_start: e.target.value } }))} type="date" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                                    <input value={draft.effective_end} onChange={(e) => setRuleSetDrafts((prev) => ({ ...prev, [ruleSet.id]: { ...draft, effective_end: e.target.value } }))} type="date" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                                    <select value={draft.status} onChange={(e) => setRuleSetDrafts((prev) => ({ ...prev, [ruleSet.id]: { ...draft, status: e.target.value as ComplianceRuleSetRow['status'] } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs"><option value="draft">draft</option><option value="active">active</option><option value="archived">archived</option></select>
                                    <div className="flex gap-1"><button type="button" onClick={() => updateRuleSet(ruleSet.id)} disabled={rowMutationStates[rowKey]?.pending} className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">{rowMutationStates[rowKey]?.pending ? 'Saving...' : 'Save'}</button><button type="button" onClick={() => saveRuleSetStatus(ruleSet.id)} disabled={rowMutationStates[rowKey]?.pending} className="rounded-lg bg-slate-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">Sync Status</button><button type="button" onClick={() => deleteRuleSet(ruleSet.id)} disabled={rowMutationStates[rowKey]?.pending} className="rounded-lg bg-red-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">Delete</button></div>
                                </div>
                                <p className="mt-2 text-xs text-slate-500">{(jurisdiction?.state_code ?? 'N/A')} - {(jurisdiction?.name ?? 'No jurisdiction')} | v{ruleSet.version}</p>
                                {rowMutationStates[rowKey]?.error ? <p className="mt-1 text-xs text-red-600">{rowMutationStates[rowKey]?.error}</p> : null}
                            </article>
                        )
                    })}
                    {!isLoading && complianceRuleSets.length === 0 ? (
                        <p className="text-sm text-slate-600">No compliance rule sets found.</p>
                    ) : null}
                </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 p-4">
                <h2 className="text-lg font-semibold text-slate-900">Compliance Rules</h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <input
                        value={ruleSearchInput}
                        onChange={(event) => setRuleSearchInput(event.target.value)}
                        placeholder="Search rule code, title, or message"
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                    />
                    <label className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                            type="checkbox"
                            checked={showRuleErrorsOnly}
                            onChange={(event) => setShowRuleErrorsOnly(event.target.checked)}
                        />
                        Show only rows with errors
                    </label>
                    <p className="text-xs text-slate-500">{visibleRulesFiltered.length} matching rule row(s)</p>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
                    <select value={newRule.rule_set_id} onChange={(e) => setNewRule((prev) => ({ ...prev, rule_set_id: e.target.value }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs"><option value="">Rule set</option>{visibleRuleSets.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                    <input value={newRule.rule_code} onChange={(e) => setNewRule((prev) => ({ ...prev, rule_code: e.target.value }))} placeholder="Rule code" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <input value={newRule.title} onChange={(e) => setNewRule((prev) => ({ ...prev, title: e.target.value }))} placeholder="Title" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <select value={newRule.category} onChange={(e) => setNewRule((prev) => ({ ...prev, category: e.target.value as ComplianceRuleRow['category'] }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">{ruleCategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                    <select value={newRule.severity} onChange={(e) => setNewRule((prev) => ({ ...prev, severity: e.target.value as ComplianceRuleRow['severity'] }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">{ruleSeverityOptions.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                    <input value={newRule.message} onChange={(e) => setNewRule((prev) => ({ ...prev, message: e.target.value }))} placeholder="Message" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <button type="button" onClick={createRule} disabled={rowMutationStates['create-rule']?.pending} className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{rowMutationStates['create-rule']?.pending ? 'Saving...' : 'Create'}</button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            const result = formatConditionJson(newRule.condition_text, true)
                            if (!result.value) {
                                setRowError('create-rule', result.error)
                                return
                            }
                            clearRowError('create-rule')
                            setNewRule((prev) => ({ ...prev, condition_text: result.value ?? prev.condition_text }))
                        }}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                        Pretty JSON
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            const result = formatConditionJson(newRule.condition_text, false)
                            if (!result.value) {
                                setRowError('create-rule', result.error)
                                return
                            }
                            clearRowError('create-rule')
                            setNewRule((prev) => ({ ...prev, condition_text: result.value ?? prev.condition_text }))
                        }}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                        Compact JSON
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsCreateConditionExpanded((prev) => !prev)}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                        {isCreateConditionExpanded ? 'Collapse Editor' : 'Expand Editor'}
                    </button>
                </div>
                <textarea
                    value={newRule.condition_text}
                    onChange={(e) => setNewRule((prev) => ({ ...prev, condition_text: e.target.value }))}
                    placeholder="Condition JSON"
                    className={`mt-2 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs font-mono ${isCreateConditionExpanded ? 'h-56' : 'h-20'}`}
                />
                {rowMutationStates['create-rule']?.error ? <p className="mt-1 text-xs text-red-600">{rowMutationStates['create-rule']?.error}</p> : null}
                <div className="mt-3 space-y-2">
                    {visibleRulesFiltered.map((item) => {
                        const draft = ruleDrafts[item.id]
                        if (!draft) return null
                        const rowKey = `rule:${item.id}`
                        const isExpanded = expandedRuleConditionEditors[item.id] ?? false
                        return (
                            <article key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
                                    <p className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">{item.rule_code}</p>
                                    <input value={draft.title} onChange={(e) => setRuleDrafts((prev) => ({ ...prev, [item.id]: { ...draft, title: e.target.value } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                                    <select value={draft.category} onChange={(e) => setRuleDrafts((prev) => ({ ...prev, [item.id]: { ...draft, category: e.target.value as ComplianceRuleRow['category'] } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">{ruleCategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                                    <select value={draft.severity} onChange={(e) => setRuleDrafts((prev) => ({ ...prev, [item.id]: { ...draft, severity: e.target.value as ComplianceRuleRow['severity'] } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">{ruleSeverityOptions.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                                    <input value={draft.message} onChange={(e) => setRuleDrafts((prev) => ({ ...prev, [item.id]: { ...draft, message: e.target.value } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                                    <label className="flex items-center gap-1 text-xs text-slate-700"><input type="checkbox" checked={draft.is_active} onChange={(e) => setRuleDrafts((prev) => ({ ...prev, [item.id]: { ...draft, is_active: e.target.checked } }))} />Active</label>
                                    <div className="flex gap-1"><button type="button" onClick={() => updateRule(item.id)} disabled={rowMutationStates[rowKey]?.pending} className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">{rowMutationStates[rowKey]?.pending ? 'Saving...' : 'Save'}</button><button type="button" onClick={() => deleteRule(item.id)} disabled={rowMutationStates[rowKey]?.pending} className="rounded-lg bg-red-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">Delete</button></div>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const result = formatConditionJson(draft.condition_text, true)
                                            if (!result.value) {
                                                setRowError(rowKey, result.error)
                                                return
                                            }
                                            clearRowError(rowKey)
                                            setRuleDrafts((prev) => ({ ...prev, [item.id]: { ...draft, condition_text: result.value ?? draft.condition_text } }))
                                        }}
                                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                                    >
                                        Pretty JSON
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const result = formatConditionJson(draft.condition_text, false)
                                            if (!result.value) {
                                                setRowError(rowKey, result.error)
                                                return
                                            }
                                            clearRowError(rowKey)
                                            setRuleDrafts((prev) => ({ ...prev, [item.id]: { ...draft, condition_text: result.value ?? draft.condition_text } }))
                                        }}
                                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                                    >
                                        Compact JSON
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setExpandedRuleConditionEditors((prev) => ({ ...prev, [item.id]: !isExpanded }))}
                                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                                    >
                                        {isExpanded ? 'Collapse Editor' : 'Expand Editor'}
                                    </button>
                                </div>
                                <textarea value={draft.condition_text} onChange={(e) => setRuleDrafts((prev) => ({ ...prev, [item.id]: { ...draft, condition_text: e.target.value } }))} className={`mt-2 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs font-mono ${isExpanded ? 'h-56' : 'h-20'}`} />
                                {rowMutationStates[rowKey]?.error ? <p className="mt-1 text-xs text-red-600">{rowMutationStates[rowKey]?.error}</p> : null}
                            </article>
                        )
                    })}
                    {!isLoading && visibleRulesFiltered.length === 0 ? <p className="text-sm text-slate-600">No rules match current filters.</p> : null}
                </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 p-4">
                <h2 className="text-lg font-semibold text-slate-900">Compliance Required Forms</h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                    <select value={newRequiredForm.rule_set_id} onChange={(e) => setNewRequiredForm((prev) => ({ ...prev, rule_set_id: e.target.value }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs"><option value="">Rule set</option>{visibleRuleSets.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                    <input value={newRequiredForm.form_name} onChange={(e) => setNewRequiredForm((prev) => ({ ...prev, form_name: e.target.value }))} placeholder="Form name" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <input value={newRequiredForm.form_code} onChange={(e) => setNewRequiredForm((prev) => ({ ...prev, form_code: e.target.value }))} placeholder="Form code" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <input value={newRequiredForm.filing_url} onChange={(e) => setNewRequiredForm((prev) => ({ ...prev, filing_url: e.target.value }))} placeholder="Filing URL" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <label className="flex items-center gap-1 text-xs text-slate-700"><input type="checkbox" checked={newRequiredForm.is_active} onChange={(e) => setNewRequiredForm((prev) => ({ ...prev, is_active: e.target.checked }))} />Active</label>
                    <button type="button" onClick={createRequiredForm} disabled={rowMutationStates['create-required-form']?.pending} className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{rowMutationStates['create-required-form']?.pending ? 'Saving...' : 'Create'}</button>
                </div>
                {rowMutationStates['create-required-form']?.error ? <p className="mt-1 text-xs text-red-600">{rowMutationStates['create-required-form']?.error}</p> : null}
                <div className="mt-3 space-y-2">
                    {visibleRequiredForms.map((item) => {
                        const draft = requiredFormDrafts[item.id]
                        if (!draft) return null
                        const rowKey = `required-form:${item.id}`
                        return (
                            <article key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                                    <select value={draft.rule_set_id ?? ''} onChange={(e) => setRequiredFormDrafts((prev) => ({ ...prev, [item.id]: { ...draft, rule_set_id: e.target.value || null } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs"><option value="">Rule set</option>{visibleRuleSets.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                                    <input value={draft.form_name} onChange={(e) => setRequiredFormDrafts((prev) => ({ ...prev, [item.id]: { ...draft, form_name: e.target.value } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                                    <input value={draft.form_code ?? ''} onChange={(e) => setRequiredFormDrafts((prev) => ({ ...prev, [item.id]: { ...draft, form_code: e.target.value || null } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                                    <input value={draft.filing_url ?? ''} onChange={(e) => setRequiredFormDrafts((prev) => ({ ...prev, [item.id]: { ...draft, filing_url: e.target.value || null } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                                    <label className="flex items-center gap-1 text-xs text-slate-700"><input type="checkbox" checked={draft.is_active} onChange={(e) => setRequiredFormDrafts((prev) => ({ ...prev, [item.id]: { ...draft, is_active: e.target.checked } }))} />Active</label>
                                    <div className="flex gap-1"><button type="button" onClick={() => updateRequiredForm(item.id)} disabled={rowMutationStates[rowKey]?.pending} className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">{rowMutationStates[rowKey]?.pending ? 'Saving...' : 'Save'}</button><button type="button" onClick={() => deleteRequiredForm(item.id)} disabled={rowMutationStates[rowKey]?.pending} className="rounded-lg bg-red-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">Delete</button></div>
                                </div>
                                {rowMutationStates[rowKey]?.error ? <p className="mt-1 text-xs text-red-600">{rowMutationStates[rowKey]?.error}</p> : null}
                            </article>
                        )
                    })}
                </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 p-4">
                <h2 className="text-lg font-semibold text-slate-900">Compliance Deadline Rules</h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                    <select value={newDeadlineRule.rule_set_id} onChange={(e) => setNewDeadlineRule((prev) => ({ ...prev, rule_set_id: e.target.value }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs"><option value="">Rule set</option>{visibleRuleSets.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                    <input value={newDeadlineRule.title} onChange={(e) => setNewDeadlineRule((prev) => ({ ...prev, title: e.target.value }))} placeholder="Title" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <select value={newDeadlineRule.deadline_type} onChange={(e) => setNewDeadlineRule((prev) => ({ ...prev, deadline_type: e.target.value as ComplianceDeadlineRuleRow['deadline_type'] }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">{deadlineTypeOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                    <input value={String(newDeadlineRule.offset_days)} onChange={(e) => setNewDeadlineRule((prev) => ({ ...prev, offset_days: Number(e.target.value || 0) }))} type="number" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <input value={newDeadlineRule.severity} onChange={(e) => setNewDeadlineRule((prev) => ({ ...prev, severity: e.target.value }))} placeholder="Severity" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <button type="button" onClick={createDeadlineRule} disabled={rowMutationStates['create-deadline-rule']?.pending} className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{rowMutationStates['create-deadline-rule']?.pending ? 'Saving...' : 'Create'}</button>
                </div>
                {rowMutationStates['create-deadline-rule']?.error ? <p className="mt-1 text-xs text-red-600">{rowMutationStates['create-deadline-rule']?.error}</p> : null}
                <div className="mt-3 space-y-2">
                    {visibleDeadlineRules.map((item) => {
                        const draft = deadlineRuleDrafts[item.id]
                        if (!draft) return null
                        const rowKey = `deadline-rule:${item.id}`
                        return (
                            <article key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                                    <select value={draft.rule_set_id ?? ''} onChange={(e) => setDeadlineRuleDrafts((prev) => ({ ...prev, [item.id]: { ...draft, rule_set_id: e.target.value || null } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs"><option value="">Rule set</option>{visibleRuleSets.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                                    <input value={draft.title} onChange={(e) => setDeadlineRuleDrafts((prev) => ({ ...prev, [item.id]: { ...draft, title: e.target.value } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                                    <select value={draft.deadline_type} onChange={(e) => setDeadlineRuleDrafts((prev) => ({ ...prev, [item.id]: { ...draft, deadline_type: e.target.value as ComplianceDeadlineRuleRow['deadline_type'] } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">{deadlineTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                                    <input type="number" value={String(draft.offset_days ?? 0)} onChange={(e) => setDeadlineRuleDrafts((prev) => ({ ...prev, [item.id]: { ...draft, offset_days: Number(e.target.value || 0) } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                                    <input value={draft.severity ?? ''} onChange={(e) => setDeadlineRuleDrafts((prev) => ({ ...prev, [item.id]: { ...draft, severity: e.target.value || null } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                                    <div className="flex gap-1"><button type="button" onClick={() => updateDeadlineRule(item.id)} disabled={rowMutationStates[rowKey]?.pending} className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">{rowMutationStates[rowKey]?.pending ? 'Saving...' : 'Save'}</button><button type="button" onClick={() => deleteDeadlineRule(item.id)} disabled={rowMutationStates[rowKey]?.pending} className="rounded-lg bg-red-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">Delete</button></div>
                                </div>
                                {rowMutationStates[rowKey]?.error ? <p className="mt-1 text-xs text-red-600">{rowMutationStates[rowKey]?.error}</p> : null}
                            </article>
                        )
                    })}
                </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 p-4">
                <h2 className="text-lg font-semibold text-slate-900">Email Reminder Engine</h2>
                <p className="mt-1 text-sm text-slate-600">
                    Trigger the deadline reminder edge function now. Use dry-run first, then live send.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => runDeadlineReminderEngine(true)}
                        disabled={reminderRunMode !== null}
                        className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-600 disabled:opacity-60"
                    >
                        {reminderRunMode === 'dry-run' ? 'Running Dry-Run...' : 'Run Dry-Run'}
                    </button>
                    <button
                        type="button"
                        onClick={() => runDeadlineReminderEngine(false)}
                        disabled={reminderRunMode !== null}
                        className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                    >
                        {reminderRunMode === 'live' ? 'Running Live Send...' : 'Run Live Send'}
                    </button>
                </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 p-4">
                <h2 className="text-lg font-semibold text-slate-900">Approve Users</h2>
                <p className="mt-1 text-sm text-slate-600">Review account status and assign platform roles.</p>
                <div className="mt-3 space-y-3">
                    {users.map((user) => (
                        <article key={user.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="font-semibold text-slate-900">{user.full_name ?? user.email}</p>
                                    <p className="text-sm text-slate-600">{user.email}</p>
                                    <p className="text-xs text-slate-500">
                                        Status: {user.approval_status} | Created: {new Date(user.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <select
                                        value={roleDrafts[user.id] ?? user.role}
                                        onChange={(event) =>
                                            setRoleDrafts((prev) => ({ ...prev, [user.id]: event.target.value as RoleValue }))
                                        }
                                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                                    >
                                        {roleOptions.map((option) => (
                                            <option key={option} value={option}>
                                                {option}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => saveUserRole(user.id)}
                                        className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-700"
                                    >
                                        Save Role
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => approveUser(user.id, 'approved')}
                                        className="rounded-lg bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-600"
                                    >
                                        Approve
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => approveUser(user.id, 'pending')}
                                        className="rounded-lg bg-amber-600 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-500"
                                    >
                                        Set Pending
                                    </button>
                                </div>
                            </div>
                        </article>
                    ))}
                    {!isLoading && users.length === 0 ? <p className="text-sm text-slate-600">No users found.</p> : null}
                </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 p-4">
                <h2 className="text-lg font-semibold text-slate-900">Verify Treasurers</h2>
                <div className="mt-3 space-y-3">
                    {treasurers.map((treasurer) => (
                        <article key={treasurer.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="font-semibold text-slate-900">{treasurer.full_name}</p>
                                    <p className="text-sm text-slate-600">{treasurer.email ?? 'No email provided'}</p>
                                    <p className="text-xs text-slate-500">
                                        {treasurer.is_verified ? 'Verified' : 'Unverified'}
                                        {treasurer.verified_at ? ` | Verified at: ${new Date(treasurer.verified_at).toLocaleString()}` : ''}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => toggleTreasurerVerification(treasurer)}
                                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                                >
                                    {treasurer.is_verified ? 'Unverify' : 'Verify'}
                                </button>
                            </div>
                        </article>
                    ))}
                    {!isLoading && treasurers.length === 0 ? <p className="text-sm text-slate-600">No treasurers found.</p> : null}
                </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 p-4">
                <h2 className="text-lg font-semibold text-slate-900">View Campaigns</h2>
                <div className="mt-3 space-y-2">
                    {campaigns.map((campaign) => {
                        const candidate = normalizeCandidate(campaign.candidate)
                        return (
                            <article key={campaign.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <p className="font-semibold text-slate-900">{campaign.campaign_name?.trim() || 'Unnamed campaign'}</p>
                                <p className="text-sm text-slate-600">Status: {campaign.status}</p>
                                {candidate ? (
                                    <p className="text-sm text-slate-600">
                                        {candidate.office_title} | {candidate.jurisdiction}
                                    </p>
                                ) : null}
                            </article>
                        )
                    })}
                    {!isLoading && campaigns.length === 0 ? <p className="text-sm text-slate-600">No campaigns found.</p> : null}
                </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 p-4">
                <h2 className="text-lg font-semibold text-slate-900">Review Documents</h2>
                <div className="mt-3 space-y-2">
                    {documents.map((document) => (
                        <article key={document.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="font-semibold text-slate-900">{document.title}</p>
                                    <p className="text-sm text-slate-600">Type: {document.document_type ?? 'general'}</p>
                                    <p className="text-xs text-slate-500">Owner: {document.user_id}</p>
                                    <p className="text-xs text-slate-500">Path: {document.file_path}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => openDocument(document.file_path)}
                                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                                >
                                    Open
                                </button>
                            </div>
                        </article>
                    ))}
                    {!isLoading && documents.length === 0 ? <p className="text-sm text-slate-600">No documents found.</p> : null}
                </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 p-4">
                <h2 className="text-lg font-semibold text-slate-900">Manage Deadlines</h2>
                <div className="mt-3 space-y-3">
                    {deadlines.map((deadline) => {
                        const candidate = normalizeCandidate(deadline.candidate)
                        return (
                            <article key={deadline.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <p className="font-semibold text-slate-900">{deadline.label}</p>
                                {candidate ? (
                                    <p className="text-sm text-slate-600">
                                        {candidate.campaign_name} | {candidate.office_title} | {candidate.jurisdiction}
                                    </p>
                                ) : null}
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <input
                                        type="date"
                                        value={dueDateDrafts[deadline.id] ?? deadline.due_date}
                                        onChange={(event) =>
                                            setDueDateDrafts((prev) => ({ ...prev, [deadline.id]: event.target.value }))
                                        }
                                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => saveDeadlineDueDate(deadline)}
                                        className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-700"
                                    >
                                        Save Date
                                    </button>
                                    <select
                                        value={deadline.status}
                                        onChange={(event) => updateDeadlineStatus(deadline.id, event.target.value)}
                                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                                    >
                                        {deadlineStatusOptions.map((statusOption) => (
                                            <option key={statusOption} value={statusOption}>
                                                {statusOption}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </article>
                        )
                    })}
                    {!isLoading && deadlines.length === 0 ? <p className="text-sm text-slate-600">No deadlines found.</p> : null}
                </div>
            </div>
        </section>
    )
}

export default AdminConsole

