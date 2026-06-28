import LegalLayout from '../components/LegalLayout'

function Accessibility() {
    return (
        <LegalLayout
            title="Accessibility Statement"
            subtitle="Civic participation should be accessible to everyone."
            lastUpdated="June 28, 2026"
        >
            <p>CCSP is committed to providing an accessible experience for all users.</p>
            <p>The platform is designed to support:</p>
            <ul>
                <li>keyboard navigation</li>
                <li>screen readers</li>
                <li>readable typography</li>
                <li>sufficient color contrast</li>
                <li>responsive layouts</li>
                <li>clear error messaging</li>
            </ul>
            <p>
                If users experience accessibility barriers they may contact{' '}
                <a href="mailto:ccspcivicos@gmail.com">ccspcivicos@gmail.com</a>.
            </p>
            <p>Feedback helps improve future releases.</p>
        </LegalLayout>
    )
}

export default Accessibility
