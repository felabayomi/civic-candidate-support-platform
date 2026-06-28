import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from './authContext'

type RoleProtectedRouteProps = {
    allowedRoles: string[]
    children: ReactNode
    showUnauthorizedPage?: boolean
    unauthorizedTitle?: string
    unauthorizedMessage?: string
}

export function RoleProtectedRoute({
    allowedRoles,
    children,
    showUnauthorizedPage = false,
    unauthorizedTitle = 'Access Restricted',
    unauthorizedMessage = 'You do not have permission to access this area.',
}: RoleProtectedRouteProps) {
    const { session, isLoading, role } = useAuth()

    if (isLoading) {
        return (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <p className="text-slate-600">Loading...</p>
            </section>
        )
    }

    if (!session) {
        return <Navigate to="/login" replace />
    }

    if (!role || !allowedRoles.includes(role)) {
        if (showUnauthorizedPage) {
            return (
                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{unauthorizedTitle}</h1>
                    <p className="mt-3 text-slate-600">{unauthorizedMessage}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <Link
                            to="/dashboard"
                            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                        >
                            Back to Dashboard
                        </Link>
                        <Link
                            to="/help"
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                            Contact Organization Support
                        </Link>
                    </div>
                </section>
            )
        }

        return <Navigate to="/dashboard" replace />
    }

    return <>{children}</>
}
