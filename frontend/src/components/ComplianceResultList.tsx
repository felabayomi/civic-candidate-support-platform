import type { ComplianceResult } from '../lib/complianceEvaluator'
import ComplianceSourceBadge from './ComplianceSourceBadge'

type ComplianceResultListProps = {
    results: ComplianceResult[]
}

function ComplianceResultList({ results }: ComplianceResultListProps) {
    if (results.length === 0) {
        return <p className="text-sm text-slate-600">No rules were returned for this validation run.</p>
    }

    return (
        <ul className="space-y-2">
            {results.map((result) => {
                const failed = !result.passed
                const isBlockingFailure = failed && result.severity === 'blocking'
                const statusLabel = failed
                    ? isBlockingFailure
                        ? 'Blocking issue (fix required before filing)'
                        : 'Advisory issue (does not block filing)'
                    : 'Passed'
                const recommendedAction = result.recommendedAction ?? (isBlockingFailure
                    ? 'Resolve this blocking issue before submitting filing materials.'
                    : 'Review this advisory item and address it when practical.')
                const borderClass = failed
                    ? result.severity === 'blocking'
                        ? 'border-red-200 bg-red-50'
                        : 'border-amber-200 bg-amber-50'
                    : 'border-emerald-200 bg-emerald-50'

                return (
                    <li key={result.ruleId} className={`rounded-lg border p-3 ${borderClass}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900">{result.ruleCode}</p>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold uppercase text-slate-700">{result.severity}</span>
                                <ComplianceSourceBadge sourceUrl={result.sourceUrl} />
                            </div>
                        </div>
                        <p className="mt-1 text-sm text-slate-700">Why: {result.message}</p>
                        <p className="mt-1 text-xs text-slate-600">Recommended action: {recommendedAction}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-700">{statusLabel}</p>
                    </li>
                )
            })}
        </ul>
    )
}

export default ComplianceResultList
