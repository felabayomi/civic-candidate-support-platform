import LegalLayout from '../components/LegalLayout'

function PrivacyPolicy() {
    return (
        <LegalLayout
            title="Privacy Policy"
            subtitle="Your privacy matters. CCSP is committed to protecting the information you share with us while providing tools that help candidates, volunteers, treasurers, advisors, and civic organizations coordinate campaign activities."
            lastUpdated="June 28, 2026"
        >
            <h2>Information We Collect</h2>
            <p>CCSP may collect information including:</p>
            <ul>
                <li>Name</li>
                <li>Email address</li>
                <li>Organization or campaign information</li>
                <li>User role</li>
                <li>Uploaded campaign documents</li>
                <li>Campaign finance records entered into the platform</li>
                <li>Volunteer information</li>
                <li>System usage information needed to improve the platform</li>
            </ul>
            <p>We do not collect information that is unnecessary for operating the platform.</p>

            <h2>How Information Is Used</h2>
            <p>Information is used to:</p>
            <ul>
                <li>provide platform services</li>
                <li>authenticate users</li>
                <li>improve user experience</li>
                <li>provide reminders</li>
                <li>generate reports</li>
                <li>improve accessibility</li>
                <li>improve platform reliability</li>
                <li>support customer assistance</li>
            </ul>
            <p>We do not sell personal information.</p>

            <h2>Security</h2>
            <p>CCSP uses industry-standard security practices including:</p>
            <ul>
                <li>encrypted connections</li>
                <li>secure authentication</li>
                <li>role-based access controls</li>
                <li>protected cloud storage</li>
                <li>audit logging</li>
            </ul>
            <p>No online service can guarantee absolute security.</p>

            <h2>User Control</h2>
            <p>Users may:</p>
            <ul>
                <li>update their profile</li>
                <li>change passwords</li>
                <li>request account deletion</li>
                <li>request export of their data (where supported)</li>
            </ul>

            <h2>Contact</h2>
            <p>
                Questions regarding privacy should be directed to{' '}
                <a href="mailto:ccspcivicos@gmail.com">ccspcivicos@gmail.com</a>.
            </p>
        </LegalLayout>
    )
}

export default PrivacyPolicy
