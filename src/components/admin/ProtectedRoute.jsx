import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider.jsx';
export function AuthStatus() {
  const auth = useAuth();
  if (auth.status === 'error') return <main className="admin-shell admin-session"><h1>No pudimos comprobar tu sesión.</h1><p>Intenta nuevamente en unos momentos.</p><button className="admin-primary" onClick={auth.refreshSession}>Reintentar</button></main>;
  return <main className="admin-shell admin-session" aria-busy="true"><p role="status">Comprobando sesión…</p><div className="admin-skeleton" aria-hidden="true" /></main>;
}
export default function ProtectedRoute() {
  const auth = useAuth();
  if (['loading', 'error'].includes(auth.status)) return <AuthStatus />;
  return auth.authenticated ? <Outlet /> : <Navigate to="/admin/login" replace />;
}
