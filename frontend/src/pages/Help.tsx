import { Link } from 'react-router-dom'

function Help() {
    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Help Center</h1>
            <p className="mt-3 text-slate-600">Practical guidance to help candidates and teams get started quickly and stay compliant.</p>

            <div className="mt-6 space-y-4">
                <article className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <h2 className="text-base font-semibold text-amber-900">Getting Started</h2>
                    <ul className="mt-2 list-disc pl-5 text-sm text-amber-900/90">
                        <li>Create your account and confirm your email.</li>
                        <li>Complete your candidate profile and campaign basics.</li>
                        <li>Open the Campaign Launch Wizard to set your first milestones.</li>
                    </ul>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Link to="/welcome" className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600">
                            Open Start Here
                        </Link>
                        <Link to="/campaign-launch" className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100">
                            Launch Wizard
                        </Link>
                    </div>
                </article>

                <article className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <h2 className="text-base font-semibold text-blue-900">Campaign Finance Basics</h2>
                    <ul className="mt-2 list-disc pl-5 text-sm text-blue-900/90">
                        <li>Track every donation and expense as close to real-time as possible.</li>
                        <li>Keep source documents and receipts attached to each record.</li>
                        <li>Review filing validation before submission deadlines.</li>
                    </ul>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Link to="/donations" className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600">
                            Donations
                        </Link>
                        <Link to="/expenses" className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600">
                            Expenses
                        </Link>
                        <Link to="/filing-validation" className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100">
                            Filing Validation
                        </Link>
                    </div>
                </article>

                <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <h2 className="text-base font-semibold text-emerald-900">Treasurer Guide</h2>
                    <ul className="mt-2 list-disc pl-5 text-sm text-emerald-900/90">
                        <li>Set up your treasurer profile and qualifications.</li>
                        <li>Review and respond to assignment requests promptly.</li>
                        <li>Use the assignment panel to manage active campaign pairings.</li>
                    </ul>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Link to="/treasurer-profile" className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600">
                            Treasurer Profile
                        </Link>
                        <Link to="/treasurer-assignments" className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100">
                            Assignments
                        </Link>
                    </div>
                </article>

                <article className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-4">
                    <h2 className="text-base font-semibold text-fuchsia-900">Volunteer Guide</h2>
                    <ul className="mt-2 list-disc pl-5 text-sm text-fuchsia-900/90">
                        <li>Create your volunteer profile with skills and availability.</li>
                        <li>Review open campaign needs and apply with clear notes.</li>
                        <li>Track application status and follow up quickly.</li>
                    </ul>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Link to="/volunteer-profile" className="rounded-lg bg-fuchsia-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-fuchsia-600">
                            Volunteer Profile
                        </Link>
                        <Link to="/volunteer-matching" className="rounded-lg border border-fuchsia-300 bg-white px-3 py-1.5 text-xs font-semibold text-fuchsia-900 hover:bg-fuchsia-100">
                            Volunteer Matching
                        </Link>
                    </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h2 className="text-base font-semibold text-slate-900">Frequently Asked Questions</h2>
                    <dl className="mt-3 space-y-3 text-sm text-slate-700">
                        <div>
                            <dt className="font-semibold text-slate-900">Do I need to pay to use CCSP?</dt>
                            <dd>CCSP is free for candidate day-to-day compliance and campaign operations.</dd>
                        </div>
                        <div>
                            <dt className="font-semibold text-slate-900">Where should I start if I am brand new?</dt>
                            <dd>Use Start Here, then complete Campaign Launch Wizard for your setup checklist.</dd>
                        </div>
                        <div>
                            <dt className="font-semibold text-slate-900">How do I avoid filing mistakes?</dt>
                            <dd>Keep documents organized, run Filing Validation, and review Reports before submission.</dd>
                        </div>
                        <div>
                            <dt className="font-semibold text-slate-900">Can I get compliance guidance inside the app?</dt>
                            <dd>Yes. Use AI Compliance Assistant for plain-English guidance with source citations.</dd>
                        </div>
                    </dl>
                    <Link
                        to="/ai-compliance-assistant"
                        className="mt-3 inline-block rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100"
                    >
                        Open AI Compliance Assistant
                    </Link>
                </article>

                <article className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                    <h2 className="text-base font-semibold text-rose-900">Contact Support</h2>
                    <p className="mt-2 text-sm text-rose-900/90">
                        Reach out for account access, role approvals, document issues, or any blocker that prevents compliance filing.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <a
                            href="mailto:ccspcivicos@gmail.com?subject=CCSP%20Support%20Request"
                            className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600"
                        >
                            Email Support
                        </a>
                        <Link to="/admin-console" className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100">
                            Admin Console
                        </Link>
                    </div>
                </article>
            </div>
        </section>
    )
}

export default Help
