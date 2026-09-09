import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from './AuthProvider.jsx';

export default function AdminNav() {
  const auth = useAuth(); const [closing, setClosing] = useState(false); const [error, setError] = useState('');
  const close = async () => { if (closing) return; setClosing(true); setError(''); try { await auth.logout(); } catch { setError('No pudimos cerrar la sesión. Intenta nuevamente.'); setClosing(false); } };
  return <><header className="admin-header">
    <NavLink className="admin-brand" to="/admin">✦ Menú digital</NavLink>
    <nav aria-label="Panel privado">
      <NavLink end to="/admin">Inicio</NavLink><NavLink to="/admin/menu">Menú</NavLink><NavLink to="/admin/promociones">Promociones</NavLink><NavLink to="/admin/mi-negocio">Mi negocio</NavLink><NavLink to="/admin/qr">Código QR</NavLink>
      <a className="admin-public-link" href={`/${encodeURIComponent(auth.business.slug)}`} target="_blank" rel="noopener noreferrer">Ver menú público <span aria-hidden="true">↗</span></a>
      <button className="admin-logout" onClick={close} disabled={closing}>{closing ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
    </nav>
  </header>{error && <p className="admin-error" role="alert">{error}</p>}</>;
}
