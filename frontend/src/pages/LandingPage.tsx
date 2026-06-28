import { Link } from 'react-router-dom';

export default function LandingPage() {
    return (
        <main className="min-h-screen bg-[#f8f4e8] text-slate-900">
            {/* Hero */}
            <section className="px-6 py-20">
                <div className="mx-auto max-w-6xl rounded-3xl bg-white p-8 shadow-sm border border-slate-200 md:p-14">
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1">
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-orange-800">Early Access Pilot</span>
                        <span className="text-xs text-orange-700">Built for real-world feedback from first-time candidates</span>
                    </div>

                    <p className="mb-4 text-sm font-bold uppercase tracking-[0.25em] text-orange-700">
                        CCSP Platform
                    </p>

                    <h1 className="max-w-4xl text-4xl font-bold leading-tight md:text-6xl">
                        Helping everyday people run for office with confidence.
                    </h1>

                    <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">
                        The Civic Candidate Support Platform helps first-time and community-based
                        candidates understand campaign setup, compliance tasks, treasurer coordination,
                        documents, volunteers, and reporting — all in one guided system.
                    </p>

                    <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                        <Link
                            to="/login"
                            className="rounded-xl bg-orange-700 px-6 py-3 text-center font-semibold text-white hover:bg-orange-800"
                        >
                            Get Started
                        </Link>

                        <a
                            href="#how-it-works"
                            className="rounded-xl border border-slate-300 px-6 py-3 text-center font-semibold text-slate-800 hover:bg-slate-50"
                        >
                            Learn How It Works
                        </a>
                    </div>

                    <div className="mt-6 max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-800">Legal Center</p>
                        <p className="mt-2 text-sm text-amber-900">
                            Review our privacy, terms, accessibility, cookie policy, and legal disclaimer before signup.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Link to="/privacy" className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100">
                                Privacy
                            </Link>
                            <Link to="/terms" className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100">
                                Terms
                            </Link>
                            <Link to="/legal-disclaimer" className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100">
                                Legal Disclaimer
                            </Link>
                        </div>
                    </div>

                    <div className="mt-8 grid gap-4 border-t border-slate-200 pt-8 md:grid-cols-3">
                        <div>
                            <p className="font-semibold">Nonpartisan</p>
                            <p className="text-sm text-slate-600">
                                Built to support civic participation, not political preference.
                            </p>
                        </div>

                        <div>
                            <p className="font-semibold">Guided</p>
                            <p className="text-sm text-slate-600">
                                Step-by-step tools for campaign setup and compliance readiness.
                            </p>
                        </div>

                        <div>
                            <p className="font-semibold">Accessible</p>
                            <p className="text-sm text-slate-600">
                                Designed to reduce administrative barriers for new candidates.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* What is CCSP */}
            <section className="px-6 py-12">
                <div className="mx-auto max-w-6xl">
                    <h2 className="text-3xl font-bold">What is CCSP?</h2>
                    <p className="mt-4 max-w-3xl text-slate-700 leading-7">
                        CCSP is a civic technology platform that gives candidates, treasurers,
                        volunteers, advisors, and administrators a shared place to coordinate the
                        practical work of running for office.
                    </p>
                </div>
            </section>

            {/* Who it is for */}
            <section className="px-6 py-12 bg-white">
                <div className="mx-auto max-w-6xl">
                    <h2 className="text-3xl font-bold">Who is it for?</h2>

                    <div className="mt-8 grid gap-6 md:grid-cols-4">
                        {[
                            ['First-Time Candidates', 'People exploring or launching a campaign.'],
                            ['Treasurers', 'Campaign finance helpers who support reporting and records.'],
                            ['Volunteers', 'Supporters looking for meaningful campaign roles.'],
                            ['Civic Organizations', 'Groups helping more people participate in democracy.'],
                        ].map(([title, text]) => (
                            <div key={title} className="rounded-2xl border border-slate-200 p-6">
                                <h3 className="font-bold">{title}</h3>
                                <p className="mt-3 text-sm text-slate-600">{text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Why it exists */}
            <section className="px-6 py-16">
                <div className="mx-auto max-w-6xl rounded-3xl bg-slate-900 p-8 text-white md:p-12">
                    <h2 className="text-3xl font-bold">Why CCSP exists</h2>
                    <p className="mt-4 max-w-4xl leading-8 text-slate-200">
                        Running for office should not require insider knowledge, expensive consultants,
                        or fear of making paperwork mistakes. CCSP exists to make campaign setup and
                        civic participation easier to understand, easier to organize, and easier to sustain.
                    </p>
                </div>
            </section>

            {/* How it works */}
            <section id="how-it-works" className="px-6 py-16 bg-white">
                <div className="mx-auto max-w-6xl">
                    <h2 className="text-3xl font-bold">How it works</h2>

                    <div className="mt-8 grid gap-6 md:grid-cols-3">
                        {[
                            ['1. Create your account', 'Choose your role and begin with guided onboarding.'],
                            ['2. Launch your campaign', 'Use checklists, documents, treasurer tools, and compliance reminders.'],
                            ['3. Stay organized', 'Track donations, expenses, reports, deadlines, and volunteer needs.'],
                        ].map(([title, text]) => (
                            <div key={title} className="rounded-2xl bg-[#f8f4e8] p-6">
                                <h3 className="font-bold">{title}</h3>
                                <p className="mt-3 text-sm text-slate-700">{text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features */}
            <section className="px-6 py-16">
                <div className="mx-auto max-w-6xl">
                    <h2 className="text-3xl font-bold">Platform features</h2>

                    <div className="mt-8 grid gap-6 md:grid-cols-3">
                        {[
                            'Campaign Launch Wizard',
                            'Compliance Checklist',
                            'Treasurer Marketplace',
                            'Donation & Expense Tracking',
                            'Document Uploads',
                            'Volunteer Matching',
                            'Deadline Reminders',
                            'Reports & CSV Export',
                            'AI Compliance Assistant',
                        ].map((feature) => (
                            <div key={feature} className="rounded-xl border border-slate-200 bg-white p-5 font-medium">
                                {feature}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Security */}
            <section className="px-6 py-16 bg-white">
                <div className="mx-auto max-w-6xl">
                    <h2 className="text-3xl font-bold">Security & privacy</h2>
                    <p className="mt-4 max-w-3xl text-slate-700 leading-7">
                        CCSP uses secure authentication, role-based access, database security policies,
                        and private document storage to help protect campaign information.
                    </p>

                    <p className="mt-4 max-w-3xl text-sm text-slate-500">
                        CCSP provides organizational and compliance support tools. It does not replace
                        legal advice from an attorney or official guidance from election authorities.
                    </p>
                </div>
            </section>

            {/* FAQ */}
            <section className="px-6 py-16">
                <div className="mx-auto max-w-6xl">
                    <h2 className="text-3xl font-bold">Frequently asked questions</h2>

                    <div className="mt-8 space-y-4">
                        {[
                            [
                                'Is CCSP nonpartisan?',
                                'Yes. CCSP is designed to support civic participation and candidate readiness without favoring a party or ideology.',
                            ],
                            [
                                'Is it free?',
                                'The platform can support a free pilot or early access model. Final pricing or membership policies can be set by the organization.',
                            ],
                            [
                                'Can CCSP file my campaign reports for me?',
                                'CCSP helps organize information, reminders, documents, and reports. Campaigns remain responsible for official filings and legal compliance.',
                            ],
                            [
                                'Who can use CCSP?',
                                'Candidates, treasurers, volunteers, advisors, and civic organizations can use the platform based on their role.',
                            ],
                        ].map(([question, answer]) => (
                            <div key={question} className="rounded-2xl border border-slate-200 bg-white p-6">
                                <h3 className="font-bold">{question}</h3>
                                <p className="mt-2 text-sm leading-6 text-slate-600">{answer}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Contact */}
            <section className="px-6 py-16 bg-slate-900 text-white">
                <div className="mx-auto max-w-6xl">
                    <h2 className="text-3xl font-bold">Ready to get started?</h2>
                    <p className="mt-4 max-w-2xl text-slate-300">
                        Create an account and begin building your campaign support system.
                    </p>

                    <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                        <Link
                            to="/login"
                            className="rounded-xl bg-orange-700 px-6 py-3 text-center font-semibold text-white hover:bg-orange-800"
                        >
                            Create Account
                        </Link>

                        <a
                            href="mailto:ccspcivicos@gmail.com"
                            className="rounded-xl border border-white/30 px-6 py-3 text-center font-semibold hover:bg-white/10"
                        >
                            Contact Us
                        </a>
                    </div>
                </div>
            </section>
        </main>
    );
}
