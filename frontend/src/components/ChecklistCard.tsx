type ChecklistCardProps = {
    title: string
    status: 'pending' | 'completed'
}

function ChecklistCard({ title, status }: ChecklistCardProps) {
    return (
        <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            <p className="mt-2 text-sm text-slate-600">Status: {status}</p>
        </article>
    )
}

export default ChecklistCard
