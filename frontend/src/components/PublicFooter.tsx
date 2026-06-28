import { Link } from 'react-router-dom'

const footerLinks = [
    { to: '/privacy', label: 'Privacy Policy' },
    { to: '/terms', label: 'Terms of Use' },
    { to: '/accessibility', label: 'Accessibility' },
    { to: '/cookies', label: 'Cookie Policy' },
    { to: '/legal-disclaimer', label: 'Legal Disclaimer' },
]

function PublicFooter() {
    return (
        <footer className="mt-8 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
                {footerLinks.map((link) => (
                    <Link key={link.to} to={link.to} className="font-medium text-slate-700 hover:text-slate-900 hover:underline">
                        {link.label}
                    </Link>
                ))}
                <a href="mailto:ccspcivicos@gmail.com" className="font-medium text-slate-700 hover:text-slate-900 hover:underline">
                    Contact
                </a>
            </div>
        </footer>
    )
}

export default PublicFooter
