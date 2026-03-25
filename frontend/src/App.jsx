import { Suspense, lazy } from 'react'
import { Toaster } from 'react-hot-toast'
import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'

const LandingPage = lazy(() => import('./pages/LandingPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const VerifyIncidentPage = lazy(() => import('./pages/VerifyIncidentPage'))
const DashboardPlaceholderPage = lazy(() => import('./pages/DashboardPlaceholderPage'))
const ReportPage = lazy(() => import('./pages/ReportPage'))
const MyReportsPage = lazy(() => import('./pages/MyReportsPage'))
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'))
const AdminTriagePage = lazy(() => import('./pages/admin/AdminTriagePage'))
const AdminRespondersPage = lazy(() => import('./pages/admin/AdminRespondersPage'))
const AdminRegistrationsPage = lazy(() => import('./pages/admin/AdminRegistrationsPage'))
const AdminIotDevicesPage = lazy(() => import('./pages/admin/AdminIotDevicesPage'))
const AdminAnalyticsPage = lazy(() => import('./pages/admin/AdminAnalyticsPage'))
const AdminAuditPage = lazy(() => import('./pages/admin/AdminAuditPage'))
const AdminNotificationsPage = lazy(() => import('./pages/admin/AdminNotificationsPage'))
const AdminSystemPage = lazy(() => import('./pages/admin/AdminSystemPage'))
const StaffDashboardPage = lazy(() => import('./pages/staff/StaffDashboardPage'))
const StaffIncidentDetailPage = lazy(() => import('./pages/staff/StaffIncidentDetailPage'))

function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-panel font-body text-navy">
        <Toaster
          position="top-right"
          gutter={12}
          containerStyle={{ top: 20, right: 20 }}
          toastOptions={{
            duration: 4000,
            className: 'admin-toast',
            success: {
              className: 'admin-toast admin-toast--success',
            },
            error: {
              className: 'admin-toast admin-toast--error',
            },
            loading: {
              className: 'admin-toast admin-toast--loading',
            },
          }}
        />
        <Suspense
          fallback={(
            <div className="flex min-h-screen items-center justify-center px-4">
              <div className="admin-surface w-full max-w-md px-6 py-10 text-center">
                <div className="admin-skeleton-block mx-auto h-14 w-14 rounded-2xl" />
                <p className="mt-5 text-sm font-semibold uppercase tracking-[0.18em] text-info">RescueLink</p>
                <p className="mt-2 text-base font-semibold text-navy">Loading workspace</p>
                <p className="mt-2 text-sm text-slate-500">Preparing the latest command center view.</p>
              </div>
            </div>
          )}
        >
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/verify/:incidentCode" element={<VerifyIncidentPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/report"
              element={
                <ProtectedRoute roles={['citizen']}>
                  <ReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-reports"
              element={
                <ProtectedRoute roles={['citizen']}>
                  <MyReportsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPlaceholderPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/responders"
              element={
                <ProtectedRoute roles={['admin']}>
                  <AdminRespondersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/registrations"
              element={
                <ProtectedRoute roles={['admin']} ability="manage-users">
                  <AdminRegistrationsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute roles={['admin']} ability="manage-incidents">
                  <AdminDashboardPage mode="dashboard" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/incidents"
              element={
                <ProtectedRoute roles={['admin']} ability="manage-incidents">
                  <AdminDashboardPage mode="incidents" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/triage"
              element={
                <ProtectedRoute roles={['admin']} ability="manage-incidents">
                  <AdminTriagePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/map"
              element={
                <ProtectedRoute roles={['admin']} ability="manage-incidents">
                  <AdminDashboardPage mode="map" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/iot-devices"
              element={
                <ProtectedRoute roles={['admin']} ability="manage-iot">
                  <AdminIotDevicesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/analytics"
              element={
                <ProtectedRoute roles={['admin']} ability="view-analytics">
                  <AdminAnalyticsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/audit"
              element={
                <ProtectedRoute roles={['admin']}>
                  <AdminAuditPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/notifications"
              element={
                <ProtectedRoute roles={['admin']} ability="broadcast-messages">
                  <AdminNotificationsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/system"
              element={
                <ProtectedRoute roles={['admin']}>
                  <AdminSystemPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff"
              element={
                <ProtectedRoute roles={['staff']}>
                  <StaffDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff/incidents/:incidentId"
              element={
                <ProtectedRoute roles={['staff']}>
                  <StaffIncidentDetailPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Suspense>
      </div>
    </AuthProvider>
  )
}

export default App
