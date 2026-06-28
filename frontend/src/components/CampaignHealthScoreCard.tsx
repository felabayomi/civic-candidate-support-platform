import type { CampaignHealthScoreResult } from '../lib/campaignHealthScore'

type CampaignHealthScoreCardProps = {
    health: CampaignHealthScoreResult
    className?: string
}

function CampaignHealthScoreCard({ health, className }: CampaignHealthScoreCardProps) {
    const statusClassName =
        health.status === 'Ready for Filing'
            ? 'text-emerald-700'
            : health.status === 'Nearly Ready'
                ? 'text-amber-700'
                : health.status === 'In Progress'
                    ? 'text-sky-700'
                    : 'text-slate-700'

    return (
        <article className={`rounded-xl border border-slate-200 bg-white p-4 ${className ?? ''}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Campaign Health Score</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
                Campaign Readiness {health.barText} {health.score}%
            </p>
            <p className={`text-sm font-semibold ${statusClassName}`}>{health.status}</p>
            <div className="mt-3 h-2.5 w-full rounded-full bg-slate-200" aria-hidden>
                <div className="h-2.5 rounded-full bg-emerald-500" style={{ width: `${health.score}%` }} />
            </div>
            <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50">
                {health.categories.map((category) => (
                    <li key={category.label} className="flex items-center justify-between px-3 py-2">
                        <span className="text-sm text-slate-700">{category.label}</span>
                        <span className="text-sm font-semibold text-slate-900">{category.score}%</span>
                    </li>
                ))}
            </ul>
        </article>
    )
}

export default CampaignHealthScoreCard
