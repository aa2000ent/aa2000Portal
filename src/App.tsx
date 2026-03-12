import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import { ActivityLogProvider } from './contexts/ActivityLogContext'
import { ApplicationsProvider } from './contexts/ApplicationsContext'
import { ChatProvider } from './contexts/ChatContext'
import Login from './pages/Login'
import Register from './pages/Register'
import DashboardLayout from './layouts/DashboardLayout'
import AdminLayout from './layouts/AdminLayout'
import PortalLayout from './layouts/PortalLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminEmployees from './pages/admin/AdminEmployees'
import AdminProfile from './pages/admin/AdminProfile'
import AdminApplications from './pages/admin/AdminApplications'
import AdminHistory from './pages/admin/AdminHistory'
import AdminApprovals from './pages/admin/AdminApprovals'
import Marketing from './pages/Marketing'
import Finance from './pages/Finance'
import Engineering from './pages/Engineering'
import PortalApplications from './pages/PortalApplications'
import PortalProfile from './pages/PortalProfile'
import ChatPage from './pages/ChatPage'

function App() {
  return (
    <ActivityLogProvider>
      <ApplicationsProvider>
        <ChatProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route element={<DashboardLayout />}>
              <Route path="admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="employees" element={<AdminEmployees />} />
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
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </ChatProvider>
      </ApplicationsProvider>
    </ActivityLogProvider>
  )
}

export default App
