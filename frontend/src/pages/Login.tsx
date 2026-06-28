import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/authContext'
import { buildUserFacingErrorMessage } from '../lib/userFacingError'

function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isSignUp, setIsSignUp] = useState(false)
    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [shouldRedirectAfterSignIn, setShouldRedirectAfterSignIn] = useState(false)
    const { signIn, signUp, signOut, session } = useAuth()
    const navigate = useNavigate()

    useEffect(() => {
        if (shouldRedirectAfterSignIn && session) {
            navigate('/welcome', { replace: true })
            setShouldRedirectAfterSignIn(false)
        }
    }, [shouldRedirectAfterSignIn, session, navigate])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setIsLoading(true)

        try {
            if (isSignUp) {
                await signUp(email, password)
                setEmail('')
                setPassword('')
                setIsSignUp(false)
                setError('Check your email to confirm your account. If you do not see it, check your spam/junk folder and mark the noreply sender as Not Spam.')
            } else {
                await signIn(email, password)
                setShouldRedirectAfterSignIn(true)
            }
        } catch (err) {
            setError(
                buildUserFacingErrorMessage({
                    action: isSignUp ? 'create' : 'sign in to',
                    resource: 'account',
                })
            )
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
                <p className="font-semibold uppercase tracking-wide">Early Access Pilot</p>
                <p className="mt-1 text-xs text-orange-800">
                    This release is in pilot mode. Your feedback helps improve workflows for first-time candidates.
                </p>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Candidate Login</h1>
            <p className="mt-3 text-slate-600">Sign in to access your campaign dashboard and compliance tools.</p>

            {session ? (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                    <p>You are already signed in.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => navigate('/welcome')}
                            className="rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                            Go to Welcome
                        </button>
                        <button
                            type="button"
                            onClick={async () => {
                                setError('')
                                await signOut()
                            }}
                            className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                        >
                            Sign Out
                        </button>
                    </div>
                </div>
            ) : null}

            <form onSubmit={handleSubmit} className="mt-6 max-w-md space-y-4">
                <label className="block">
                    <span className="text-sm font-medium text-slate-700">Email</span>
                    <input
                        id="login-email"
                        type="email"
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 placeholder:text-slate-500"
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? 'login-auth-error' : undefined}
                        autoComplete="email"
                        required
                    />
                </label>

                <label className="block">
                    <span className="text-sm font-medium text-slate-700">Password</span>
                    <input
                        id="login-password"
                        type="password"
                        placeholder="Minimum 6 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 placeholder:text-slate-500"
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? 'login-auth-error' : undefined}
                        autoComplete={isSignUp ? 'new-password' : 'current-password'}
                        required
                        minLength={6}
                    />
                </label>

                {error && (
                    <p id="login-auth-error" role="alert" className={`text-sm ${isSignUp && error.includes('Check') ? 'text-emerald-700' : 'text-red-700'}`}>
                        {error}
                    </p>
                )}
                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full rounded-lg bg-[#0f4c81] px-4 py-2 font-semibold text-white hover:bg-[#0b3c65] disabled:opacity-50"
                >
                    {isLoading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
                </button>

                <p className="text-xs leading-relaxed text-slate-600">
                    By signing in you agree to the{' '}
                    <Link to="/terms" className="font-semibold text-[#0b3c65] hover:text-[#0f4c81] hover:underline">
                        CCSP Terms of Use
                    </Link>{' '}
                    and acknowledge the{' '}
                    <Link to="/privacy" className="font-semibold text-[#0b3c65] hover:text-[#0f4c81] hover:underline">
                        Privacy Policy
                    </Link>
                    .
                </p>
                <p className="text-xs leading-relaxed text-slate-600">
                    CCSP provides organizational and compliance support tools.
                </p>
                <p className="text-xs leading-relaxed text-slate-600">
                    The platform and AI Compliance Assistant do not provide legal advice. Read the{' '}
                    <Link
                        to="/legal-disclaimer"
                        className="font-semibold text-[#0b3c65] hover:text-[#0f4c81] hover:underline"
                    >
                        Legal Disclaimer
                    </Link>
                    .
                </p>
            </form>

            <p className="mt-4 text-center text-sm text-slate-600">
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}
                <button
                    type="button"
                    onClick={() => {
                        setIsSignUp(!isSignUp)
                        setError('')
                    }}
                    className="ml-1 font-semibold text-[#0b3c65] hover:text-[#0f4c81]"
                >
                    {isSignUp ? 'Sign in' : 'Sign up'}
                </button>
            </p>
        </section>
    )
}

export default Login
