import LegalLayout from '../components/LegalLayout'

function TermsOfUse() {
    return (
        <LegalLayout
            title="Terms of Use"
            subtitle="These terms govern your use of the Civic Candidate Support Platform."
            lastUpdated="June 28, 2026"
        >
            <h2>Purpose</h2>
            <p>
                CCSP provides organizational tools that assist campaign administration, volunteer coordination,
                document management, and campaign planning.
            </p>

            <h2>Acceptable Use</h2>
            <p>Users agree to:</p>
            <ul>
                <li>provide accurate information</li>
                <li>comply with campaign finance laws</li>
                <li>maintain account security</li>
                <li>use the platform responsibly</li>
                <li>respect other users</li>
            </ul>
            <p>Users may not:</p>
            <ul>
                <li>misuse the platform</li>
                <li>attempt unauthorized access</li>
                <li>upload malicious software</li>
                <li>interfere with platform operations</li>
            </ul>

            <h2>User Responsibility</h2>
            <p>Users remain responsible for:</p>
            <ul>
                <li>campaign filings</li>
                <li>campaign finances</li>
                <li>compliance with applicable laws</li>
                <li>official submissions</li>
            </ul>

            <h2>Platform Availability</h2>
            <p>CCSP strives for reliable service but cannot guarantee uninterrupted availability.</p>

            <h2>Changes</h2>
            <p>Terms may be updated periodically. Continued use constitutes acceptance of revised terms.</p>
        </LegalLayout>
    )
}

export default TermsOfUse
