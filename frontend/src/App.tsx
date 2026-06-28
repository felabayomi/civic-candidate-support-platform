import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Navbar, { type NavItem } from './components/Navbar'
import PublicFooter from './components/PublicFooter'
import { useAuth } from './lib/authContext'
import { ProtectedRoute } from './lib/protectedRoute'
import { RoleProtectedRoute } from './lib/roleProtectedRoute'

const loadAdminConsole = () => import('./pages/AdminConsole')
const loadAIComplianceAssistant = () => import('./pages/AIComplianceAssistant')
const loadAccessibility = () => import('./pages/Accessibility')
const loadCampaignLaunchWizard = () => import('./pages/CampaignLaunchWizard')
const loadCandidateProfile = () => import('./pages/CandidateProfile')
const loadCandidateDashboardGate = () => import('./pages/CandidateDashboardGate')
const loadCookiePolicy = () => import('./pages/CookiePolicy')
const loadComplianceChecklist = () => import('./pages/ComplianceChecklist')
const loadDashboard = () => import('./pages/Dashboard')
const loadDocuments = () => import('./pages/Documents')
const loadDonations = () => import('./pages/Donations')
const loadExpenses = () => import('./pages/Expenses')
const loadFilingValidation = () => import('./pages/FilingValidation')
const loadHelp = () => import('./pages/Help')
const loadLogin = () => import('./pages/Login')
const loadLandingPage = () => import('./pages/LandingPage')
const loadLegalDisclaimer = () => import('./pages/LegalDisclaimer')
const loadPrivacyPolicy = () => import('./pages/PrivacyPolicy')
const loadReports = () => import('./pages/Reports')
const loadTreasurerAssignments = () => import('./pages/TreasurerAssignments')
const loadTreasurerMarketplace = () => import('./pages/TreasurerMarketplace')
const loadTreasurerProfile = () => import('./pages/TreasurerProfile')
const loadTermsOfUse = () => import('./pages/TermsOfUse')
const loadPublicCandidateProfile = () => import('./pages/PublicCandidateProfile')
const loadVolunteerMatching = () => import('./pages/VolunteerMatching')
const loadVolunteerProfile = () => import('./pages/VolunteerProfile')
const loadWelcome = () => import('./pages/Welcome')

const AdminConsole = lazy(loadAdminConsole)
const AIComplianceAssistant = lazy(loadAIComplianceAssistant)
const Accessibility = lazy(loadAccessibility)
const CampaignLaunchWizard = lazy(loadCampaignLaunchWizard)
const CandidateProfile = lazy(loadCandidateProfile)
const CandidateDashboardGate = lazy(loadCandidateDashboardGate)
const CookiePolicy = lazy(loadCookiePolicy)
const ComplianceChecklist = lazy(loadComplianceChecklist)
const Dashboard = lazy(loadDashboard)
const Documents = lazy(loadDocuments)
const Donations = lazy(loadDonations)
const Expenses = lazy(loadExpenses)
const FilingValidation = lazy(loadFilingValidation)
const Help = lazy(loadHelp)
const Login = lazy(loadLogin)
const LandingPage = lazy(loadLandingPage)
const LegalDisclaimer = lazy(loadLegalDisclaimer)
const PrivacyPolicy = lazy(loadPrivacyPolicy)
const Reports = lazy(loadReports)
const TermsOfUse = lazy(loadTermsOfUse)
const TreasurerAssignments = lazy(loadTreasurerAssignments)
const TreasurerMarketplace = lazy(loadTreasurerMarketplace)
const TreasurerProfile = lazy(loadTreasurerProfile)
const PublicCandidateProfile = lazy(loadPublicCandidateProfile)
const VolunteerMatching = lazy(loadVolunteerMatching)
const VolunteerProfile = lazy(loadVolunteerProfile)
const Welcome = lazy(loadWelcome)

const preloadableRoutes: Record<string, () => Promise<unknown>> = {
  '/': loadLandingPage,
  '/login': loadLogin,
  '/privacy': loadPrivacyPolicy,
  '/terms': loadTermsOfUse,
  '/accessibility': loadAccessibility,
  '/cookies': loadCookiePolicy,
  '/legal-disclaimer': loadLegalDisclaimer,
  '/welcome': loadWelcome,
  '/dashboard': loadDashboard,
  '/campaign-launch': loadCampaignLaunchWizard,
  '/candidate-profile': loadCandidateProfile,
  '/compliance-checklist': loadComplianceChecklist,
  '/treasurer': loadTreasurerMarketplace,
  '/treasurer-marketplace': loadTreasurerMarketplace,
  '/treasurer-profile': loadTreasurerProfile,
  '/treasurer-assignments': loadTreasurerAssignments,
  '/volunteer-profile': loadVolunteerProfile,
  '/volunteer-matching': loadVolunteerMatching,
  '/donations': loadDonations,
  '/expenses': loadExpenses,
  '/reports': loadReports,
  '/filing-validation': loadFilingValidation,
  '/documents': loadDocuments,
  '/ai-compliance-assistant': loadAIComplianceAssistant,
  '/admin-console': loadAdminConsole,
  '/help': loadHelp,
}

