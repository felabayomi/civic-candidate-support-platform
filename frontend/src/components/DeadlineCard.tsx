type DeadlineCardProps = {
    label: string
    dueDate: string
}

function DeadlineCard({ label, dueDate }: DeadlineCardProps) {
    return (
        <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-800">{label}</h3>
            <p className="mt-2 text-sm text-slate-600">Due: {dueDate}</p>
        </article>
    )
}

export default DeadlineCard
