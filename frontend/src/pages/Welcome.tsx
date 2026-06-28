import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/authContext'

type WelcomeIntent = 'thinking' | 'candidate' | 'treasurer' | 'volunteer' | 'advisor'

const intentOptions: Array<{ id: WelcomeIntent; label: string }> = [
    { id: 'thinking', label: "I'm thinking about running" },
    { id: 'candidate', label: "I'm already a candidate" },
    { id: 'treasurer', label: "I'm a Treasurer" },
    { id: 'volunteer', label: "I'm a Volunteer" },
    { id: 'advisor', label: "I'm an Advisor" },
]

function Welcome() {
    const { session, isLoading } = useAuth()
    const navigate = useNavigate()
    const [selectedIntent, setSelectedIntent] = useState<WelcomeIntent | ''>('')
    const userId = useMemo(() => session?.user.id ?? '', [session])

    const completionStorageKey = `ccsp.welcome.completed.${userId}`
    const intentStorageKey = `ccsp.welcome.intent.${userId}`

    useEffect(() => {
        if (!userId) return

        const storedIntent = localStorage.getItem(intentStorageKey) as WelcomeIntent | null
        if (storedIntent) {
            setSelectedIntent(storedIntent)
        }
    }, [intentStorageKey, userId])

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

    const handleContinue = () => {
        if (!selectedIntent || !userId) return

        localStorage.setItem(intentStorageKey, selectedIntent)
        localStorage.setItem(completionStorageKey, 'true')

        if (selectedIntent === 'thinking') {
            navigate('/campaign-launch', { replace: true })
            return
        }

        if (selectedIntent === 'treasurer') {
            navigate('/treasurer-marketplace', { replace: true })
            return
        }

        if (selectedIntent === 'volunteer') {
            navigate('/volunteer-matching', { replace: true })
            return
        }

        if (selectedIntent === 'advisor') {
            navigate('/help', { replace: true })
            return
        }

        navigate('/dashboard', { replace: true })
    }

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Welcome to CCSP</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">What brings you here?</h1>

            <fieldset className="mt-6 space-y-3" aria-label="Choose your role intent">
                {intentOptions.map((option) => (
                    <label
                        key={option.id}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 transition hover:bg-slate-50"
                    >
                        <input
                            type="radio"
                            name="welcome-intent"
                            value={option.id}
                            checked={selectedIntent === option.id}
                            onChange={() => setSelectedIntent(option.id)}
                            className="h-4 w-4 border-slate-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span>{option.label}</span>
                    </label>
                ))}
            </fieldset>

            <button
                type="button"
                onClick={handleContinue}
                disabled={!selectedIntent}
                className="mt-6 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
                Continue →
            </button>
        </section>
    )
}

export default Welcome