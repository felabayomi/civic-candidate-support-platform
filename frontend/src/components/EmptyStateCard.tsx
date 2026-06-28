type EmptyStateCardProps = {
    title: string
    message: string
    actionLabel: string
    onAction: () => void
}

function EmptyStateCard({ title, message, actionLabel, onAction }: EmptyStateCardProps) {
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="mt-1 text-sm text-slate-600">{message}</p>
            <button
                type="button"
                onClick={onAction}
                className="mt-3 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600"
            >
                {actionLabel}
            </button>
        </div>
    )
}

export default EmptyStateCard