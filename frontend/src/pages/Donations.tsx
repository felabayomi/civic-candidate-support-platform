import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/authContext'
import { supabase } from '../lib/supabaseClient'
import { buildUserFacingErrorMessage } from '../lib/userFacingError'
import ComplianceWarning from '../components/ComplianceWarning'
import EmptyStateCard from '../components/EmptyStateCard'

type DonationRow = {
    id: string
    donor_name: string
    donor_email: string | null
    amount: number
    donation_date: string
    reference_number: string | null
}

type ReceiptDocumentRow = {
    id: string
    title: string
    file_path?: string
    document_type: string | null
    created_at: string
}

type CampaignRow = {
    id: string
}

type LinkedReceipt = {
    id: string
    title: string
    file_path: string
    document_type: string | null
    created_at: string
}

type RawDonationLinkRow = {
    donation_id: string
    document: LinkedReceipt | LinkedReceipt[] | null
}

function Donations() {
    const largeContributionThreshold = 1000

    const { session } = useAuth()
    const userId = useMemo(() => session?.user.id ?? '', [session])

    const [candidateId, setCandidateId] = useState<string | null>(null)
    const [donorName, setDonorName] = useState('')
    const [donorEmail, setDonorEmail] = useState('')
    const [amount, setAmount] = useState('')
    const [donationDate, setDonationDate] = useState('')
    const [referenceNumber, setReferenceNumber] = useState('')
    const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null)
    const [receiptDocuments, setReceiptDocuments] = useState<ReceiptDocumentRow[]>([])
    const [selectedReceiptDocumentId, setSelectedReceiptDocumentId] = useState('')
    const [receiptFile, setReceiptFile] = useState<File | null>(null)
    const [receiptTitle, setReceiptTitle] = useState('')
    const [donations, setDonations] = useState<DonationRow[]>([])
    const [linkedReceiptsByDonation, setLinkedReceiptsByDonation] = useState<Record<string, LinkedReceipt[]>>({})
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [errorMessage, setErrorMessage] = useState('')
    const [statusMessage, setStatusMessage] = useState('')
    const [complianceWarnings, setComplianceWarnings] = useState<string[]>([])
    const [hasBlockingWarnings, setHasBlockingWarnings] = useState(false)

    const isReceiptDocument = (doc: ReceiptDocumentRow) => {
        const normalizedType = (doc.document_type ?? '').toLowerCase()
        return (
            normalizedType === 'receipt' ||
            normalizedType === 'donation-receipt' ||
            normalizedType === 'campaign-receipt' ||
            (doc.file_path ?? '').startsWith('campaign-receipts/')
        )
    }

    const loadData = async () => {
        if (!userId) {
            setIsLoading(false)
            return
        }

        setIsLoading(true)
        setErrorMessage('')

        const { data: candidate, error: candidateError } = await supabase
            .from('candidates')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle<{ id: string }>()

        if (candidateError) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'load', resource: 'donation data' }))
            setIsLoading(false)
            return
        }

        if (!candidate) {
            setCandidateId(null)
            setActiveCampaignId(null)
            setReceiptDocuments([])
            setDonations([])
            setLinkedReceiptsByDonation({})
            setIsLoading(false)
            return
        }

        setCandidateId(candidate.id)

        const [{ data: donationRows, error: donationsError }, { data: campaignRows, error: campaignsError }, { data: documentRows, error: documentsError }] = await Promise.all([
            supabase
                .from('donations')
                .select('id, donor_name, donor_email, amount, donation_date, reference_number')
                .eq('candidate_id', candidate.id)
                .order('donation_date', { ascending: false }),
            supabase
                .from('campaigns')
                .select('id')
                .eq('candidate_id', candidate.id)
                .order('created_at', { ascending: false })
                .limit(1),
            supabase
                .from('documents')
                .select('id, title, file_path, document_type, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false }),
        ])

        if (campaignsError) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'load', resource: 'campaign data' }))
            setIsLoading(false)
            return
        }

        if (documentsError) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'load', resource: 'receipt documents' }))
            setIsLoading(false)
            return
        }

        if (donationsError) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'load', resource: 'donations' }))
            setIsLoading(false)
            return
        }

        const latestCampaign = ((campaignRows ?? []) as CampaignRow[])[0] ?? null
        const resolvedDonations = (donationRows ?? []) as DonationRow[]
        const donationIds = resolvedDonations.map((row) => row.id)
        const resolvedDocuments = ((documentRows ?? []) as ReceiptDocumentRow[]).filter(isReceiptDocument)

        const nextLinksByDonation: Record<string, LinkedReceipt[]> = {}
        if (donationIds.length > 0) {
            const { data: linkRows, error: linkError } = await supabase
                .from('donation_document_links')
                .select('donation_id, document:documents(id, title, file_path, document_type, created_at)')
                .in('donation_id', donationIds)

            if (linkError) {
                setErrorMessage(buildUserFacingErrorMessage({ action: 'load', resource: 'linked receipts' }))
            } else {
                const normalizedRows = (linkRows ?? []) as RawDonationLinkRow[]
                normalizedRows.forEach((row) => {
                    const normalizedDocument = Array.isArray(row.document)
                        ? row.document[0] ?? null
                        : row.document

                    if (!normalizedDocument) {
                        return
                    }

                    if (!nextLinksByDonation[row.donation_id]) {
                        nextLinksByDonation[row.donation_id] = []
                    }

                    nextLinksByDonation[row.donation_id].push(normalizedDocument)
                })
            }
        }

        setActiveCampaignId(latestCampaign?.id ?? null)
        setReceiptDocuments(resolvedDocuments)
        setDonations(resolvedDonations)
        setLinkedReceiptsByDonation(nextLinksByDonation)
        setIsLoading(false)
    }

    useEffect(() => {
        loadData()
    }, [userId])

    const collectComplianceWarnings = () => {
        const warnings: string[] = []
        const blockingWarnings: string[] = []
        const parsedAmount = Number(amount)
        const reference = referenceNumber.trim().toLowerCase()
        const hasReceiptEvidence = Boolean(referenceNumber.trim() || selectedReceiptDocumentId || receiptFile)

        if (!donorName.trim()) {
            blockingWarnings.push('missing donor name')
        }

        // Donor address is not yet a dedicated field, so we use contact as interim compliance signal.
        if (!donorEmail.trim()) {
            warnings.push('missing donor address')
        }

        if (!amount.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
            blockingWarnings.push('missing amount')
        }

        if (!donationDate) {
            blockingWarnings.push('missing date')
        }

        if (reference.includes('cash')) {
            warnings.push('cash contribution')
        }

        if (!Number.isNaN(parsedAmount) && parsedAmount >= largeContributionThreshold) {
            warnings.push('large contribution')
        }

        if (!hasReceiptEvidence) {
            warnings.push('missing receipt')
        }

        return {
            warnings: [...blockingWarnings, ...warnings],
            hasBlockingWarnings: blockingWarnings.length > 0,
        }
    }

    const saveDonation = async () => {
        if (!candidateId || !userId) {
            setErrorMessage('Create your candidate profile first.')
            return
        }

        setIsSaving(true)
        setErrorMessage('')
        setStatusMessage('')

        const { data: insertedDonation, error } = await supabase
            .from('donations')
            .insert({
                candidate_id: candidateId,
                donor_name: donorName,
                donor_email: donorEmail || null,
                amount: Number(amount),
                donation_date: donationDate,
                reference_number: referenceNumber || null,
                created_by: userId,
            })
            .select('id')
            .single<{ id: string }>()

        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'save', resource: 'donation' }))
            setIsSaving(false)
            return
        }

        let linkedDocumentId: string | null = selectedReceiptDocumentId || null
        let linkedStatusMessage = 'Donation saved.'

        if (receiptFile) {
            const safeName = receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
            const objectPath = `${userId}/${Date.now()}-${safeName}`

            const { error: uploadError } = await supabase.storage.from('campaign-receipts').upload(objectPath, receiptFile, {
                cacheControl: '3600',
                upsert: false,
            })

            if (uploadError) {
                setErrorMessage(buildUserFacingErrorMessage({ action: 'upload', resource: 'receipt file' }))
                setIsSaving(false)
                return
            }

            const effectiveReceiptTitle = receiptTitle.trim() || `Receipt - ${donorName || 'donation'} - ${donationDate}`
            const { data: insertedDocument, error: insertDocumentError } = await supabase
                .from('documents')
                .insert({
                    user_id: userId,
                    campaign_id: activeCampaignId,
                    candidate_id: candidateId,
                    title: effectiveReceiptTitle,
                    file_path: `campaign-receipts/${objectPath}`,
                    document_type: 'donation-receipt',
                    mime_type: receiptFile.type || null,
                    uploaded_by: userId,
                    updated_at: new Date().toISOString(),
                })
                .select('id')
                .single<{ id: string }>()

            if (insertDocumentError) {
                await supabase.storage.from('campaign-receipts').remove([objectPath])
                setErrorMessage(buildUserFacingErrorMessage({ action: 'save', resource: 'receipt document' }))
                setIsSaving(false)
                return
            }

            linkedDocumentId = insertedDocument.id
        }

        if (linkedDocumentId && insertedDonation?.id) {
            const { error: linkError } = await supabase.from('donation_document_links').insert({
                donation_id: insertedDonation.id,
                document_id: linkedDocumentId,
                linked_by: userId,
            })

            if (linkError) {
                setErrorMessage(buildUserFacingErrorMessage({ action: 'link', resource: 'receipt' }))
                setIsSaving(false)
                return
            }

            linkedStatusMessage = 'Donation saved with linked receipt.'
        }

        setDonorName('')
        setDonorEmail('')
        setAmount('')
        setDonationDate('')
        setReferenceNumber('')
        setSelectedReceiptDocumentId('')
        setReceiptFile(null)
        setReceiptTitle('')
        setStatusMessage(linkedStatusMessage)
        setComplianceWarnings([])
        setHasBlockingWarnings(false)
        setIsSaving(false)
        await loadData()
    }

    const handleSaveDonation = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setErrorMessage('')
        setStatusMessage('')

        const warningResult = collectComplianceWarnings()
        if (warningResult.warnings.length > 0) {
            setComplianceWarnings(warningResult.warnings)
            setHasBlockingWarnings(warningResult.hasBlockingWarnings)
            return
        }

        await saveDonation()
    }

    const openLinkedReceipt = async (filePath: string) => {
        const parts = filePath.split('/')
        const bucket = parts[0]
        const pathInsideBucket = parts.slice(1).join('/')

        if (!bucket || !pathInsideBucket) {
            setErrorMessage('Invalid receipt file path.')
            return
        }

        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(pathInsideBucket, 120)
        if (error) {
            setErrorMessage(buildUserFacingErrorMessage({ action: 'open', resource: 'receipt' }))
            return
        }

        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    }

    const totalDonations = donations.reduce((sum, item) => sum + Number(item.amount || 0), 0)

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Donation Tracking</h1>
            <p className="mt-3 text-slate-600">Record contributions and monitor totals by period.</p>

            {isLoading ? <p className="mt-4 text-sm text-slate-600">Loading donations...</p> : null}
            {errorMessage ? <p className="mt-4 text-sm text-red-600">{errorMessage}</p> : null}
            {statusMessage ? <p className="mt-4 text-sm text-emerald-700">{statusMessage}</p> : null}

            {!candidateId ? (
                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                    Create Candidate Profile first, then add donations.
                </div>
            ) : (
                <>
                    <form className="mt-6 grid max-w-2xl gap-3" onSubmit={handleSaveDonation}>
                        <input
                            id="donation-donor-name"
                            className="rounded-lg border border-slate-300 px-3 py-2"
                            placeholder="Donor name"
                            value={donorName}
                            onChange={(e) => setDonorName(e.target.value)}
                        />
                        <input
                            className="rounded-lg border border-slate-300 px-3 py-2"
                            placeholder="Donor email (optional)"
                            type="email"
                            value={donorEmail}
                            onChange={(e) => setDonorEmail(e.target.value)}
                        />
                        <input
                            className="rounded-lg border border-slate-300 px-3 py-2"
                            placeholder="Amount"
                            type="number"
                            min="0"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                        />
                        <input
                            className="rounded-lg border border-slate-300 px-3 py-2"
                            type="date"
                            value={donationDate}
                            onChange={(e) => setDonationDate(e.target.value)}
                        />
                        <input
                            className="rounded-lg border border-slate-300 px-3 py-2"
                            placeholder="Reference number (optional)"
                            value={referenceNumber}
                            onChange={(e) => setReferenceNumber(e.target.value)}
                        />

                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-sm font-semibold text-slate-800">Receipt Attachment (optional)</p>
                            <p className="mt-1 text-xs text-slate-600">
                                Choose an existing receipt document or upload a new one to link with this donation.
                            </p>

                            <select
                                value={selectedReceiptDocumentId}
                                onChange={(e) => setSelectedReceiptDocumentId(e.target.value)}
                                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2"
                            >
                                <option value="">Select existing document</option>
                                {receiptDocuments.map((doc) => (
                                    <option key={doc.id} value={doc.id}>
                                        {doc.title} ({new Date(doc.created_at).toLocaleDateString()})
                                    </option>
                                ))}
                            </select>

                            <input
                                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2"
                                placeholder="Receipt title (used for uploaded file)"
                                value={receiptTitle}
                                onChange={(e) => setReceiptTitle(e.target.value)}
                            />

                            <input
                                type="file"
                                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2"
                                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isSaving}
                            className="w-fit rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                        >
                            {isSaving ? 'Saving...' : 'Save Donation'}
                        </button>
                    </form>

                    <div className="mt-4">
                        <ComplianceWarning
                            title="Donation Compliance Warning"
                            warnings={complianceWarnings}
                            hasBlockingWarnings={hasBlockingWarnings}
                            onProceed={hasBlockingWarnings ? undefined : saveDonation}
                            onCancel={() => {
                                setComplianceWarnings([])
                                setHasBlockingWarnings(false)
                            }}
                        />
                    </div>

                    <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-semibold text-slate-700">Total Donations</p>
                        <p className="mt-1 text-xl font-semibold text-slate-900">${totalDonations.toFixed(2)}</p>
                    </div>

                    <div className="mt-6 space-y-3">
                        {donations.map((item) => (
                            <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                                {(() => {
                                    const linkedReceipts = linkedReceiptsByDonation[item.id] ?? []

                                    return (
                                        <>
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <p className="font-semibold text-slate-900">{item.donor_name}</p>
                                                <p className="text-sm font-semibold text-slate-900">${Number(item.amount).toFixed(2)}</p>
                                            </div>
                                            <p className="mt-1 text-sm text-slate-600">Date: {item.donation_date}</p>
                                            {item.donor_email ? <p className="text-sm text-slate-600">Email: {item.donor_email}</p> : null}
                                            {item.reference_number ? <p className="text-sm text-slate-600">Ref: {item.reference_number}</p> : null}

                                            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">View linked receipts</p>
                                                {linkedReceipts.length === 0 ? (
                                                    <p className="mt-1 text-sm text-slate-600">No linked receipts for this donation.</p>
                                                ) : (
                                                    <div className="mt-2 space-y-2">
                                                        {linkedReceipts.map((receipt) => (
                                                            <div
                                                                key={receipt.id}
                                                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
                                                            >
                                                                <p className="text-sm text-slate-800">{receipt.title}</p>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openLinkedReceipt(receipt.file_path)}
                                                                    className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-700"
                                                                >
                                                                    Open
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )
                                })()}
                            </article>
                        ))}
                        {!isLoading && donations.length === 0 ? (
                            <EmptyStateCard
                                title="No donations have been recorded yet."
                                message="Start tracking campaign contributions so totals and reports stay filing-ready."
                                actionLabel="Add Donation"
                                onAction={() => {
                                    const donationInput = document.getElementById('donation-donor-name') as HTMLInputElement | null
                                    donationInput?.focus()
                                }}
                            />
                        ) : null}
                    </div>
                </>
            )}
        </section>
    )
}

export default Donations
