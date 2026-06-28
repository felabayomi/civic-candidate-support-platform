type ComplianceWarningProps = {
    title?: string
    warnings: string[]
    hasBlockingWarnings?: boolean
    onProceed?: () => void
    onCancel?: () => void
}

const warningHints: Record<string, string> = {
    'missing donor name': 'Enter the full legal name for the donor or vendor.',
    'missing donor address': 'Add donor or vendor contact details (address field can be added later).',
    'missing amount': 'Enter a positive amount greater than zero.',
    'missing date': 'Select the transaction date before saving.',
    'cash contribution': 'Confirm cash handling rules and include identifying notes or reference.',
    'large contribution': 'Verify contribution limits and source documentation before submission.',
    'missing receipt': 'Add a receipt/reference number or upload supporting proof in Documents.',
}

const getWarningHint = (warning: string) => warningHints[warning.toLowerCase()] ?? 'Review and complete this item before filing.'

function ComplianceWarning({
    title = 'Compliance Guardrails',
    warnings,
    hasBlockingWarnings = false,
    onProceed,
    onCancel,
}: ComplianceWarningProps) {
    if (warnings.length === 0) {
        return null
    }

    return (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
            <p className="text-sm font-semibold">{title}</p>
            <ul className="mt-2 list-disc pl-5 text-sm">
                {warnings.map((warning) => (
                    <li key={warning}>
                        <p>{warning}</p>
                        <p className="mt-1 text-xs text-amber-800">How to fix: {getWarningHint(warning)}</p>
                    </li>
                ))}
            </ul>

            <div className="mt-4 flex flex-wrap gap-2">
                {hasBlockingWarnings ? (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                    >
                        Fix Issues
                    </button>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={onProceed}
                            className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700"
                        >
                            Save Anyway
                        </button>
                        <button
                            type="button"
                            onClick={onCancel}
                            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                        >
                            Review Form
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}

export default ComplianceWarning