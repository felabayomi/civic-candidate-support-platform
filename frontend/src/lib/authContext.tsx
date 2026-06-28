import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

type AuthContextType = {
    session: Session | null
    isLoading: boolean
    role: string | null
    signUp: (email: string, password: string) => Promise<void>
    signIn: (email: string, password: string) => Promise<void>
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [role, setRole] = useState<string | null>(null)

    const syncRoleProfile = async (activeSession: Session | null) => {
        if (!activeSession?.user?.id) {
            setRole(null)
            return
        }

        const userId = activeSession.user.id
        const userEmail = activeSession.user.email ?? null
        const userName = (activeSession.user.user_metadata?.full_name as string | undefined) ?? null

        const { data: existingProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .maybeSingle<{ role: string }>()

        const resolvedRole = existingProfile?.role ?? 'candidate'

        await supabase.from('profiles').upsert(
            {
                id: userId,
                full_name: userName,
                role: resolvedRole,
            },
            { onConflict: 'id' }
        )

        await supabase.from('users').upsert(
            {
                id: userId,
                email: userEmail,
                full_name: userName,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
        )

        const { data: profileData } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .maybeSingle<{ role: string }>()

        setRole(profileData?.role ?? resolvedRole)
    }

    useEffect(() => {
        // Check for existing session on mount
        const checkSession = async () => {
            const { data } = await supabase.auth.getSession()
            setSession(data.session)
            await syncRoleProfile(data.session)
            setIsLoading(false)
        }

        checkSession()

        // Listen for auth changes
        const { data: authListener } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                setSession(session)
                await syncRoleProfile(session)
                setIsLoading(false)
            }
        )

        return () => {
            authListener?.subscription.unsubscribe()
        }
    }, [])

    const signUp = async (email: string, password: string) => {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
    }

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
    }

    const signOut = async () => {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
        setRole(null)
    }

    return (
        <AuthContext.Provider value={{ session, isLoading, role, signUp, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider')
    }
    return context
}
