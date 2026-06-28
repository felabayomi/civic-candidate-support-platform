export type EvaluatorConditionType = 'required_field' | 'minimum_count' | 'max_amount'

export type EvaluatorConditionValidationResult = {
    valid: boolean
    type?: EvaluatorConditionType
    error?: string
}

type ConditionMap = Record<string, unknown>

const isObjectCondition = (condition: unknown): condition is ConditionMap => {
    return Boolean(condition) && typeof condition === 'object' && !Array.isArray(condition)
}

export const validateEvaluatorCondition = (condition: unknown): EvaluatorConditionValidationResult => {
    if (!isObjectCondition(condition)) {
        return { valid: false, error: 'Malformed condition object.' }
    }

    const type = condition.type
    if (type !== 'required_field' && type !== 'minimum_count' && type !== 'max_amount') {
        return { valid: false, error: 'Unsupported condition type.' }
    }

    if (type === 'required_field') {
        if (typeof condition.table !== 'string' || condition.table.trim().length === 0) {
            return { valid: false, error: 'required_field requires a non-empty table.' }
        }
        if (typeof condition.field !== 'string' || condition.field.trim().length === 0) {
            return { valid: false, error: 'required_field requires a non-empty field.' }
        }
    }

    if (type === 'minimum_count') {
        if (typeof condition.table !== 'string' || condition.table.trim().length === 0) {
            return { valid: false, error: 'minimum_count requires a non-empty table.' }
        }
        const minimum = typeof condition.minimum === 'number' ? condition.minimum : Number(condition.minimum)
        if (!Number.isFinite(minimum)) {
            return { valid: false, error: 'minimum_count requires a numeric minimum.' }
        }
    }

    if (type === 'max_amount') {
        if (typeof condition.table !== 'string' || condition.table.trim().length === 0) {
            return { valid: false, error: 'max_amount requires a non-empty table.' }
        }
        if (typeof condition.field !== 'string' || condition.field.trim().length === 0) {
            return { valid: false, error: 'max_amount requires a non-empty field.' }
        }
        const max = typeof condition.max === 'number' ? condition.max : Number(condition.max)
        if (!Number.isFinite(max)) {
            return { valid: false, error: 'max_amount requires a numeric max.' }
        }
    }

    return { valid: true, type }
}

export type RuleSetCandidate = {
    id: string
    state_code: string
    effective_start: string | null
}

export type RuleSetSelection = {
    selectedRuleSetId: string | null
    multipleRuleSetsDetected: boolean
}

export const shouldSkipRuleCodeForState = (ruleCodeRaw: string, stateCodeRaw: string) => {
    const normalizedStateCode = (stateCodeRaw || '').trim().toUpperCase()
    if (!normalizedStateCode || normalizedStateCode === 'MD') {
        return false
    }

    return /^MD-/i.test(String(ruleCodeRaw || '').trim())
}

export const selectPreferredRuleSet = (stateCodeRaw: string, candidates: RuleSetCandidate[]): RuleSetSelection => {
    const stateCode = (stateCodeRaw || '').trim().toUpperCase() || 'ALL'

    if (!Array.isArray(candidates) || candidates.length === 0) {
        return {
            selectedRuleSetId: null,
            multipleRuleSetsDetected: false,
        }
    }

    const sorted = [...candidates].sort((a, b) => {
        if (a.state_code === stateCode && b.state_code !== stateCode) return -1
        if (a.state_code !== stateCode && b.state_code === stateCode) return 1

        const aDate = a.effective_start ?? ''
        const bDate = b.effective_start ?? ''
        if (aDate > bDate) return -1
        if (aDate < bDate) return 1

        return 0
    })

    return {
        selectedRuleSetId: sorted[0]?.id ?? null,
        multipleRuleSetsDetected: sorted.length > 1,
    }
}
