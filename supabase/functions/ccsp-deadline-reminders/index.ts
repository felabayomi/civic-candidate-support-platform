import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

type RequestBody = {
    action?: 'deadline-reminders' | 'volunteer-decision' | 'contact-volunteer'
    dryRun?: boolean
    triggeredBy?: string
    applicationId?: string
    decisionStatus?: 'accepted' | 'rejected'
}

type DeadlineRow = {
    id: string
    candidate_id: string
    label: string
    due_date: string
    status: string
}

type CandidateRow = {
    id: string
    user_id: string
    campaign_name: string
    office_title: string
    jurisdiction: string
}

type UserRow = {
    id: string
    email: string
    full_name: string | null
}

type VolunteerApplicationRow = {
    id: string
    need_id: string
    candidate_id: string
    volunteer_id: string
    message: string | null
    status: 'pending' | 'accepted' | 'rejected' | 'withdrawn'
}

type ReminderTarget = {
    deadlineId: string
    candidateId: string
    recipientUserId: string
    recipientEmail: string
    recipientName: string
    label: string
    dueDate: string
    campaignName: string
    officeTitle: string
    jurisdiction: string
    triggerDay: number
    reminderType: string
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const TRIGGER_DAYS = [30, 14, 7, 3, 1, 0, -1, -7]

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const resendApiKey = Deno.env.get('RESEND_API_KEY')
const reminderFromEmail = Deno.env.get('REMINDER_FROM_EMAIL')
const cronSecret = Deno.env.get('CRON_SECRET')

const DEFAULT_FROM_DISPLAY_NAME = 'Civicos Candidate Platform'

const resolveReminderFromAddress = (value: string | undefined) => {
    if (!value) return null
    const trimmed = value.trim()
    if (!trimmed) return null
    if (trimmed.includes('<') && trimmed.includes('>')) return trimmed
    return `${DEFAULT_FROM_DISPLAY_NAME} <${trimmed}>`
}

const reminderFromAddress = resolveReminderFromAddress(reminderFromEmail)

if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}

const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
})

const getBearerToken = (authorizationHeader: string | null) => {
    if (!authorizationHeader?.toLowerCase().startsWith('bearer ')) return null
    return authorizationHeader.slice(7).trim()
}

const ensureAuthorized = async (request: Request) => {
    const incomingCronSecret = request.headers.get('x-cron-secret')
    if (cronSecret && incomingCronSecret === cronSecret) {
        return { ok: true as const, mode: 'cron' as const, userId: null as string | null }
    }

    const token = getBearerToken(request.headers.get('authorization'))
    if (!token) {
        return { ok: false as const, status: 401, error: 'Missing authorization.' }
    }

    const userResult = await adminClient.auth.getUser(token)
    if (userResult.error || !userResult.data.user?.id) {
        return { ok: false as const, status: 401, error: 'Invalid user token.' }
    }

    const userId = userResult.data.user.id
    const profileResult = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle<{ role: string }>()

    if (profileResult.error) {
        return { ok: false as const, status: 500, error: profileResult.error.message }
    }

    if (profileResult.data?.role !== 'admin') {
        return { ok: false as const, status: 403, error: 'Admin role required.' }
    }

    return { ok: true as const, mode: 'admin' as const, userId }
}

const ensureSignedInUser = async (request: Request) => {
    const token = getBearerToken(request.headers.get('authorization'))
    if (!token) {
        return { ok: false as const, status: 401, error: 'Missing authorization.' }
    }

    const userResult = await adminClient.auth.getUser(token)
    if (userResult.error || !userResult.data.user?.id) {
        return { ok: false as const, status: 401, error: 'Invalid user token.' }
    }

    const userId = userResult.data.user.id
    const profileResult = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle<{ role: string }>()

    if (profileResult.error) {
        return { ok: false as const, status: 500, error: profileResult.error.message }
    }

    const role = profileResult.data?.role ?? null
    return { ok: true as const, userId, role }
}