const appNavItems: NavItem[] = [
  { path: '/login', label: 'Login' },
  { path: '/welcome', label: 'Start Here' },
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/campaign-launch', label: 'Campaign Launch Wizard' },
  { path: '/candidate-profile', label: 'Candidate Profile' },
  { path: '/compliance-checklist', label: 'Compliance Checklist' },
  { path: '/treasurer-marketplace', label: 'Treasurer Marketplace' },
  { path: '/treasurer-profile', label: 'Treasurer Profile' },
  { path: '/treasurer-assignments', label: 'Treasurer Assignments' },
  { path: '/volunteer-profile', label: 'Volunteer Profile' },
  { path: '/volunteer-matching', label: 'Volunteer Matching' },
  { path: '/donations', label: 'Donations' },
  { path: '/expenses', label: 'Expenses' },
  { path: '/reports', label: 'Reports' },
  { path: '/filing-validation', label: 'Filing Validation' },
  { path: '/documents', label: 'Documents' },
  { path: '/ai-compliance-assistant', label: 'AI Compliance Assistant' },
  { path: '/admin-console', label: 'Admin Console' },
  { path: '/help', label: 'Help' },
]

const publicNavItems: NavItem[] = [
  { path: '/', label: 'Home' },
  { path: '/login', label: 'Login' },
]

function RouteLoadingFallback() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
      Loading workspace...
    </div>
  )
}

function App() {
  const { session } = useAuth()
  const navItems = session ? appNavItems : publicNavItems

  const prefetchRoute = (path: string) => {
    const preload = preloadableRoutes[path]
    if (preload) {
      void preload()
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fef3c7,_#f8fafc_42%,_#e2e8f0_100%)] text-slate-900">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-[280px_1fr] lg:p-8">
        <Navbar items={navItems} onPrefetchRoute={prefetchRoute} />

        <main id="main-content" className="pb-10 lg:pt-2" tabIndex={-1}>
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfUse />} />
              <Route path="/accessibility" element={<Accessibility />} />
              <Route path="/cookies" element={<CookiePolicy />} />
              <Route path="/legal-disclaimer" element={<LegalDisclaimer />} />
              <Route path="/welcome" element={<ProtectedRoute><Welcome /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><CandidateDashboardGate><Dashboard /></CandidateDashboardGate></ProtectedRoute>} />
              <Route path="/campaign-launch" element={<RoleProtectedRoute allowedRoles={['candidate', 'admin']}><CampaignLaunchWizard /></RoleProtectedRoute>} />
              <Route path="/candidate-profile" element={<RoleProtectedRoute allowedRoles={['candidate', 'admin']}><CandidateProfile /></RoleProtectedRoute>} />
              <Route path="/compliance-checklist" element={<ProtectedRoute><ComplianceChecklist /></ProtectedRoute>} />
              <Route path="/treasurer" element={<ProtectedRoute><TreasurerMarketplace /></ProtectedRoute>} />
              <Route path="/treasurer-marketplace" element={<ProtectedRoute><TreasurerMarketplace /></ProtectedRoute>} />
              <Route path="/treasurer-profile" element={<RoleProtectedRoute allowedRoles={['treasurer', 'admin']}><TreasurerProfile /></RoleProtectedRoute>} />
              <Route path="/treasurer-assignments" element={<RoleProtectedRoute allowedRoles={['treasurer', 'admin']}><TreasurerAssignments /></RoleProtectedRoute>} />
              <Route path="/volunteer-profile" element={<ProtectedRoute><VolunteerProfile /></ProtectedRoute>} />
              <Route path="/volunteer-matching" element={<ProtectedRoute><VolunteerMatching /></ProtectedRoute>} />
              <Route path="/donations" element={<ProtectedRoute><Donations /></ProtectedRoute>} />
              <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
              <Route path="/filing-validation" element={<ProtectedRoute><FilingValidation /></ProtectedRoute>} />
              <Route path="/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
              <Route path="/ai-compliance-assistant" element={<ProtectedRoute><AIComplianceAssistant /></ProtectedRoute>} />
              <Route path="/candidate/:candidateKey" element={<PublicCandidateProfile />} />
              <Route
                path="/admin-console"
                element={
                  <RoleProtectedRoute
                    allowedRoles={['admin']}
                    showUnauthorizedPage
                    unauthorizedTitle="Organization Admins Only"
                    unauthorizedMessage="This console is reserved for organization support staff. Your candidate workspace remains free to use. If you need help with account, documents, or deadline corrections, contact your organization support team."
                  >
                    <AdminConsole />
                  </RoleProtectedRoute>
                }
              />
              <Route path="/help" element={<ProtectedRoute><Help /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          <PublicFooter />
        </main>
      </div>
    </div>
  )
}

export default App
