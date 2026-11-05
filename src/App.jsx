import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import LoginForm from './components/LoginForm';
import Plataforma from './pages/Plataforma';
import CambiarPassword from './pages/auth/CambiarPassword';
import ProtectedRoute from './components/ProtectedRoute';
import TestPage from './pages/TestPage';
import { ToastProvider } from './context/ToastContext';
import { ModalProvider } from './context/ModalContext';
import { UserProvider } from './context/UserContext';
import { ThemeProvider } from './context/ThemeContext';

// La ruta principal tras iniciar sesión pasó de /dashboard a /plataforma.
// Enlaces guardados o pestañas abiertas con /dashboard se redirigen,
// conservando lo que venga después (ruta, query y hash).
export function RedirigirDashboard() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={pathname.replace(/^\/dashboard/, '/plataforma') + search + hash} replace />;
}

function App() {
  return (
    <UserProvider>
      <ThemeProvider>
        <ToastProvider>
          <ModalProvider>
            <Router>
              <Routes>
                <Route path="/" element={<LoginForm />} />
                <Route path="/cambiar-password" element={<CambiarPassword />} />
                <Route path="/test-spinner" element={<TestPage />} />
                <Route
                  path="/plataforma/*"
                  element={
                    <ProtectedRoute>
                      <Plataforma />
                    </ProtectedRoute>
                  }
                />
                <Route path="/dashboard/*" element={<RedirigirDashboard />} />
              </Routes>
            </Router>
          </ModalProvider>
        </ToastProvider>
      </ThemeProvider>
    </UserProvider>
  );
}

export default App;