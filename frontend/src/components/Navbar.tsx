import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/authContext'
import SupportDialog from './SupportDialog'

export type NavItem = {
    path: string
    label: string
}

type NavbarProps = {
    items: NavItem[]
    onPrefetchRoute?: (path: string) => void
}

function Navbar({ items, onPrefetchRoute }: NavbarProps) {
    const location = useLocation()
    const { role } = useAuth()
    const isAdmin = role === 'admin'
    const visibleItems = items.filter((item) => item.path !== '/admin-console' || isAdmin)
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
    const [isSupportDialogOpen, setIsSupportDialogOpen] = useState(false)

    const closeMobileNav = () => {
        if (isMobileNavOpen) {
            setIsMobileNavOpen(false)
        }
    }

    useEffect(() => {
        setIsMobileNavOpen(false)
    }, [location.pathname])

    return (
        <aside className="rounded-3xl border border-slate-200 bg-white/85 p-4 shadow-sm backdrop-blur sm:p-5">
            <div className="mb-5 border-b border-slate-100 pb-4">
                <div className="flex items-center justify-between gap-3 lg:block">
                    <div>
                        <img
                            src="/logo-ccsp-civicos.svg"
                            alt="CCSP CivicOS"
                            width={180}
                            height={45}
                            className="mb-2 h-9 w-36"
                            fetchPriority="high"
                            decoding="async"
                        />
                        <p className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Civic Candidate Support Platform</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsMobileNavOpen((open) => !open)}
                        className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 lg:hidden"
                        aria-expanded={isMobileNavOpen}
                        aria-label="Toggle navigation menu"
                    >
                        {isMobileNavOpen ? 'Close' : 'Menu'}
                    </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                    {isAdmin ? 'Organization Admin Access Enabled' : 'Free candidate workspace. Admin Console is organization-only.'}
                </p>
            </div>

            <nav className={`${isMobileNavOpen ? 'block' : 'hidden'} space-y-1.5 lg:block`}>
                {visibleItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={closeMobileNav}
                        onMouseEnter={() => onPrefetchRoute?.(item.path)}
                        onFocus={() => onPrefetchRoute?.(item.path)}
                        className={({ isActive }) =>
                            `block rounded-xl px-3 py-2 text-sm font-medium transition ${isActive
                                ? 'bg-amber-100 text-amber-900'
                                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                            }`
                        }
                    >
                        {item.label}
                    </NavLink>
                ))}
                <a
                    href="https://electionpredictor.net/"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={closeMobileNav}
                    className="block rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                >
                    Election Prediction
                </a>
                <a
                    href="https://campaignsignal.us/"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={closeMobileNav}
                    className="block rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                >
                    Campaign Signal Studio
                </a>
            </nav>

            {!isAdmin ? (
                <div className={`${isMobileNavOpen ? 'block' : 'hidden'} mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:block`}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Need platform help?</p>
                    <p className="mt-1 text-xs text-slate-600">
                        If an issue blocks your filing workflow, contact your organization support team for admin-console help.
                    </p>
                </div>
            ) : null}

            <button
                type="button"
                onClick={() => setIsSupportDialogOpen(true)}
                className={`${isMobileNavOpen ? 'block' : 'hidden'} mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 lg:block`}
            >
                Support this tool
            </button>

            <SupportDialog open={isSupportDialogOpen} onClose={() => setIsSupportDialogOpen(false)} />
        </aside>
    )
}

export default Navbar
