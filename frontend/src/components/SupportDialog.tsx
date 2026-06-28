import { useEffect, useRef, useState } from 'react'

type SupportDialogProps = {
    open: boolean
    onClose: () => void
}

let stripeScriptPromise: Promise<void> | null = null

function loadStripeScript(): Promise<void> {
    if (stripeScriptPromise) return stripeScriptPromise

    stripeScriptPromise = new Promise((resolve, reject) => {
        if (document.querySelector('script[src="https://js.stripe.com/v3/buy-button.js"]')) {
            resolve()
            return
        }

        const script = document.createElement('script')
        script.src = 'https://js.stripe.com/v3/buy-button.js'
        script.async = true
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('Failed to load Stripe'))
        document.head.appendChild(script)
    })

    return stripeScriptPromise
}

const STRIPE_CHECKOUT_URL = 'https://buy.stripe.com/3cI14ne1pdTB7Sq7yW9oc00'

function SupportDialog({ open, onClose }: SupportDialogProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [loading, setLoading] = useState(true)
    const [scriptFailed, setScriptFailed] = useState(false)

    useEffect(() => {
        if (!open) return

        setLoading(true)
        setScriptFailed(false)

        loadStripeScript()
            .then(() => {
                if (containerRef.current) {
                    containerRef.current.innerHTML = ''
                    const buyButton = document.createElement('stripe-buy-button')
                    buyButton.setAttribute('buy-button-id', 'buy_btn_1T6zIlQ41M31TbLQJQx0bdFC')
                    buyButton.setAttribute('publishable-key', 'pk_live_51PtDMyQ41M31TbLQQ2QwN3Yf8eba43z9X7hQNTnV1GM6EDnIJnjUiVtEJ5Ua1A4DoD8xoezeL7PfNTOzFIeFLaOi00SsptHeyf')
                    containerRef.current.appendChild(buyButton)
                }
                window.setTimeout(() => setLoading(false), 1500)
            })
            .catch(() => {
                setScriptFailed(true)
                setLoading(false)
            })
    }, [open])

    useEffect(() => {
        if (!open) return

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose()
        }

        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [open, onClose])

    if (!open) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Support Felix Consult"
        >
            <div
                className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-center text-lg font-semibold text-slate-900">Support Felix Consult</h2>
                        <p className="mt-1 text-center text-sm text-slate-600">
                            Your support helps us keep this tool free and continuously improving. Thank you!
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                        aria-label="Close support dialog"
                    >
                        Close
                    </button>
                </div>

                {loading ? <p className="mt-6 text-center text-sm text-slate-600">Loading payment options...</p> : null}

                <div
                    ref={containerRef}
                    className="mt-4 flex min-h-[80px] justify-center"
                    style={{ display: loading ? 'none' : 'flex' }}
                />

                {(scriptFailed || !loading) ? (
                    <div className="mt-3 flex justify-center">
                        <a
                            href={STRIPE_CHECKOUT_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                            Open payment page
                        </a>
                    </div>
                ) : null}
            </div>
        </div>
    )
}

export default SupportDialog
