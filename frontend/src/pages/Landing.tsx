import { Link } from 'react-router-dom'

const howItWorksSteps = [
    {
        title: 'Create your workspace',
        description: 'Sign up in minutes and set your campaign profile, office, and jurisdiction.',
    },
    {
        title: 'Track campaign operations',
        description: 'Manage checklists, documents, donations, expenses, and reporting tasks in one place.',
    },
    {
        title: 'Validate before filing',
        description: 'Run filing checks to catch blocking issues and advisory guidance before you submit.',
    },
]

const featureCards = [
    {
        title: 'Compliance-first workflow',
        detail: 'Campaign launch wizard, filing validation, and state-aware rule sets designed for pre-submission readiness.',
    },
    {
        title: 'Operations in one system',
        detail: 'Donations, expenses, deadlines, documents, and reporting workflows stay connected in a single dashboard.',
    },
    {
        title: 'Role-based access',
        detail: 'Candidates, treasurers, volunteers, and organization admins each get the right surface and permissions.',
    },
    {
        title: 'Built for real campaign pace',
        detail: 'Mobile-friendly layout with clear status indicators and actionable recommendations keeps teams moving.',
    },
]

const faqs = [
    {
        question: 'What is CCSP CivicOS?',
        answer: 'CCSP CivicOS is the Civic Candidate Support Platform, a campaign operations and compliance workspace for candidates and campaign teams.',
    },
    {
        question: 'Who is it for?',
        answer: 'Primary users are candidates, treasurers, volunteers, and authorized organization support staff.',
    },
    {
        question: 'Is CCSP nonpartisan?',
        answer: 'Yes. The platform is built to support compliant campaign operations regardless of party affiliation.',
    },
    {
        question: 'Is CCSP free?',
        answer: 'Yes. Candidate workspace access is free for day-to-day campaign setup, tracking, and filing readiness.',
    },
]

function Landing() {
    return (
        <section className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <img
                        src="/logo-ccsp-civicos.svg"
                        alt="CCSP CivicOS"
                        width={160}
                        height={40}
                        className="h-8 w-32"
                        fetchPriority="high"
                        decoding="async"
                    />
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">CCSP CivicOS</span>
                </div>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                    Campaign operations and compliance readiness in one platform.
                </h1>
                <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
                    Civic Candidate Support Platform helps campaigns organize critical tasks, verify filing readiness,
                    and reduce avoidable compliance mistakes before submission deadlines.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                        to="/login"
                        className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
                    >
                        Get Started
                    </Link>
                    <a
                        href="#how-it-works"
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                        How It Works
                    </a>
                </div>
                <div className="mt-5 grid gap-3 text-xs text-slate-600 sm:grid-cols-3 sm:text-sm">
                    <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">Built for candidates and campaign teams.</p>
                    <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">Nonpartisan campaign support platform.</p>
                    <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">Free candidate workspace access.</p>
                </div>
            </div>

            <div id="how-it-works" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">How It Works</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                    {howItWorksSteps.map((step, index) => (
                        <article key={step.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Step {index + 1}</p>
                            <h3 className="mt-2 text-base font-semibold text-slate-900">{step.title}</h3>
                            <p className="mt-2 text-sm text-slate-600">{step.description}</p>
                        </article>
                    ))}
                </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Platform Features</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {featureCards.map((feature) => (
                        <article key={feature.title} className="rounded-2xl border border-slate-200 p-4">
                            <h3 className="text-base font-semibold text-slate-900">{feature.title}</h3>
                            <p className="mt-2 text-sm text-slate-600">{feature.detail}</p>
                        </article>
                    ))}
                </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Security and Privacy</h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
                    CCSP applies role-based access controls, authenticated user policies, and audit-aware workflows to
                    keep campaign data scoped to authorized users. Campaign teams can work confidently with clear
                    ownership boundaries across candidate, treasurer, and admin surfaces.
                </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">FAQ</h2>
                <div className="mt-5 space-y-3">
                    {faqs.map((item) => (
                        <details key={item.question} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <summary className="cursor-pointer text-sm font-semibold text-slate-900">{item.question}</summary>
                            <p className="mt-2 text-sm text-slate-600">{item.answer}</p>
                        </details>
                    ))}
                </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Contact</h2>
                <p className="mt-3 text-sm text-slate-600 sm:text-base">
                    Need onboarding help or organization support? Email
                    <a className="ml-1 font-semibold text-amber-700 hover:text-amber-800" href="mailto:support@felixplatform.com">
                        support@felixplatform.com
                    </a>
                    .
                </p>
            </div>
        </section>
    )
}

export default Landing