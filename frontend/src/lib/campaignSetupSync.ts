import { supabase } from './supabaseClient'

export type CampaignProgressSnapshot = {
    currentStep: number
    totalSteps: number
    completedSteps: number[]
    status: 'not_started' | 'in_progress' | 'completed'
}

export type CampaignMilestoneSyncItem = {
    key: string
    title: string
    dueDate: string
    category: string
    done: boolean
}

type CampaignProgressRow = {
    current_step: number | null
    total_steps: number | null
    completed_steps: number[] | null
    status: CampaignProgressSnapshot['status'] | null
}

export const fetchCampaignProgressSnapshot = async (userId: string): Promise<CampaignProgressSnapshot | null> => {
    if (!userId) return null

    const { data, error } = await supabase
        .from('campaign_progress')
        .select('current_step, total_steps, completed_steps, status')
        .eq('user_id', userId)
        .maybeSingle<CampaignProgressRow>()

    if (error || !data) return null

    return {
        currentStep: data.current_step ?? 1,
        totalSteps: data.total_steps ?? 10,
        completedSteps: Array.isArray(data.completed_steps) ? data.completed_steps : [],
        status: data.status ?? 'not_started',
    }
}

export const saveCampaignProgressSnapshot = async ({
    userId,
    candidateId,
    currentStep,
    totalSteps,
    completedSteps,
}: {
    userId: string
    candidateId?: string | null
    currentStep: number
    totalSteps: number
    completedSteps: number[]
}) => {
    if (!userId) return { error: null as string | null }

    const deduped = Array.from(new Set(completedSteps)).sort((a, b) => a - b)
    const status: CampaignProgressSnapshot['status'] =
        deduped.includes(totalSteps) ? 'completed' : deduped.length > 0 ? 'in_progress' : 'not_started'

    const { error } = await supabase.from('campaign_progress').upsert(
        {
            user_id: userId,
            candidate_id: candidateId ?? null,
            current_step: currentStep,
            total_steps: totalSteps,
            completed_steps: deduped,
            status,
            last_completed_step: deduped.length > 0 ? deduped[deduped.length - 1] : null,
            started_at: status === 'not_started' ? null : new Date().toISOString(),
            completed_at: status === 'completed' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
    )

    return {
        error: error?.message ?? null,
    }
}

export const saveCampaignMilestones = async ({
    userId,
    candidateId,
    milestones,
}: {
    userId: string
    candidateId?: string | null
    milestones: CampaignMilestoneSyncItem[]
}) => {
    if (!userId) return { error: null as string | null }
    if (milestones.length === 0) return { error: null as string | null }

    const rows = milestones.map((item) => ({
        user_id: userId,
        candidate_id: candidateId ?? null,
        milestone_key: item.key,
        title: item.title,
        due_date: item.dueDate,
        category: item.category,
        is_completed: item.done,
        completed_at: item.done ? new Date().toISOString() : null,
        source: 'wizard',
        updated_at: new Date().toISOString(),
    }))

    const { error } = await supabase.from('campaign_milestones').upsert(rows, {
        onConflict: 'user_id,milestone_key',
    })

    return {
        error: error?.message ?? null,
    }
}
