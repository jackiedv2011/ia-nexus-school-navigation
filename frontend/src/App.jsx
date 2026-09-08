import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import About from './pages/About';
import Pricing from './pages/Pricing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import VerifyCode from './pages/VerifyCode';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import ChatPage from './pages/ChatPage';
import RoutePage from './pages/RoutePage';
import SchedulePage from './pages/SchedulePage';
import TeacherDirectory from './pages/TeacherDirectory';
import Admin from './pages/Admin';
import ErrorBoundary from './components/ErrorBoundary';
import { readStored } from './lib/storage';

// The 3D model pulls in three.js, which is far larger than the rest of the app
// put together. Splitting it out keeps that weight off the chat and the Route
// Finder — it only downloads once someone opens /model.
const ModelPage = lazy(() => import('./pages/ModelPage'));

function ProtectedRoute({ children }) {
  const token = readStored('ia_token');
  return token ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/"                  element={<ChatPage />} />
        <Route path="/home"              element={<Landing />} />
        <Route path="/about"             element={<About />} />
        <Route path="/pricing"           element={<Pricing />} />
        <Route path="/login"             element={<Login />} />
        <Route path="/signup"            element={<Signup />} />
        <Route path="/forgot-password"   element={<ForgotPassword />} />
        <Route path="/verify-code"       element={<VerifyCode />} />
        <Route path="/reset-password"    element={<ResetPassword />} />
        <Route path="/verify-email"      element={<VerifyEmail />} />
        <Route path="/app"    element={<Navigate to="/" replace />} />
        {/* Route Finder is open to everyone — no account needed */}
        <Route path="/route"  element={<RoutePage />} />
        {/* The 3D building model is open to everyone, same as the Route Finder */}
        <Route
          path="/model"
          element={(
            <Suspense fallback={null}>
              <ModelPage />
            </Suspense>
          )}
        />
        <Route path="/schedule" element={<ProtectedRoute><SchedulePage /></ProtectedRoute>} />
        <Route path="/teachers" element={<ProtectedRoute><TeacherDirectory /></ProtectedRoute>} />
        {/* Not a ProtectedRoute: the admin dashboard is gated by ADMIN_KEY, a
            single shared secret sent per-request, not by a user session. The
            page prompts for it; every endpoint behind it re-checks it. */}
        <Route path="/admin" element={<Admin />} />
        <Route path="*"       element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
