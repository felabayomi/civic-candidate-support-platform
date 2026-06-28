import { supabase } from './supabaseClient'
import { selectPreferredRuleSet, shouldSkipRuleCodeForState, validateEvaluatorCondition } from './complianceEvaluator.helpers'

export type ComplianceSeverity = 'info' | 'warning' | 'blocking'

export type ComplianceResult = {
    ruleId: string
    ruleCode: string
    severity: ComplianceSeverity
    passed: boolean
    message: string
    recommendedAction?: string
    sourceUrl?: string
}

const localizeStateText = (text: string | null, stateCode: string) => {
    if (!text) return text
    const normalizedStateCode = (stateCode || '').trim().toUpperCase()
    if (!normalizedStateCode || normalizedStateCode === 'MD') {
        return text
    }

    return text.replace(/\bMaryland\b/g, normalizedStateCode)
}

type CampaignRow = {
    id: string
    candidate_id: string | null
    state_code: string | null
}

type RuleRow = {
    id: string
    rule_code: string
    severity: ComplianceSeverity
    condition: Record<string, unknown>
    message: string
    recommended_action: string | null
    source_url: string | null
}

type ResolvedRuleSetMeta = {
    id: string
    name: string
    version: string
}

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

const buildNoRuleSetWarning = (stateCode: string): ComplianceResult => ({
    ruleId: '__NO_RULE_SET__',
    ruleCode: 'NO-RULE-SET',
    severity: 'warning',
    passed: false,
    message: `No configured rule set found for campaign state ${stateCode}. Admin review required.`,
    recommendedAction: 'Configure and activate a compliance rule set for this state before filing.',
})

export async function runCampaignComplianceCheck(campaignId: string) {
    const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('id, candidate_id, state_code')
        .eq('id', campaignId)
        .maybeSingle<CampaignRow>()

    if (campaignError) throw campaignError
    if (!campaign) return [] as ComplianceResult[]

    const stateCode = (campaign.state_code || '').trim().toUpperCase() || 'ALL'

    const { data: activeRuleSets, error: activeRuleSetsError } = await supabase
        .from('campaign_active_rule_sets')
        .select('rule_set_id, effective_start')
        .eq('campaign_id', campaignId)
        .order('effective_start', { ascending: false })
        .limit(5)

    if (activeRuleSetsError) throw activeRuleSetsError

    let resolvedRuleSetId = activeRuleSets?.[0]?.rule_set_id ?? null
    let resolvedRuleSetMeta: ResolvedRuleSetMeta | null = null
    let usedFallbackRuleResolution = false
    let multipleRuleSetsDetected = (activeRuleSets?.length ?? 0) > 1

    if (!resolvedRuleSetId) {
        usedFallbackRuleResolution = true
        const today = new Date().toISOString().slice(0, 10)
        const stateFilters = Array.from(new Set([stateCode, 'ALL']))

        const { data: fallbackRuleSets, error: fallbackRuleSetsError } = await supabase
            .from('compliance_rule_sets')
            .select('id, state_code, effective_start, name, version')
            .in('state_code', stateFilters)
            .eq('status', 'active')
            .lte('effective_start', today)
            .or(`effective_end.is.null,effective_end.gte.${today}`)
            .order('effective_start', { ascending: false })

        if (fallbackRuleSetsError) throw fallbackRuleSetsError

        const orderedFallbackRuleSets = (fallbackRuleSets ?? []) as Array<{ id: string; state_code: string; effective_start: string | null; name: string; version: string }>
        const selection = selectPreferredRuleSet(stateCode, orderedFallbackRuleSets)

        multipleRuleSetsDetected = selection.multipleRuleSetsDetected
        resolvedRuleSetId = selection.selectedRuleSetId
        const selectedFallbackRuleSet = orderedFallbackRuleSets.find((item) => item.id === selection.selectedRuleSetId)
        if (selectedFallbackRuleSet) {
            resolvedRuleSetMeta = {
                id: selectedFallbackRuleSet.id,
                name: selectedFallbackRuleSet.name,
                version: selectedFallbackRuleSet.version,
            }
        }
    }

    if (!resolvedRuleSetId) {
        const noRuleSetWarning = buildNoRuleSetWarning(stateCode)
        await persistComplianceValidationRun({
            campaignId,
            candidateId: campaign.candidate_id,
            ruleSetId: null,
            stateCode,
            results: [noRuleSetWarning],
            usedFallbackRuleResolution,
            multipleRuleSetsDetected,
            note: 'No active rule set resolved for campaign.',
        })
        return [noRuleSetWarning]
    }

    if (!resolvedRuleSetMeta) {
        const { data: resolvedRuleSet } = await supabase
            .from('compliance_rule_sets')
            .select('id, name, version')
            .eq('id', resolvedRuleSetId)
            .maybeSingle<{ id: string; name: string; version: string }>()

        if (resolvedRuleSet) {
            resolvedRuleSetMeta = {
                id: resolvedRuleSet.id,
                name: resolvedRuleSet.name,
                version: resolvedRuleSet.version,
            }
        }
    }

    const { data: rules, error: rulesError } = await supabase
        .from('compliance_rules')
        .select('*')
        .eq('rule_set_id', resolvedRuleSetId)
        .eq('is_active', true)

    if (rulesError) throw rulesError

    const results: ComplianceResult[] = []

    for (const rule of (rules ?? []) as RuleRow[]) {
        if (shouldSkipRuleCodeForState(rule.rule_code, stateCode)) {
            continue
        }

        const passed = await evaluateRule(campaignId, campaign.candidate_id, rule.condition)
        const localizedMessage = localizeStateText(rule.message, stateCode) ?? rule.message
        const localizedRecommendedAction = localizeStateText(rule.recommended_action, stateCode)

        results.push({
            ruleId: rule.id,
            ruleCode: rule.rule_code,
            severity: rule.severity,
            passed,
            message: localizedMessage,
            recommendedAction: localizedRecommendedAction ?? undefined,
            sourceUrl: rule.source_url ?? undefined,
        })
    }

    await persistComplianceValidationRun({
        campaignId,
        candidateId: campaign.candidate_id,
        ruleSetId: resolvedRuleSetId,
        ruleSetName: resolvedRuleSetMeta?.name ?? null,
        ruleSetVersion: resolvedRuleSetMeta?.version ?? null,
        stateCode,
        results,
        usedFallbackRuleResolution,
        multipleRuleSetsDetected,
    })

    return results
}

