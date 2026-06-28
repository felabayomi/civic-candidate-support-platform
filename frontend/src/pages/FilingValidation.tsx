import { useEffect, useMemo, useState } from 'react'
import ComplianceResultList from '../components/ComplianceResultList'
import { runCampaignComplianceCheck, type ComplianceResult } from '../lib/complianceEvaluator'
import { useAuth } from '../lib/authContext'
import { supabase } from '../lib/supabaseClient'

import { buildUserFacingErrorMessage } from '../lib/userFacingError'
function FilingValidation() {
    const { session } = useAuth()
    const userId = useMemo(() => session?.user.id ?? '', [session])

    const [campaignId, setCampaignId] = useState<string | null>(null)
    const [results, setResults] = useState<ComplianceResult[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isRunning, setIsRunning] = useState(false)
    const [errorMessage, setErrorMessage] = useState('')

    useEffect(() => {
        const loadCampaign = async () => {
            if (!userId) {
                setIsLoading(false)
                return
            }

            const { data: candidate, error: candidateError } = await supabase
                .from('candidates')
                .select('id')
                .eq('user_id', userId)
                .maybeSingle<{ id: string }>()

            if (candidateError || !candidate) {
                setErrorMessage(
                    candidateError
                        ? buildUserFacingErrorMessage({ action: 'load', resource: 'candidate profile' })
                        : 'No candidate profile found.'
                )
                setIsLoading(false)
                return
            }

            const { data: campaign, error: campaignError } = await supabase
                .from('campaigns')
                .select('id')
                .eq('candidate_id', candidate.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle<{ id: string }>()

            if (campaignError || !campaign) {
                setErrorMessage(
                    campaignError
                        ? buildUserFacingErrorMessage({ action: 'load', resource: 'campaign data' })
                        : 'No campaign found.'
                )
                setIsLoading(false)
                return
            }

            setCampaignId(campaign.id)
            setIsLoading(false)
        }

        void loadCampaign()
    }, [userId])

    const runValidation = async () => {
        if (!campaignId) return

        setIsRunning(true)
        setErrorMessage('')

        try {
            const nextResults = await runCampaignComplianceCheck(campaignId)
            setResults(nextResults)
        } catch (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'complete', resource: 'request' }))
        } finally {
            setIsRunning(false)
        }
    }

    const blockingCount = results.filter((result) => !result.passed && result.severity === 'blocking').length
    const warningCount = results.filter((result) => !result.passed && result.severity === 'warning').length
    const infoCount = results.filter((result) => !result.passed && result.severity === 'info').length

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Filing Validation</h1>
            <p className="mt-3 text-slate-600">Run rule-based compliance validation before filing.</p>

            {isLoading ? <p className="mt-4 text-sm text-slate-600">Loading campaign...</p> : null}
            {errorMessage ? <p className="mt-4 text-sm text-red-600">{errorMessage}</p> : null}

            <div className="mt-4 flex items-center gap-3">
                <button
                    type="button"
                    onClick={runValidation}
                    disabled={isLoading || isRunning || !campaignId}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                >
                    {isRunning ? 'Running...' : 'Run Compliance Check'}
                </button>
                <p className="text-xs text-slate-500">Campaign: {campaignId ?? 'Unavailable'}</p>
            </div>

            {results.length > 0 ? (
                <div className="mt-4 rounded-xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-800">
                        {blockingCount > 0
                            ? `Validation failed (blocking: ${blockingCount}, warnings: ${warningCount}, info: ${infoCount})`
                            : warningCount + infoCount > 0
                                ? `Validation passed with advisories (blocking: ${blockingCount}, warnings: ${warningCount}, info: ${infoCount})`
                                : 'Validation passed with no issues'}
                    </p>
                    <div className="mt-3">
                        <ComplianceResultList results={results} />
                    </div>
                </div>
            ) : null}
        </section>
    )
}

export default FilingValidation

