import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/authContext'
import { supabase } from '../lib/supabaseClient'
import { buildUserFacingErrorMessage } from '../lib/userFacingError'
import EmptyStateCard from '../components/EmptyStateCard'

type DocumentRow = {
    id: string
    user_id: string
    campaign_id: string | null
    title: string
    file_path: string
    document_type: string | null
    created_at: string
}

type CampaignRow = {
    id: string
    campaign_name: string | null
    status: string
}

const bucketOptions = ['candidate-documents', 'campaign-receipts', 'finance-reports'] as const

const inferStateCodeFromJurisdiction = (jurisdictionValue: string) => {
    const match = jurisdictionValue.trim().match(/([A-Za-z]{2})\s*$/)
    return match?.[1] ? match[1].toUpperCase() : 'ALL'
}

function Documents() {
    const { session } = useAuth()
    const userId = useMemo(() => session?.user.id ?? '', [session])

    const [candidateId, setCandidateId] = useState<string | null>(null)
    const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
    const [docs, setDocs] = useState<DocumentRow[]>([])
    const [title, setTitle] = useState('')
    const [documentType, setDocumentType] = useState('general')
    const [bucket, setBucket] = useState<(typeof bucketOptions)[number]>('candidate-documents')
    const [campaignId, setCampaignId] = useState('')
    const [hasInitializedCampaignSelection, setHasInitializedCampaignSelection] = useState(false)
    const [file, setFile] = useState<File | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isUploading, setIsUploading] = useState(false)
    const [errorMessage, setErrorMessage] = useState('')
    const [statusMessage, setStatusMessage] = useState('')
    const [fieldErrors, setFieldErrors] = useState<{
        title?: string
        file?: string
        campaignId?: string
    }>({})

    const loadCampaignOptions = async (
        resolvedCandidateId: string,
        fallbackCampaignName: string | null,
        fallbackJurisdiction: string | null
    ) => {
        const { data: initialCampaignRows, error: initialCampaignError } = await supabase
            .from('campaigns')
            .select('id, campaign_name, status')
            .eq('candidate_id', resolvedCandidateId)
            .order('created_at', { ascending: false })

        if (initialCampaignError) {
            throw initialCampaignError
        }

        const initialCampaigns = (initialCampaignRows ?? []) as CampaignRow[]
        if (initialCampaigns.length > 0) {
            return initialCampaigns
        }

        const { error: createCampaignError } = await supabase.from('campaigns').insert({
            candidate_id: resolvedCandidateId,
            campaign_name: fallbackCampaignName,
            state_code: inferStateCodeFromJurisdiction(fallbackJurisdiction ?? ''),
            status: 'active',
            updated_at: new Date().toISOString(),
        })

        if (createCampaignError) {
            throw createCampaignError
        }

        const { data: refreshedCampaignRows, error: refreshedCampaignError } = await supabase
            .from('campaigns')
            .select('id, campaign_name, status')
            .eq('candidate_id', resolvedCandidateId)
            .order('created_at', { ascending: false })

        if (refreshedCampaignError) {
            throw refreshedCampaignError
        }

        return (refreshedCampaignRows ?? []) as CampaignRow[]
    }

    const loadDocuments = async () => {
        if (!userId) {
            setIsLoading(false)
            return
        }

        setIsLoading(true)
        setErrorMessage('')

        const { data: candidate } = await supabase
            .from('candidates')
            .select('id, campaign_name, jurisdiction')
            .eq('user_id', userId)
            .maybeSingle<{ id: string; campaign_name: string | null; jurisdiction: string | null }>()

        setCandidateId(candidate?.id ?? null)

        if (candidate?.id) {
            try {
                const resolvedCampaigns = await loadCampaignOptions(
                    candidate.id,
                    candidate.campaign_name ?? null,
                    candidate.jurisdiction ?? null
                )
                setCampaigns(resolvedCampaigns)

                if (resolvedCampaigns.length > 0) {
                    if (!hasInitializedCampaignSelection) {
                        setCampaignId(resolvedCampaigns[0].id)
                        setHasInitializedCampaignSelection(true)
                    } else {
                        setCampaignId((current) =>
                            current && !resolvedCampaigns.some((campaign) => campaign.id === current) ? '' : current
                        )
                    }
                } else {
                    setCampaignId('')
                }
            } catch (campaignError) {
                setCampaigns([])
                setCampaignId('')
                setErrorMessage(buildUserFacingErrorMessage({ action: 'load', resource: 'campaigns' }))
            }
        } else {
            setCampaigns([])
            setCampaignId('')
        }

        const { data: rows, error } = await supabase
            .from('documents')
            .select('id, user_id, campaign_id, title, file_path, document_type, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'load', resource: 'documents' }))
            setIsLoading(false)
            return
        }

        setDocs((rows ?? []) as DocumentRow[])
        setIsLoading(false)
    }

    useEffect(() => {
        loadDocuments()
    }, [userId])

    const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        const nextFieldErrors: {
            title?: string
            file?: string
            campaignId?: string
        } = {}

        if (!title.trim()) {
            nextFieldErrors.title = 'Document title is required.'
        }

        if (!file) {
            nextFieldErrors.file = 'Choose a file before uploading.'
        }

        if (campaigns.length > 0 && campaignId && !campaigns.some((campaign) => campaign.id === campaignId)) {
            nextFieldErrors.campaignId = 'Choose a valid campaign or leave campaign unselected.'
        }

        setFieldErrors(nextFieldErrors)

        if (Object.keys(nextFieldErrors).length > 0) {
            setErrorMessage('Please fix the highlighted form fields and try again.')
            return
        }

        if (!userId) {
            setErrorMessage('Sign in required.')
            return
        }

        if (!file) {
            setErrorMessage('Choose a file before uploading.')
            return
        }

        setIsUploading(true)
        setErrorMessage('')
        setStatusMessage('')

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const objectPath = `${userId}/${Date.now()}-${safeName}`

        const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, file, {
            cacheControl: '3600',
            upsert: false,
        })

        if (uploadError) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'upload', resource: 'document file' }))
            setIsUploading(false)
            return
        }

        const { error: insertError } = await supabase.from('documents').insert({
            user_id: userId,
            campaign_id: campaignId || null,
            candidate_id: candidateId,
            title,
            file_path: `${bucket}/${objectPath}`,
            document_type: documentType,
            mime_type: file.type || null,
            uploaded_by: userId,
            updated_at: new Date().toISOString(),
        })

        if (insertError) {
            await supabase.storage.from(bucket).remove([objectPath])
            setErrorMessage(buildUserFacingErrorMessage({ action: 'save', resource: 'document metadata' }))
            setIsUploading(false)
            return
        }

        setTitle('')
        setDocumentType('general')
        setFile(null)
        setStatusMessage('Document uploaded successfully.')
        setIsUploading(false)
        await loadDocuments()
    }

    const openDocument = async (filePath: string) => {
        const parts = filePath.split('/')
        const fileBucket = parts[0]
        const pathInsideBucket = parts.slice(1).join('/')

        if (!fileBucket || !pathInsideBucket) {
            setErrorMessage('Invalid file path stored for document.')
            return
        }

        const { data, error } = await supabase.storage.from(fileBucket).createSignedUrl(pathInsideBucket, 120)

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'open', resource: 'document' }))
            return
        }

        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    }

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Document Vault</h1>
            <p className="mt-3 text-slate-600">Store and organize receipts, filings, and campaign records.</p>

            {isLoading ? <p className="mt-4 text-sm text-slate-600">Loading documents...</p> : null}
            {errorMessage ? <p className="mt-4 text-sm text-red-700" role="alert">{errorMessage}</p> : null}
            {statusMessage ? <p className="mt-4 text-sm text-emerald-700">{statusMessage}</p> : null}

            <form className="mt-6 grid max-w-2xl gap-3" onSubmit={handleUpload}>
                <input
                    id="document-title"
                    className="rounded-lg border border-slate-300 px-3 py-2"
                    placeholder="Document title"
                    value={title}
                    onChange={(event) => {
                        setTitle(event.target.value)
                        setFieldErrors((prev) => ({ ...prev, title: undefined }))
                    }}
                    aria-invalid={Boolean(fieldErrors.title)}
                    aria-describedby={fieldErrors.title ? 'document-title-error' : undefined}
                    required
                />
                {fieldErrors.title ? <p id="document-title-error" className="text-sm text-red-700" role="alert">{fieldErrors.title}</p> : null}

                <div className="grid gap-3 sm:grid-cols-2">
                    <select
                        value={bucket}
                        onChange={(event) => setBucket(event.target.value as (typeof bucketOptions)[number])}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                    >
                        {bucketOptions.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>

                    <input
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        placeholder="Document type (e.g. receipt, filing)"
                        value={documentType}
                        onChange={(event) => setDocumentType(event.target.value)}
                    />
                </div>

                <select
                    value={campaignId}
                    onChange={(event) => {
                        setCampaignId(event.target.value)
                        setFieldErrors((prev) => ({ ...prev, campaignId: undefined }))
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-2"
                    aria-invalid={Boolean(fieldErrors.campaignId)}
                    aria-describedby={fieldErrors.campaignId ? 'document-campaign-error' : undefined}
                >
                    <option value="">No campaign selected (general document)</option>
                    {campaigns.map((campaign) => (
                        <option key={campaign.id} value={campaign.id}>
                            {campaign.campaign_name?.trim() || `Campaign ${campaign.id.slice(0, 8)}`} ({campaign.status})
                        </option>
                    ))}
                </select>
                {fieldErrors.campaignId ? <p id="document-campaign-error" className="text-sm text-red-700" role="alert">{fieldErrors.campaignId}</p> : null}

                <p className="text-xs text-slate-500">
                    Leave campaign empty for general files; the document is still linked to your account by user ID.
                </p>

                <input
                    type="file"
                    className="rounded-lg border border-slate-300 px-3 py-2"
                    onChange={(event) => {
                        setFile(event.target.files?.[0] ?? null)
                        setFieldErrors((prev) => ({ ...prev, file: undefined }))
                    }}
                    aria-invalid={Boolean(fieldErrors.file)}
                    aria-describedby={fieldErrors.file ? 'document-file-error' : undefined}
                    required
                />
                {fieldErrors.file ? <p id="document-file-error" className="text-sm text-red-700" role="alert">{fieldErrors.file}</p> : null}

                <button
                    type="submit"
                    disabled={isUploading}
                    className="w-fit rounded-lg bg-[#0f4c81] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b3c65] disabled:opacity-60"
                >
                    {isUploading ? 'Uploading...' : 'Upload Document'}
                </button>
            </form>

            <div className="mt-8 space-y-3">
                {docs.map((doc) => (
                    <article key={doc.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="font-semibold text-slate-900">{doc.title}</p>
                                <p className="mt-1 text-sm text-slate-600">Type: {doc.document_type ?? 'general'}</p>
                                <p className="text-sm text-slate-600">Path: {doc.file_path}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => openDocument(doc.file_path)}
                                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                            >
                                Open
                            </button>
                        </div>
                    </article>
                ))}

                {!isLoading && docs.length === 0 ? (
                    <EmptyStateCard
                        title="No documents have been uploaded yet."
                        message="Add a filing, receipt, or campaign record to start building your document vault."
                        actionLabel="Upload Document"
                        onAction={() => {
                            const documentTitleInput = document.getElementById('document-title') as HTMLInputElement | null
                            documentTitleInput?.focus()
                        }}
                    />
                ) : null}
            </div>
        </section>
    )
}

export default Documents
