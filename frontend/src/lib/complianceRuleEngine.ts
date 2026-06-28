import { supabase } from './supabaseClient'

export type ComplianceRequirement = {
    category: 'filing_requirements' | 'reporting_schedule' | 'contribution_limits' | 'banking_requirements' | 'required_forms' | 'election_calendar'
    rule_key: string
    title: string
    description: string | null
    severity: 'info' | 'warning' | 'error'
    config: Record<string, unknown>
}

export type FilingValidationInput = {
    userId: string
    candidateId?: string | null
    stateCode: string
    reportType: string
    donationTotal: number
    expenseTotal: number
    checklistCompleted: number
    checklistTotal: number
    hasUpcomingDeadline: boolean
    campaignHealthScore: number
}

export type FilingValidationIssue = {
    ruleKey: string
    title: string
    category: ComplianceRequirement['category']
    severity: ComplianceRequirement['severity']
    message: string
}

export type FilingValidationResult = {
    stateCode: string
    status: 'passed' | 'failed'
    issues: FilingValidationIssue[]
}

type RuleSetRow = {
    id: string
    state_code: string
}

type RequirementRow = {
    category: ComplianceRequirement['category']
    rule_key: string
    title: string
    description: string | null
    severity: ComplianceRequirement['severity']
    config: Record<string, unknown> | null
}

const normalizeStateCode = (stateCode: string) => {
    const normalized = (stateCode || '').trim().toUpperCase()
    return normalized.length === 2 ? normalized : 'ALL'
}

export const inferStateCodeFromJurisdiction = (jurisdiction: string | null | undefined) => {
    const value = (jurisdiction ?? '').trim()
    if (!value) return 'ALL'

    const match = value.match(/\b([A-Z]{2})\b$/)
    if (match?.[1]) return match[1]

    return 'ALL'
}

const fetchRequirementsForRuleSet = async (ruleSetId: string) => {
    const { data, error } = await supabase
        .from('compliance_rule_requirements')
        .select('category, rule_key, title, description, severity, config')
        .eq('rule_set_id', ruleSetId)
        .eq('is_active', true)
        .order('category', { ascending: true })

    if (error) return [] as ComplianceRequirement[]

    return ((data ?? []) as RequirementRow[]).map((row) => ({
        category: row.category,
        rule_key: row.rule_key,
        title: row.title,
        description: row.description,
        severity: row.severity,
        config: row.config ?? {},
    }))
}

export const fetchActiveComplianceRequirements = async (stateCodeRaw: string) => {
    const stateCode = normalizeStateCode(stateCodeRaw)

    const { data: stateRuleSet } = await supabase
        .from('compliance_rule_sets')
        .select('id, state_code')
        .eq('state_code', stateCode)
        .eq('is_active', true)
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle<RuleSetRow>()

    const { data: fallbackRuleSet } = await supabase
        .from('compliance_rule_sets')
        .select('id, state_code')
        .eq('state_code', 'ALL')
        .eq('is_active', true)
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle<RuleSetRow>()

    const [stateRequirements, fallbackRequirements] = await Promise.all([
        stateRuleSet?.id ? fetchRequirementsForRuleSet(stateRuleSet.id) : Promise.resolve([]),
        fallbackRuleSet?.id ? fetchRequirementsForRuleSet(fallbackRuleSet.id) : Promise.resolve([]),
    ])

    const merged = [...fallbackRequirements, ...stateRequirements]

    // state-specific entries override fallback by rule key.
    const byRuleKey = new Map<string, ComplianceRequirement>()
    merged.forEach((item) => {
        byRuleKey.set(item.rule_key, item)
    })

    return Array.from(byRuleKey.values())
}

export const buildComplianceRuleSummaryLines = (requirements: ComplianceRequirement[]) => {
    if (requirements.length === 0) {
        return ['No configured rule set found for this state. Use official election guidance and admin review.']
    }

    return requirements.map((item) => {
        const minPercent = typeof item.config.minPercent === 'number' ? ` min=${item.config.minPercent}%` : ''
        const minScore = typeof item.config.minScore === 'number' ? ` minScore=${item.config.minScore}` : ''
        return `${item.category}: ${item.title} (${item.rule_key}, severity=${item.severity}${minPercent}${minScore})`
    })
}

export const runFilingValidation = async (input: FilingValidationInput): Promise<FilingValidationResult> => {
    const requirements = await fetchActiveComplianceRequirements(input.stateCode)
    const issues: FilingValidationIssue[] = []

    requirements.forEach((requirement) => {
        if (requirement.rule_key === 'checklist_completion_min_percent') {
            const minimum = Number(requirement.config.minPercent ?? 80)
            const percent = input.checklistTotal > 0
                ? Math.round((input.checklistCompleted / input.checklistTotal) * 100)
                : 0

            if (percent < minimum) {
                issues.push({
                    ruleKey: requirement.rule_key,
                    title: requirement.title,
                    category: requirement.category,
                    severity: requirement.severity,
                    message: `Checklist completion is ${percent}% but requires at least ${minimum}% before filing.`,
                })
            }
        }

        if (requirement.rule_key === 'upcoming_deadline_required') {
            const mustHave = requirement.config.requireUpcomingDeadline !== false
            if (mustHave && !input.hasUpcomingDeadline) {
                issues.push({
                    ruleKey: requirement.rule_key,
                    title: requirement.title,
                    category: requirement.category,
                    severity: requirement.severity,
                    message: 'No upcoming deadline found. Add or verify a reporting deadline before submission.',
                })
            }
        }

        if (requirement.rule_key === 'non_negative_finance_totals') {
            if (input.donationTotal < 0 || input.expenseTotal < 0) {
                issues.push({
                    ruleKey: requirement.rule_key,
                    title: requirement.title,
                    category: requirement.category,
                    severity: requirement.severity,
                    message: 'Finance totals cannot be negative. Review donation and expense records.',
                })
            }
        }

        if (requirement.rule_key === 'campaign_health_score_min') {
            const minimum = Number(requirement.config.minScore ?? 75)
            if (input.campaignHealthScore < minimum) {
                issues.push({
                    ruleKey: requirement.rule_key,
                    title: requirement.title,
                    category: requirement.category,
                    severity: requirement.severity,
                    message: `Campaign health score is ${input.campaignHealthScore}, below required threshold ${minimum}.`,
                })
            }
        }
    })

    const status: FilingValidationResult['status'] = issues.some((item) => item.severity === 'error') ? 'failed' : 'passed'

    await supabase.from('compliance_validation_runs').insert({
        user_id: input.userId,
        candidate_id: input.candidateId ?? null,
        state_code: normalizeStateCode(input.stateCode),
        report_type: input.reportType,
        status,
        violations: issues,
        context: {
            donationTotal: input.donationTotal,
            expenseTotal: input.expenseTotal,
            checklistCompleted: input.checklistCompleted,
            checklistTotal: input.checklistTotal,
            hasUpcomingDeadline: input.hasUpcomingDeadline,
            campaignHealthScore: input.campaignHealthScore,
        },
    })

    return {
        stateCode: normalizeStateCode(input.stateCode),
        status,
        issues,
    }
}
