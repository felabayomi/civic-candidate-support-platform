type ComplianceSourceBadgeProps = {
    sourceUrl?: string
}

function ComplianceSourceBadge({ sourceUrl }: ComplianceSourceBadgeProps) {
    if (!sourceUrl) {
        return <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">No source</span>
    }

    return (
        <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
        >
            Source
        </a>
    )
}

export default ComplianceSourceBadge
