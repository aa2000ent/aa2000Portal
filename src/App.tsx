import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import RequirePortalAccess from './components/RequirePortalAccess'
import { ThemeProvider } from './contexts/ThemeContext'
import { ActivityLogProvider } from './contexts/ActivityLogContext'
import { ApplicationsProvider } from './contexts/ApplicationsContext'
import { ChatProvider } from './contexts/ChatContext'

const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const DashboardLayout = lazy(() => import('./layouts/DashboardLayout'))
const AdminLayout = lazy(() => import('./layouts/AdminLayout'))
const PortalLayout = lazy(() => import('./layouts/PortalLayout'))
const GeneralManagerLayout = lazy(() => import('./layouts/GeneralManagerLayout'))
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
const PortalApplications = lazy(() => import('./pages/PortalApplications'))
const PortalProfile = lazy(() => import('./pages/PortalProfile'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const GeneralManagerDashboard = lazy(() => import('./pages/general-manager/GeneralManagerDashboard'))

function PageLoader() {
  return (
    <div className="flex min-h-[200px] items-center justify-center" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--aa-slate)] border-t-[var(--aa-blue)]" />
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
                    <Route path="approvals" element={<AdminApprovals />} />
                    <Route path="history" element={<AdminHistory />} />
                    <Route path="chat" element={<ChatPage />} />
                  </Route>
                  <Route element={<PortalLayout />}>
                    <Route path="marketing" element={<Marketing />} />
                    <Route path="marketing/applications" element={<PortalApplications />} />
                    <Route path="marketing/profile" element={<PortalProfile />} />
                    <Route path="marketing/chat" element={<ChatPage />} />
                    <Route path="finance" element={<Finance />} />
                    <Route path="finance/applications" element={<PortalApplications />} />
                    <Route path="finance/profile" element={<PortalProfile />} />
                    <Route path="finance/chat" element={<ChatPage />} />
                    <Route path="engineering" element={<Engineering />} />
                    <Route path="engineering/applications" element={<PortalApplications />} />
                    <Route path="engineering/profile" element={<PortalProfile />} />
                    <Route path="engineering/chat" element={<ChatPage />} />
                  </Route>
                  <Route path="general-manager" element={<GeneralManagerLayout />}>
                    <Route index element={<GeneralManagerDashboard />} />
                    <Route path="applications" element={<PortalApplications />} />
                    <Route path="profile" element={<PortalProfile />} />
                    <Route path="chat" element={<ChatPage />} />
                    <Route path="history" element={<AdminHistory variant="general-manager" />} />
                  </Route>
                </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ChatProvider>
      </ApplicationsProvider>
    </ActivityLogProvider>
    </ThemeProvider>
  )
}

export default App
