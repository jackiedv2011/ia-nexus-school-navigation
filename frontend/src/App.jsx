import { Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import About from './pages/About';
import Pricing from './pages/Pricing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import VerifyCode from './pages/VerifyCode';
import ResetPassword from './pages/ResetPassword';
import ChatPage from './pages/ChatPage';
import RoutePage from './pages/RoutePage';
import SchedulePage from './pages/SchedulePage';
import TeacherDirectory from './pages/TeacherDirectory';
import ErrorBoundary from './components/ErrorBoundary';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('ia_token');
  return token ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/"                  element={<Landing />} />
        <Route path="/about"             element={<About />} />
        <Route path="/pricing"           element={<Pricing />} />
        <Route path="/login"             element={<Login />} />
        <Route path="/signup"            element={<Signup />} />
        <Route path="/forgot-password"   element={<ForgotPassword />} />
        <Route path="/verify-code"       element={<VerifyCode />} />
        <Route path="/reset-password"    element={<ResetPassword />} />
        <Route path="/app"    element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/route"  element={<ProtectedRoute><RoutePage /></ProtectedRoute>} />
        <Route path="/schedule" element={<ProtectedRoute><SchedulePage /></ProtectedRoute>} />
        <Route path="/teachers" element={<ProtectedRoute><TeacherDirectory /></ProtectedRoute>} />
        <Route path="*"       element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