const toUtcDate = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`)

const getUtcToday = () => {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

const getDaysUntilDue = (dueDate: string) => {
    const due = toUtcDate(dueDate)
    const today = getUtcToday()
    return Math.floor((due.getTime() - today.getTime()) / 86400000)
}

const getReminderType = (triggerDay: number) => {
    if (triggerDay > 0) return `due-in-${triggerDay}`
    if (triggerDay === 0) return 'due-today'
    return `overdue-${Math.abs(triggerDay)}`
}

const buildSubject = (target: ReminderTarget) => {
    if (target.triggerDay > 0) {
        return `CCSP Reminder: ${target.label} due in ${target.triggerDay} day(s)`
    }
    if (target.triggerDay === 0) {
        return `CCSP Reminder: ${target.label} is due today`
    }
    return `CCSP Reminder: ${target.label} is overdue by ${Math.abs(target.triggerDay)} day(s)`
}

const buildTextBody = (target: ReminderTarget) => {
    return [
        `Hello ${target.recipientName},`,
        '',
        `This is a campaign deadline reminder from CCSP.`,
        `Campaign: ${target.campaignName || 'Unnamed campaign'}`,
        `Office: ${target.officeTitle} (${target.jurisdiction})`,
        `Deadline: ${target.label}`,
        `Due date: ${target.dueDate}`,
        '',
        'Please review your reports and supporting documents in the platform and confirm submission status.',
        '',
        'This message is informational and not legal advice.',
    ].join('\n')
}

const buildHtmlBody = (target: ReminderTarget) => {
    return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <p>Hello ${target.recipientName},</p>
      <p>This is a campaign deadline reminder from CCSP.</p>
      <ul>
        <li><strong>Campaign:</strong> ${target.campaignName || 'Unnamed campaign'}</li>
        <li><strong>Office:</strong> ${target.officeTitle} (${target.jurisdiction})</li>
        <li><strong>Deadline:</strong> ${target.label}</li>
        <li><strong>Due date:</strong> ${target.dueDate}</li>
      </ul>
      <p>Please review your reports and supporting documents in the platform and confirm submission status.</p>
      <p style="font-size: 12px; color: #475569;">This message is informational and not legal advice.</p>
    </div>
  `
}

const alreadyDeliveredToday = async (target: ReminderTarget) => {
    const todayDate = new Date().toISOString().slice(0, 10)

    const { data, error } = await adminClient
        .from('deadline_reminder_deliveries')
        .select('id')
        .eq('deadline_id', target.deadlineId)
        .eq('recipient_email', target.recipientEmail)
        .eq('trigger_day', target.triggerDay)
        .eq('delivery_date', todayDate)
        .eq('send_status', 'sent')
        .maybeSingle<{ id: string }>()

    if (error) {
        return false
    }

    return Boolean(data?.id)
}

const recordDelivery = async (
    target: ReminderTarget,
    status: 'sent' | 'skipped' | 'failed',
    providerMessageId?: string,
    errorMessage?: string
) => {
    const todayDate = new Date().toISOString().slice(0, 10)

    await adminClient.from('deadline_reminder_deliveries').insert({
        deadline_id: target.deadlineId,
        candidate_id: target.candidateId,
        recipient_user_id: target.recipientUserId,
        recipient_email: target.recipientEmail,
        trigger_day: target.triggerDay,
        reminder_type: target.reminderType,
        delivery_date: todayDate,
        send_status: status,
        provider_message_id: providerMessageId ?? null,
        error_message: errorMessage ?? null,
    })
}

const sendReminderEmail = async (target: ReminderTarget) => {
    if (!resendApiKey || !reminderFromAddress) {
        return {
            ok: false,
            error: 'RESEND_API_KEY and REMINDER_FROM_EMAIL are required for live sends.',
            messageId: null,
        }
    }

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: reminderFromAddress,
            to: [target.recipientEmail],
            subject: buildSubject(target),
            text: buildTextBody(target),
            html: buildHtmlBody(target),
        }),
    })

    const body = await response.json().catch(() => ({}))

    if (!response.ok) {
        return {
            ok: false,
            error: JSON.stringify(body),
            messageId: null,
        }
    }

    return {
        ok: true,
        error: null,
        messageId: typeof body?.id === 'string' ? body.id : null,
    }
}