type PersistRunInput = {
    campaignId: string
    candidateId: string | null
    ruleSetId: string | null
    ruleSetName?: string | null
    ruleSetVersion?: string | null
    stateCode: string
    results: ComplianceResult[]
    usedFallbackRuleResolution: boolean
    multipleRuleSetsDetected: boolean
    note?: string
}

async function persistComplianceValidationRun(input: PersistRunInput) {
    const { data: userData } = await supabase.auth.getUser()
    const actorUserId = userData.user?.id ?? null

    if (!actorUserId) return

    const failedResults = input.results.filter((result) => !result.passed)
    const blockingCount = failedResults.filter((result) => result.severity === 'blocking').length
    const warningCount = failedResults.filter((result) => result.severity === 'warning').length
    const infoCount = failedResults.filter((result) => result.severity === 'info').length
    const status = blockingCount > 0
        ? 'failed'
        : failedResults.length > 0
            ? 'completed'
            : 'passed'

    const { data: run, error: runInsertError } = await supabase
        .from('compliance_validation_runs')
        .insert({
            user_id: actorUserId,
            candidate_id: input.candidateId,
            campaign_id: input.campaignId,
            rule_set_id: input.ruleSetId,
            state_code: input.stateCode,
            report_type: 'campaign_compliance',
            validation_type: 'filing',
            status,
            blocking_count: blockingCount,
            warning_count: warningCount,
            info_count: infoCount,
            violations: failedResults.map((result) => ({
                ruleId: result.ruleId,
                ruleCode: result.ruleCode,
                severity: result.severity,
                message: result.message,
                recommendedAction: result.recommendedAction ?? null,
                sourceUrl: result.sourceUrl ?? null,
            })),
            context: {
                totalRules: input.results.length,
                failedRules: failedResults.length,
                usedFallbackRuleResolution: input.usedFallbackRuleResolution,
                multipleRuleSetsDetected: input.multipleRuleSetsDetected,
                ruleSetName: input.ruleSetName ?? null,
                ruleSetVersion: input.ruleSetVersion ?? null,
                note: input.note ?? null,
            },
        })
        .select('id')
        .maybeSingle<{ id: string }>()

    if (runInsertError || !run?.id) {
        return
    }

    if (input.results.length > 0) {
        await supabase.from('compliance_validation_results').insert(
            input.results.map((result) => ({
                run_id: run.id,
                rule_id: isUuid(result.ruleId) ? result.ruleId : null,
                severity: result.severity,
                passed: result.passed,
                message: result.message,
                recommended_action: result.recommendedAction ?? null,
                entity_type: 'campaign',
                entity_id: input.campaignId,
                source_url: result.sourceUrl ?? null,
            }))
        )
    }

    await supabase.from('audit_events').insert({
        actor_user_id: actorUserId,
        campaign_id: input.campaignId,
        event_type: 'compliance_validation_run',
        entity_type: 'campaign',
        entity_id: input.campaignId,
        metadata: {
            run_id: run.id,
            rule_set_id: input.ruleSetId,
            rule_set_name: input.ruleSetName ?? null,
            rule_set_version: input.ruleSetVersion ?? null,
            total_rules: input.results.length,
            failed_rules: failedResults.length,
            status,
            used_fallback_rule_resolution: input.usedFallbackRuleResolution,
            multiple_rule_sets_detected: input.multipleRuleSetsDetected,
        },
    })
}

