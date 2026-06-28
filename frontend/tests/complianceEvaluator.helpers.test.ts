import { describe, expect, it } from 'vitest'
import { selectPreferredRuleSet, shouldSkipRuleCodeForState, validateEvaluatorCondition } from '../src/lib/complianceEvaluator.helpers'

describe('validateEvaluatorCondition', () => {
    it('validates required_field conditions', () => {
        const result = validateEvaluatorCondition({
            type: 'required_field',
            table: 'candidates',
            field: 'jurisdiction',
        })

        expect(result.valid).toBe(true)
        expect(result.type).toBe('required_field')
    })

    it('validates minimum_count conditions', () => {
        const result = validateEvaluatorCondition({
            type: 'minimum_count',
            table: 'checklist_items',
            minimum: 1,
        })

        expect(result.valid).toBe(true)
        expect(result.type).toBe('minimum_count')
    })

    it('validates max_amount conditions', () => {
        const result = validateEvaluatorCondition({
            type: 'max_amount',
            table: 'donations',
            field: 'amount',
            max: 1000,
        })

        expect(result.valid).toBe(true)
        expect(result.type).toBe('max_amount')
    })

    it('rejects unknown condition type', () => {
        const result = validateEvaluatorCondition({
            type: 'unknown_rule',
        })

        expect(result.valid).toBe(false)
        expect(result.error).toContain('Unsupported condition type')
    })

    it('rejects malformed condition payload', () => {
        const result = validateEvaluatorCondition(null)

        expect(result.valid).toBe(false)
        expect(result.error).toContain('Malformed condition object')
    })
})

describe('selectPreferredRuleSet', () => {
    it('returns null when no active rule set exists', () => {
        const result = selectPreferredRuleSet('MD', [])

        expect(result.selectedRuleSetId).toBeNull()
        expect(result.multipleRuleSetsDetected).toBe(false)
    })

    it('detects multiple active rule sets and picks state-specific latest', () => {
        const result = selectPreferredRuleSet('MD', [
            { id: 'all-v1', state_code: 'ALL', effective_start: '2025-01-01' },
            { id: 'md-v1', state_code: 'MD', effective_start: '2025-01-01' },
            { id: 'md-v2', state_code: 'MD', effective_start: '2025-06-01' },
        ])

        expect(result.selectedRuleSetId).toBe('md-v2')
        expect(result.multipleRuleSetsDetected).toBe(true)
    })
})

describe('shouldSkipRuleCodeForState', () => {
    it('does not skip MD-prefixed rules for MD campaigns', () => {
        expect(shouldSkipRuleCodeForState('MD-FORM-001', 'MD')).toBe(false)
    })

    it('skips MD-prefixed rules for non-MD campaigns', () => {
        expect(shouldSkipRuleCodeForState('MD-FORM-001', 'VA')).toBe(true)
    })

    it('does not skip non-MD rule codes for non-MD campaigns', () => {
        expect(shouldSkipRuleCodeForState('CHK-001', 'VA')).toBe(false)
    })
})