const sendGenericEmail = async (payload: { to: string; subject: string; text: string; html: string }) => {
    if (!resendApiKey || !reminderFromAddress) {
        return {
            ok: false,
            error: 'RESEND_API_KEY and REMINDER_FROM_EMAIL are required for live sends.',
            messageId: null,
        }
    }

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: reminderFromAddress,
            to: [payload.to],
            subject: payload.subject,
            text: payload.text,
            html: payload.html,
        }),
    })

    const body = await response.json().catch(() => ({}))

    if (!response.ok) {
        return {
            ok: false,
            error: JSON.stringify(body),
            messageId: null,
        }
    }

    return {
        ok: true,
        error: null,
        messageId: typeof body?.id === 'string' ? body.id : null,
    }
}

serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    let payload: RequestBody
    try {
        payload = (await request.json()) as RequestBody
    } catch (_error) {
        payload = {}
    }

    const action = payload.action ?? 'deadline-reminders'

    if (action === 'volunteer-decision' || action === 'contact-volunteer') {
        const signedIn = await ensureSignedInUser(request)
        if (!signedIn.ok) {
            return new Response(JSON.stringify({ error: signedIn.error }), {
                status: signedIn.status,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        const applicationId = payload.applicationId?.trim()
        const decisionStatus = payload.decisionStatus

        if (!applicationId) {
            return new Response(JSON.stringify({ error: 'applicationId is required.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        if (action === 'volunteer-decision' && decisionStatus !== 'accepted' && decisionStatus !== 'rejected') {
            return new Response(JSON.stringify({ error: 'decisionStatus must be accepted or rejected.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        const applicationResult = await adminClient
            .from('candidate_volunteer_applications')
            .select('id, need_id, candidate_id, volunteer_id, message, status')
            .eq('id', applicationId)
            .maybeSingle<VolunteerApplicationRow>()

        if (applicationResult.error) {
            return new Response(JSON.stringify({ error: applicationResult.error.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        const application = applicationResult.data
        if (!application) {
            return new Response(JSON.stringify({ error: 'Application not found.' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        if (action === 'volunteer-decision' && application.status !== decisionStatus) {
            return new Response(JSON.stringify({ error: 'Application status does not match decision status.' }), {
                status: 409,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        if (signedIn.role !== 'admin') {
            const candidateOwnerResult = await adminClient
                .from('candidates')
                .select('user_id, campaign_name')
                .eq('id', application.candidate_id)
                .maybeSingle<{ user_id: string; campaign_name: string }>()

            if (candidateOwnerResult.error) {
                return new Response(JSON.stringify({ error: candidateOwnerResult.error.message }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                })
            }

            if (!candidateOwnerResult.data || candidateOwnerResult.data.user_id !== signedIn.userId) {
                return new Response(JSON.stringify({ error: 'Not authorized for this application.' }), {
                    status: 403,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                })
            }
        }

        const [needResult, volunteerProfileResult, volunteerUserResult, candidateResult] = await Promise.all([
            adminClient
                .from('candidate_volunteer_needs')
                .select('title, county')
                .eq('id', application.need_id)
                .maybeSingle<{ title: string; county: string | null }>(),
            adminClient
                .from('volunteer_profiles')
                .select('id, email, full_name')
                .eq('id', application.volunteer_id)
                .maybeSingle<{ id: string; email: string | null; full_name: string | null }>(),
            adminClient
                .from('users')
                .select('id, email, full_name')
                .eq('id', application.volunteer_id)
                .maybeSingle<UserRow>(),
            adminClient
                .from('candidates')
                .select('campaign_name, office_title, jurisdiction')
                .eq('id', application.candidate_id)
                .maybeSingle<{ campaign_name: string; office_title: string; jurisdiction: string }>(),
        ])

        if (needResult.error || volunteerProfileResult.error || volunteerUserResult.error || candidateResult.error) {
            return new Response(
                JSON.stringify({
                    error:
                        needResult.error?.message ||
                        volunteerProfileResult.error?.message ||
                        volunteerUserResult.error?.message ||
                        candidateResult.error?.message ||
                        'Unable to load notification context.',
                }),
                {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                }
            )
        }

        const volunteerEmail = volunteerProfileResult.data?.email ?? volunteerUserResult.data?.email ?? null
        if (!volunteerEmail) {
            return new Response(JSON.stringify({ error: 'Volunteer email is missing.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        const volunteerName =
            volunteerProfileResult.data?.full_name ?? volunteerUserResult.data?.full_name ?? volunteerEmail
        const needTitle = needResult.data?.title ?? 'Volunteer opportunity'
        const campaignName = candidateResult.data?.campaign_name ?? 'Campaign'
        const officeLabel = candidateResult.data
            ? `${candidateResult.data.office_title} (${candidateResult.data.jurisdiction})`
            : 'Campaign office'
        let subject = ''
        let text = ''
        let html = ''

        if (action === 'volunteer-decision') {
            const decisionLabel = decisionStatus === 'accepted' ? 'accepted' : 'not selected'
            subject =
                decisionStatus === 'accepted'
                    ? `CCSP Update: You were accepted for ${needTitle}`
                    : `CCSP Update: Application decision for ${needTitle}`

            text = [
                `Hello ${volunteerName},`,
                '',
                `Your application for "${needTitle}" has been ${decisionLabel}.`,
                `Campaign: ${campaignName}`,
                `Office: ${officeLabel}`,
                needResult.data?.county ? `County: ${needResult.data.county}` : null,
                '',
                decisionStatus === 'accepted'
                    ? 'Please watch your email and dashboard for next steps from the campaign.'
                    : 'Thank you for your interest in supporting this campaign.',
            ]
                .filter(Boolean)
                .join('\n')

            html = `
                                <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
                                    <p>Hello ${volunteerName},</p>
                                    <p>Your application for <strong>${needTitle}</strong> has been <strong>${decisionLabel}</strong>.</p>
                                    <ul>
                                        <li><strong>Campaign:</strong> ${campaignName}</li>
                                        <li><strong>Office:</strong> ${officeLabel}</li>
                                        ${needResult.data?.county ? `<li><strong>County:</strong> ${needResult.data.county}</li>` : ''}
                                    </ul>
                                    <p>${decisionStatus === 'accepted'
                    ? 'Please watch your email and dashboard for next steps from the campaign.'
                    : 'Thank you for your interest in supporting this campaign.'
                }</p>
                                </div>
                        `
        } else {
            subject = `CCSP Follow-Up: ${needTitle}`
            text = [
                `Hello ${volunteerName},`,
                '',
                `This is a quick follow-up from ${campaignName} regarding your application for "${needTitle}".`,
                `Office: ${officeLabel}`,
                needResult.data?.county ? `County: ${needResult.data.county}` : null,
                '',
                'Please reply to this email if you are still interested and share your best contact method and availability for next steps.',
                '',
                'Thank you for supporting civic campaigns.',
            ]
                .filter(Boolean)
                .join('\n')

            html = `
                                <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
                                    <p>Hello ${volunteerName},</p>
                                    <p>
                                        This is a quick follow-up from <strong>${campaignName}</strong> regarding your application for
                                        <strong> ${needTitle}</strong>.
                                    </p>
                                    <ul>
                                        <li><strong>Office:</strong> ${officeLabel}</li>
                                        ${needResult.data?.county ? `<li><strong>County:</strong> ${needResult.data.county}</li>` : ''}
                                    </ul>
                                    <p>
                                        Please reply to this email if you are still interested and share your best contact method and availability for next steps.
                                    </p>
                                    <p>Thank you for supporting civic campaigns.</p>
                                </div>
                        `
        }

        const sendResult = await sendGenericEmail({
            to: volunteerEmail,
            subject,
            text,
            html,
        })

        if (!sendResult.ok) {
            return new Response(JSON.stringify({ ok: false, error: sendResult.error }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        return new Response(
            JSON.stringify({
                ok: true,
                mode: action,
                applicationId,
                decisionStatus: action === 'volunteer-decision' ? decisionStatus : null,
                recipient: volunteerEmail,
                messageId: sendResult.messageId,
                triggeredBy: payload.triggeredBy ?? null,
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        )
    }

    const auth = await ensureAuthorized(request)
    if (!auth.ok) {
        return new Response(JSON.stringify({ error: auth.error }), {
            status: auth.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    const dryRun = payload.dryRun ?? false

    const deadlinesResult = await adminClient
        .from('deadlines')
        .select('id, candidate_id, label, due_date, status')
        .neq('status', 'submitted')
        .order('due_date', { ascending: true })
        .limit(5000)

    if (deadlinesResult.error) {
        return new Response(JSON.stringify({ error: deadlinesResult.error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    const deadlines = (deadlinesResult.data ?? []) as DeadlineRow[]
    const candidateIds = [...new Set(deadlines.map((row) => row.candidate_id))]

    if (candidateIds.length === 0) {
        return new Response(
            JSON.stringify({
                ok: true,
                mode: dryRun ? 'dry-run' : 'live',
                authorizedMode: auth.mode,
                processed: 0,
                eligible: 0,
                sent: 0,
                skipped: 0,
                failed: 0,
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        )
    }

    const candidatesResult = await adminClient
        .from('candidates')
        .select('id, user_id, campaign_name, office_title, jurisdiction')
        .in('id', candidateIds)

    if (candidatesResult.error) {
        return new Response(JSON.stringify({ error: candidatesResult.error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    const candidates = (candidatesResult.data ?? []) as CandidateRow[]
    const candidatesById = new Map(candidates.map((row) => [row.id, row]))

    const recipientUserIds = [...new Set(candidates.map((row) => row.user_id).filter(Boolean))]
    const usersResult = await adminClient
        .from('users')
        .select('id, email, full_name')
        .in('id', recipientUserIds)

    if (usersResult.error) {
        return new Response(JSON.stringify({ error: usersResult.error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    const users = (usersResult.data ?? []) as UserRow[]
    const usersById = new Map(users.map((row) => [row.id, row]))

    const targets: ReminderTarget[] = []

    for (const deadline of deadlines) {
        const triggerDay = getDaysUntilDue(deadline.due_date)
        if (!TRIGGER_DAYS.includes(triggerDay)) continue

        const candidate = candidatesById.get(deadline.candidate_id)
        if (!candidate?.user_id) continue

        const recipient = usersById.get(candidate.user_id)
        if (!recipient?.email) continue

        targets.push({
            deadlineId: deadline.id,
            candidateId: candidate.id,
            recipientUserId: recipient.id,
            recipientEmail: recipient.email,
            recipientName: recipient.full_name ?? recipient.email,
            label: deadline.label,
            dueDate: deadline.due_date,
            campaignName: candidate.campaign_name,
            officeTitle: candidate.office_title,
            jurisdiction: candidate.jurisdiction,
            triggerDay,
            reminderType: getReminderType(triggerDay),
        })
    }

    let sent = 0
    let skipped = 0
    let failed = 0

    const preview = [] as Array<{ to: string; subject: string; dueDate: string; triggerDay: number }>

    for (const target of targets) {
        const wasDelivered = await alreadyDeliveredToday(target)
        if (wasDelivered) {
            skipped += 1
            continue
        }

        if (dryRun) {
            preview.push({
                to: target.recipientEmail,
                subject: buildSubject(target),
                dueDate: target.dueDate,
                triggerDay: target.triggerDay,
            })
            continue
        }

        const sendResult = await sendReminderEmail(target)
        if (sendResult.ok) {
            sent += 1
            await recordDelivery(target, 'sent', sendResult.messageId ?? undefined)
        } else {
            failed += 1
            await recordDelivery(target, 'failed', undefined, sendResult.error ?? 'Unknown email error')
        }
    }

    return new Response(
        JSON.stringify({
            ok: true,
            mode: dryRun ? 'dry-run' : 'live',
            authorizedMode: auth.mode,
            processed: deadlines.length,
            eligible: targets.length,
            sent,
            skipped,
            failed,
            preview: dryRun ? preview.slice(0, 30) : [],
            triggeredBy: payload.triggeredBy ?? null,
        }),
        {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    )
})
