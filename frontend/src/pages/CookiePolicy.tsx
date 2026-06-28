import LegalLayout from '../components/LegalLayout'

function CookiePolicy() {
    return (
        <LegalLayout
            title="Cookie Policy"
            subtitle="Understanding how CCSP uses cookies."
            lastUpdated="June 28, 2026"
        >
            <p>CCSP uses cookies only where necessary to:</p>
            <ul>
                <li>keep users signed in</li>
                <li>maintain session security</li>
                <li>remember preferences</li>
                <li>improve application performance</li>
            </ul>
            <p>Analytics cookies may be used to understand how the platform is used.</p>
            <p>Users can manage cookies through browser settings.</p>
        </LegalLayout>
    )
}

export default CookiePolicy
