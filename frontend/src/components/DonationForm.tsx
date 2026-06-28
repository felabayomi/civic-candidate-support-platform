function DonationForm() {
    return (
        <form className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Donor name" />
            <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Amount" />
            <button type="button" className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white">
                Save Donation
            </button>
        </form>
    )
}

export default DonationForm
