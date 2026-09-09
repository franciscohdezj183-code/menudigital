import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../components/admin/AuthProvider.jsx';
import { AuthStatus } from '../components/admin/ProtectedRoute.jsx';
export default function AdminLoginPage() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  useEffect(() => { document.title = 'Iniciar sesión | Menú digital'; return () => { document.title = 'Menú digital'; }; }, []);
  if (['loading', 'error'].includes(auth.status)) return <AuthStatus />;
  if (auth.authenticated) return <Navigate to="/admin" replace />;
  const submit = async event => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try { await auth.login(email, password); }
    catch (err) {
      setPassword('');
      setError(err.status === 401 ? 'El correo o la contraseña no son correctos.' : err.status === 429 ? 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.' : err.status === 403 ? 'Tu cuenta no tiene acceso al panel.' : err.status === 400 ? 'Revisa el correo y la contraseña. La contraseña admite hasta 72 bytes.' : 'No pudimos iniciar sesión. Intenta nuevamente.');
    } finally { submitting.current = false; setBusy(false); }
  };
  return <main className="admin-shell admin-login">
    <div className="admin-login-card">
      <p className="admin-brand">✦ Menú digital</p>
      <h1>Administra tu negocio</h1>
      <p className="admin-muted">Tu menú, en un solo lugar.</p>
      <form onSubmit={submit} aria-busy={busy}>
        <label htmlFor="owner-email">Correo electrónico</label>
        <input id="owner-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck="false" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
        <label htmlFor="owner-password">Contraseña</label>
        <input id="owner-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
        {error && <p className="admin-error" role="alert">{error}</p>}
        <button className="admin-primary" type="submit" disabled={busy}>{busy ? 'Iniciando sesión…' : 'Iniciar sesión'}</button>
      </form>
    </div>
  </main>;
}