export async function loadActiveRuleContextByState(stateCodeRaw: string) {
    const stateCode = (stateCodeRaw || '').trim().toUpperCase()

    const { data: jurisdictions } = await supabase
        .from('compliance_jurisdictions')
        .select('id')
        .eq('type', 'state')
        .eq('state_code', stateCode)
        .eq('is_active', true)
        .limit(1)

    const jurisdictionId = jurisdictions?.[0]?.id
    if (!jurisdictionId) return [] as RuleRow[]

    const { data: ruleSets } = await supabase
        .from('compliance_rule_sets')
        .select('id')
        .eq('jurisdiction_id', jurisdictionId)
        .eq('status', 'active')
        .lte('effective_start', new Date().toISOString().slice(0, 10))
        .or(`effective_end.is.null,effective_end.gte.${new Date().toISOString().slice(0, 10)}`)
        .order('effective_start', { ascending: false })
        .limit(1)

    const ruleSetId = ruleSets?.[0]?.id
    if (!ruleSetId) return [] as RuleRow[]

    const { data: rules } = await supabase
        .from('compliance_rules')
        .select('id, rule_code, severity, condition, message, recommended_action, source_url')
        .eq('rule_set_id', ruleSetId)
        .eq('is_active', true)
        .order('category', { ascending: true })

    return (rules ?? []) as RuleRow[]
}

async function evaluateRule(campaignId: string, candidateId: string | null, condition: any): Promise<boolean> {
    const conditionValidation = validateEvaluatorCondition(condition)
    if (!conditionValidation.valid) {
        return false
    }

    switch (conditionValidation.type) {
        case 'required_field':
            return checkRequiredField(campaignId, candidateId, condition)

        case 'minimum_count':
            return checkMinimumCount(campaignId, condition)

        case 'max_amount':
            return checkMaxAmount(campaignId, condition)

        default:
            return true
    }
}

async function checkRequiredField(campaignId: string, candidateId: string | null, condition: any) {
    const { table, field } = condition

    const normalizedTable = String(table || '').trim()

    if (normalizedTable === 'campaigns') {
        const { data, error } = await supabase
            .from('campaigns')
            .select(field)
            .eq('id', campaignId)
            .maybeSingle()

        if (error || !data || Array.isArray(data) || typeof data !== 'object') return false

        return Boolean((data as Record<string, unknown>)[String(field)])
    }

    if (normalizedTable === 'candidates') {
        const { data: campaignRow, error: campaignError } = await supabase
            .from('campaigns')
            .select('candidate_id')
            .eq('id', campaignId)
            .maybeSingle<{ candidate_id: string | null }>()

        if (campaignError || !campaignRow?.candidate_id) return false

        const { data, error } = await supabase
            .from('candidates')
            .select(field)
            .eq('id', campaignRow.candidate_id)
            .maybeSingle()

        if (error || !data || Array.isArray(data) || typeof data !== 'object') return false

        return Boolean((data as Record<string, unknown>)[String(field)])
    }

    const candidateScopedTables = new Set(['checklist_items', 'donations', 'expenses', 'reports', 'deadlines'])
    if (candidateScopedTables.has(normalizedTable)) {
        let resolvedCandidateId = candidateId
        if (!resolvedCandidateId) {
            const { data: campaignRow } = await supabase
                .from('campaigns')
                .select('candidate_id')
                .eq('id', campaignId)
                .maybeSingle<{ candidate_id: string | null }>()
            resolvedCandidateId = campaignRow?.candidate_id ?? null
        }

        if (!resolvedCandidateId) return false

        const { data, error } = await supabase
            .from(table)
            .select(field)
            .eq('candidate_id', resolvedCandidateId)
            .limit(1)
            .single()

        if (error || !data || Array.isArray(data) || typeof data !== 'object') return false

        return Boolean((data as Record<string, unknown>)[String(field)])
    }

    const { data, error } = await supabase
        .from(table)
        .select(field)
        .eq('campaign_id', campaignId)
        .limit(1)
        .single()

    if (error || !data) return false

    return Boolean(data[field])
}

async function checkMinimumCount(campaignId: string, condition: any) {
    const { table, minimum } = condition

    const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)

    if (error) return false

    return (count ?? 0) >= minimum
}

async function checkMaxAmount(campaignId: string, condition: any) {
    const { table, field, max } = condition

    const { data, error } = await supabase
        .from(table)
        .select(field)
        .eq('campaign_id', campaignId)

    if (error) return false

    const rows: Array<Record<string, unknown>> = Array.isArray(data)
        ? (data as unknown as Array<Record<string, unknown>>)
        : []
    return rows.every((row) => Number(row[String(field)]) <= Number(max))
}
