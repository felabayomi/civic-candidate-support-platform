import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

type LegalLayoutProps = {
    title: string
    subtitle: string
    lastUpdated: string
    children: ReactNode
}

const legalLinks = [
    { to: '/privacy', label: 'Privacy Policy' },
    { to: '/terms', label: 'Terms of Use' },
    { to: '/accessibility', label: 'Accessibility' },
    { to: '/cookies', label: 'Cookie Policy' },
    { to: '/legal-disclaimer', label: 'Legal Disclaimer' },
]

function LegalLayout({ title, subtitle, lastUpdated, children }: LegalLayoutProps) {
    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
                <Link className="font-medium text-slate-700 hover:text-slate-900" to="/">
                    Home
                </Link>
                <span className="mx-2 text-slate-400">/</span>
                <span>Legal Center</span>
                <span className="mx-2 text-slate-400">/</span>
                <span className="text-slate-700">{title}</span>
            </nav>

            <header className="mt-4 border-b border-slate-200 pb-4">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">{subtitle}</p>
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">Last Updated: {lastUpdated}</p>
            </header>

            <article className="prose prose-slate mt-6 max-w-none prose-headings:font-semibold prose-p:text-slate-700">
                {children}
            </article>

            <footer className="mt-8 border-t border-slate-200 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Legal Pages</p>
                <div className="mt-2 flex flex-wrap gap-2">
                    {legalLinks.map((link) => (
                        <Link
                            key={link.to}
                            to={link.to}
                            className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                            {link.label}
                        </Link>
                    ))}
                </div>
            </footer>
        </section>
    )
}

export default LegalLayout
