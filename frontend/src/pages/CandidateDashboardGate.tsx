import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/authContext'
import { supabase } from '../lib/supabaseClient'

type CandidateLookupRow = {
    id: string
}

type CandidateDashboardGateProps = {
    children: ReactNode
}

function CandidateDashboardGate({ children }: CandidateDashboardGateProps) {
    const { session, role, isLoading } = useAuth()
    const userId = useMemo(() => session?.user.id ?? '', [session])
    const [isChecking, setIsChecking] = useState(true)
    const [hasCandidateProfile, setHasCandidateProfile] = useState(false)

    useEffect(() => {
        const checkCandidateProfile = async () => {
            if (!userId || role !== 'candidate') {
                setHasCandidateProfile(false)
                setIsChecking(false)
                return
            }

            setIsChecking(true)
            const { data, error } = await supabase
                .from('candidates')
                .select('id')
                .eq('user_id', userId)
                .maybeSingle<CandidateLookupRow>()

            if (error) {
                setHasCandidateProfile(false)
                setIsChecking(false)
                return
            }

            setHasCandidateProfile(!!data?.id)
            setIsChecking(false)
        }

        checkCandidateProfile()
    }, [userId, role])

    if (isLoading || isChecking) {
        return (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <p className="text-slate-600">Loading campaign workspace...</p>
            </section>
        )
    }

    if (role === 'candidate' && !hasCandidateProfile) {
        return <Navigate to="/campaign-launch" replace />
    }

    return <>{children}</>
}

export default CandidateDashboardGate
