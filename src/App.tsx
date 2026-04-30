import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import ErrorBoundary from './components/ErrorBoundary'
import RequirePortalAccess from './components/RequirePortalAccess'
import { ThemeProvider } from './contexts/ThemeContext'
import { ActivityLogProvider } from './contexts/ActivityLogContext'
import { ApplicationsProvider } from './contexts/ApplicationsContext'
import { ChatProvider } from './contexts/ChatContext'

const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
import DashboardLayout from './layouts/DashboardLayout'
import AdminLayout from './layouts/AdminLayout'
import PortalLayout from './layouts/PortalLayout'
import GeneralManagerLayout from './layouts/GeneralManagerLayout'
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminEmployees = lazy(() => import('./pages/admin/AdminEmployees'))
const AdminProfile = lazy(() => import('./pages/admin/AdminProfile'))
const AdminApplications = lazy(() => import('./pages/admin/AdminApplications'))
const AdminHistory = lazy(() => import('./pages/admin/AdminHistory'))
const AdminApprovals = lazy(() => import('./pages/admin/AdminApprovals'))
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers'))
const Marketing = lazy(() => import('./pages/Marketing'))
const Finance = lazy(() => import('./pages/Finance'))
const Engineering = lazy(() => import('./pages/Engineering'))
const SaleDashboard = lazy(() => import('./pages/sale/Dashboard'))
const PurchasingDashboard = lazy(() => import('./pages/purchasing/Dashboard'))
const CustomerDashboard = lazy(() => import('./pages/customer/Dashboard'))
const SupplierDashboard = lazy(() => import('./pages/supplier/Dashboard'))
const OperationsDashboard = lazy(() => import('./pages/operations/Dashboard'))
const FinancialDashboard = lazy(() => import('./pages/financial/Dashboard'))
const AccountingDashboard = lazy(() => import('./pages/accounting/Dashboard'))
const TechnicalDashboard = lazy(() => import('./pages/technical/Dashboard'))
const CeoDashboard = lazy(() => import('./pages/ceo/Dashboard'))
const CoCeoDashboard = lazy(() => import('./pages/co-ceo/Dashboard'))
const PortalApplications = lazy(() => import('./pages/PortalApplications'))
const PortalProfile = lazy(() => import('./pages/PortalProfile'))
const PortalPublicAnnouncement = lazy(() => import('./pages/PortalPublicAnnouncement'))
const PortalMemo = lazy(() => import('./pages/PortalMemo'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const GeneralManagerDashboard = lazy(() => import('./pages/general-manager/GeneralManagerDashboard'))
const DepartmentLeave = lazy(() => import('./pages/_shared/DepartmentLeave'))
const DepartmentLeaveStatus = lazy(() => import('./pages/_shared/DepartmentLeaveStatus'))

function RootErrorFallback() {
  return (
    <div className="flex h-screen h-dvh w-full flex-col items-center justify-center bg-[var(--aa-navy)] p-6 text-center text-white" style={{ background: 'var(--aa-app-bg-gradient)' }}>
      <div className="mb-6 rounded-full bg-white/10 p-4">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
      </div>
      <h2 className="mb-2 text-xl font-bold">Something went wrong</h2>
      <p className="mb-8 text-slate-300 max-w-md mx-auto">The application encountered an unexpected error. This might be due to a network issue or a temporary glitch.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-[var(--aa-blue)] px-8 py-3 font-semibold text-white shadow-lg transition-all hover:bg-[var(--aa-blue-dark)] hover:scale-105 active:scale-95"
      >
        Reload Page
      </button>
    </div>
  )
}

function PageLoader() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--aa-navy)]" style={{ background: 'var(--aa-app-bg-gradient)' }} aria-label="Loading">
      <div className="relative mb-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-[var(--aa-blue)]" />
        <div className="absolute inset-0 h-12 w-12 animate-ping rounded-full border-4 border-[var(--aa-blue)] opacity-20" />
      </div>
      <span className="text-sm font-medium text-white/80 animate-pulse">Loading Portal...</span>
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
    <ActivityLogProvider>
      <ApplicationsProvider>
        <ChatProvider>
          <BrowserRouter>
            <ErrorBoundary fallback={<RootErrorFallback />}>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route element={<RequirePortalAccess />}>
                <Route element={<DashboardLayout />}>
                  <Route path="admin" element={<AdminLayout />}>
                    <Route index element={<AdminDashboard />} />
                    <Route path="employees" element={<AdminEmployees />} />
                    <Route path="customer" element={<AdminCustomers />} />
                    <Route path="profile" element={<AdminProfile />} />
                    <Route path="applications" element={<AdminApplications />} />
                    <Route path="announcement/public-announcement" element={<PortalPublicAnnouncement />} />
                    <Route path="announcement/memo" element={<PortalMemo />} />
                    <Route path="approvals" element={<Navigate to="/admin/approvals/signups" replace />} />
                    <Route path="approvals/signups" element={<AdminApprovals />} />
                    <Route path="approvals/leave-requests" element={<AdminApprovals />} />
                    <Route path="history" element={<AdminHistory />} />
                    <Route path="chat" element={<ChatPage />} />
                  </Route>
                  <Route element={<PortalLayout />}>
                    <Route path="marketing" element={<Marketing />} />
                    <Route path="marketing/applications" element={<PortalApplications />} />
                    <Route path="marketing/announcement/public-announcement" element={<PortalPublicAnnouncement />} />
                    <Route path="marketing/announcement/memo" element={<PortalMemo />} />
                    <Route path="marketing/profile" element={<PortalProfile />} />
                    <Route path="marketing/chat" element={<ChatPage />} />
                    <Route path="sale" element={<SaleDashboard />} />
                    <Route path="sale/applications" element={<PortalApplications />} />
                    <Route path="sale/profile" element={<PortalProfile />} />
                    <Route path="sale/chat" element={<ChatPage />} />
                    <Route path="purchasing" element={<PurchasingDashboard />} />
                    <Route path="purchasing/applications" element={<PortalApplications />} />
                    <Route path="purchasing/profile" element={<PortalProfile />} />
                    <Route path="purchasing/chat" element={<ChatPage />} />
                    <Route path="customer" element={<CustomerDashboard />} />
                    <Route path="customer/applications" element={<PortalApplications />} />
                    <Route path="customer/profile" element={<PortalProfile />} />
                    <Route path="customer/chat" element={<ChatPage />} />
                    <Route path="supplier" element={<SupplierDashboard />} />
                    <Route path="supplier/applications" element={<PortalApplications />} />
                    <Route path="supplier/profile" element={<PortalProfile />} />
                    <Route path="supplier/chat" element={<ChatPage />} />
                    <Route path="operations" element={<OperationsDashboard />} />
                    <Route path="operations/applications" element={<PortalApplications />} />
                    <Route path="operations/profile" element={<PortalProfile />} />
                    <Route path="operations/chat" element={<ChatPage />} />
                    <Route path="finance" element={<Finance />} />
                    <Route path="finance/applications" element={<PortalApplications />} />
                    <Route path="finance/profile" element={<PortalProfile />} />
                    <Route path="finance/chat" element={<ChatPage />} />
                    <Route path="financial" element={<FinancialDashboard />} />
                    <Route path="financial/applications" element={<PortalApplications />} />
                    <Route path="financial/profile" element={<PortalProfile />} />
                    <Route path="financial/chat" element={<ChatPage />} />
                    <Route path="accounting" element={<AccountingDashboard />} />
                    <Route path="accounting/applications" element={<PortalApplications />} />
                    <Route path="accounting/profile" element={<PortalProfile />} />
                    <Route path="accounting/chat" element={<ChatPage />} />
                    <Route path="engineering" element={<Engineering />} />
                    <Route path="engineering/applications" element={<PortalApplications />} />
                    <Route path="engineering/profile" element={<PortalProfile />} />
                    <Route path="engineering/chat" element={<ChatPage />} />
                    <Route path="technical" element={<TechnicalDashboard />} />
                    <Route path="technical/applications" element={<PortalApplications />} />
                    <Route path="technical/profile" element={<PortalProfile />} />
                    <Route path="technical/chat" element={<ChatPage />} />
                    <Route path="ceo" element={<CeoDashboard />} />
                    <Route path="ceo/applications" element={<PortalApplications />} />
                    <Route path="ceo/profile" element={<PortalProfile />} />
                    <Route path="ceo/chat" element={<ChatPage />} />
                    <Route path="co-ceo" element={<CoCeoDashboard />} />
                    <Route path="co-ceo/applications" element={<PortalApplications />} />
                    <Route path="co-ceo/profile" element={<PortalProfile />} />
                    <Route path="co-ceo/chat" element={<ChatPage />} />
                    <Route path=":segment/leave" element={<DepartmentLeave />} />
                    <Route path=":segment/leave/status" element={<DepartmentLeaveStatus />} />
                    <Route path=":segment/announcement/public-announcement" element={<PortalPublicAnnouncement />} />
                    <Route path=":segment/announcement/memo" element={<PortalMemo />} />
                  </Route>
                  <Route path="general-manager" element={<GeneralManagerLayout />}>
                    <Route index element={<GeneralManagerDashboard />} />
                    <Route path="applications" element={<PortalApplications />} />
                    <Route path="announcement/public-announcement" element={<PortalPublicAnnouncement />} />
                    <Route path="announcement/memo" element={<PortalMemo />} />
                    <Route path="profile" element={<PortalProfile />} />
                    <Route path="chat" element={<ChatPage />} />
                    <Route path="history" element={<AdminHistory variant="general-manager" />} />
                  </Route>
                </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
            </ErrorBoundary>
          </BrowserRouter>
        </ChatProvider>
      </ApplicationsProvider>
    </ActivityLogProvider>
    </ThemeProvider>
  )
}

export default App
