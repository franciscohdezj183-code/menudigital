import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminNav from '../components/admin/AdminNav.jsx';
import MediaUploader from '../components/admin/MediaUploader.jsx';
import MenuImage from '../components/public-menu/MenuImage.jsx';
import { useAuth } from '../components/admin/AuthProvider.jsx';
import { getAdminPromotions, reorderAdminPromotions, updateAdminPromotion } from '../services/api.js';
import { formatPrice } from '../utils/products.js';
import { initials } from '../utils/images.js';
import { themeStyle } from '../utils/theme.js';

export function promotionStatus(item, now = new Date()) {
  if (!item.active) return 'Inactiva';
  if (item.starts_at && new Date(item.starts_at) > now) return 'Programada';
  if (item.ends_at && new Date(item.ends_at) < now) return 'Finalizada';
  return 'Activa';
}

export default function AdminPromotionsPage() {
  const auth = useAuth();
  const [items, setItems] = useState([]);
  const [cover, setCover] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Promociones | Menú digital';
    getAdminPromotions()
      .then(data => { setItems(data.promotions); setCover(data.promotion_cover_url ?? null); setLoading(false); })
      .catch(apiError => {
        if ([401, 403].includes(apiError.status)) auth.clearSession();
        else setError('No pudimos cargar las promociones.');
        setLoading(false);
      });
    return () => { document.title = 'Menú digital'; };
  }, []);

  const toggle = async item => {
    try {
      const data = await updateAdminPromotion(item.id, { active: !item.active });
      setItems(current => current.map(value => value.id === item.id ? data.promotion : value));
    } catch { setError('No pudimos cambiar el estado.'); }
  };

  const move = async (index, direction) => {
    const other = index + direction;
    if (other < 0 || other >= items.length) return;
    const next = [...items];
    [next[index], next[other]] = [next[other], next[index]];
    try {
      await reorderAdminPromotions(next.map(item => item.id));
      setItems(next);
    } catch { setError('No pudimos cambiar el orden.'); }
  };

  return (
    <main className="admin-shell admin-dashboard" style={themeStyle(auth.business.theme_color)}>
      <AdminNav />
      <section className="admin-list-page">
        <div className="admin-section-bar">
          <div><p className="admin-eyebrow">Contenido destacado</p><h1>Promociones</h1></div>
          <Link className="admin-primary" to="/admin/promociones/nueva">Nueva promoción</Link>
        </div>
        {error && <p className="admin-error">{error}</p>}
        {loading ? <div className="admin-skeleton" /> : <>
          <MediaUploader label="Portada del carrusel de promociones" target="promotion_cover" value={cover} onChange={setCover} onUnauthorized={auth.clearSession} />
          {!items.length ? (
          <div className="admin-empty">Todavía no hay promociones.<br /><Link to="/admin/promociones/nueva">Crear la primera</Link></div>
        ) : (
          <ul className="admin-list admin-promotion-list">
            {items.map((item, index) => (
              <li className="admin-list-item admin-promotion-item" key={item.id}>
                <MenuImage className="admin-promotion-thumb" src={item.image_url} alt="" fallback={initials(item.title)} width={160} />
                <div className="admin-item-main">
                  <strong>{item.title}</strong>
                  <p>{item.price != null && <>{formatPrice(item.price)} · </>}{promotionStatus(item)}</p>
                </div>
                <div className="admin-item-actions">
                  <button disabled={!index} onClick={() => move(index, -1)} aria-label={`Subir ${item.title}`}>↑</button>
                  <button disabled={index === items.length - 1} onClick={() => move(index, 1)} aria-label={`Bajar ${item.title}`}>↓</button>
                  <button onClick={() => toggle(item)}>{item.active ? 'Ocultar' : 'Activar'}</button>
                  <Link to={`/admin/promociones/${item.id}/editar`}>Editar</Link>
                </div>
              </li>
            ))}
          </ul>
          )}
        </>}
      </section>
    </main>
  );
}
