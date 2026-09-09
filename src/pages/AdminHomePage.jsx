import { useEffect, useState } from 'react';
import { useAuth } from '../components/admin/AuthProvider.jsx';
import AdminNav from '../components/admin/AdminNav.jsx';
import { getAdminOverview } from '../services/api.js';
import { themeStyle } from '../utils/theme.js';
const metrics = [['categories', 'Categorías'], ['products', 'Productos'], ['available_products', 'Disponibles'], ['unavailable_products', 'Agotados'], ['featured_products', 'Recomendados']];
export default function AdminHomePage() {
  const auth = useAuth();
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    document.title = `Inicio | ${auth.business.name}`;
    const controller = new AbortController();
    setState({ status: 'loading' });
    getAdminOverview({ signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      if (!data?.ok || !data.summary) throw new Error('Invalid response');
      setState({ status: 'success', data });
    }).catch(error => {
      if (controller.signal.aborted) return;
      if ([401, 403].includes(error.status)) auth.clearSession();
      else setState({ status: 'error' });
    });
    return () => { controller.abort(); document.title = 'Menú digital'; };
  }, [auth.business.name, auth.clearSession, attempt]);
  return <main className="admin-shell admin-dashboard" style={themeStyle(auth.business.theme_color)}>
    <AdminNav />
    <section className="admin-welcome"><p className="admin-eyebrow">Tu negocio</p><h1>Hola, {auth.user.name}</h1><p>{auth.business.name}</p></section>
    <section className="admin-summary" aria-labelledby="summary-title" aria-busy={state.status === 'loading'}>
      <h2 id="summary-title">Tu menú de un vistazo</h2>
      {state.status === 'loading' && <><p className="sr-only" role="status">Cargando resumen…</p><div className="admin-metrics" aria-hidden="true">{metrics.map(([key]) => <div key={key} className="admin-skeleton" />)}</div></>}
      {state.status === 'error' && <div className="admin-error" role="alert"><p>No pudimos cargar el resumen.</p><button className="admin-secondary" onClick={() => setAttempt(value => value + 1)}>Reintentar</button></div>}
      {state.status === 'success' && <dl className="admin-metrics">{metrics.map(([key, label]) => <div key={key} className={`admin-metric admin-metric-${key}`}><dt>{label}</dt><dd>{state.data.summary[key]}</dd></div>)}</dl>}
    </section>
  </main>;
}
