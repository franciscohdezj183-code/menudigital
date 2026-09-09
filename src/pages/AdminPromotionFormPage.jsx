import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AdminNav from '../components/admin/AdminNav.jsx';
import MediaUploader from '../components/admin/MediaUploader.jsx';
import { useAuth } from '../components/admin/AuthProvider.jsx';
import { createAdminPromotion, getAdminPromotion, updateAdminPromotion } from '../services/api.js';
import { themeStyle } from '../utils/theme.js';

const localValue = value => {
  if (!value) return '';
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};
const instant = value => value ? new Date(value).toISOString() : null;

export default function AdminPromotionFormPage() {
  const { promotionId } = useParams();
  const editing = Boolean(promotionId);
  const auth = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', description: '', price: '', starts_at: '', ends_at: '', active: true, image_url: null });
  const change = (key, value) => setForm(current => ({ ...current, [key]: value }));

  useEffect(() => {
    document.title = `${editing ? 'Editar' : 'Nueva'} promoción | Menú digital`;
    if (editing) {
      setLoading(true);
      getAdminPromotion(promotionId)
      .then(data => {
        setForm({ ...data.promotion, price: data.promotion.price ?? '', starts_at: localValue(data.promotion.starts_at), ends_at: localValue(data.promotion.ends_at) });
        setLoading(false);
      })
      .catch(apiError => {
        if ([401, 403].includes(apiError.status)) auth.clearSession();
        else setError('No pudimos cargar la promoción.');
        setLoading(false);
      });
    }
    return () => { document.title = 'Menú digital'; };
  }, [promotionId]);

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = {
        title: form.title,
        description: form.description || null,
        price: form.price || null,
        starts_at: instant(form.starts_at),
        ends_at: instant(form.ends_at),
        active: form.active,
      };
      if (editing) {
        await updateAdminPromotion(promotionId, body);
        navigate('/admin/promociones?saved=1');
      } else {
        const data = await createAdminPromotion(body);
        navigate(`/admin/promociones/${encodeURIComponent(data.promotion.id)}/editar?created=1`);
      }
    } catch (apiError) {
      if ([401, 403].includes(apiError.status)) auth.clearSession();
      else setError('No pudimos guardar la promoción. Revisa fechas y datos.');
    } finally { setBusy(false); }
  };

  return (
    <main className="admin-shell admin-dashboard" style={themeStyle(auth.business.theme_color)}>
      <AdminNav />
      <section className="admin-form-page">
        <Link className="admin-back" to="/admin/promociones">← Volver a Promociones</Link>
        <h1>{editing ? 'Editar promoción' : 'Nueva promoción'}</h1>
        {loading ? <div className="admin-skeleton" /> : <>
          <form onSubmit={submit}>
            <label>Título<input required maxLength="160" value={form.title} onChange={event => change('title', event.target.value)} /></label>
            <label>Descripción<textarea rows="5" maxLength="1000" value={form.description ?? ''} onChange={event => change('description', event.target.value)} /></label>
            <label>Precio promocional <span>(opcional)</span><input inputMode="decimal" value={form.price} onChange={event => change('price', event.target.value)} /></label>
            <div className="date-grid">
              <label>Inicio<input type="datetime-local" value={form.starts_at} onChange={event => change('starts_at', event.target.value)} /></label>
              <label>Fin<input type="datetime-local" value={form.ends_at} onChange={event => change('ends_at', event.target.value)} /></label>
            </div>
            <label className="admin-toggle"><input type="checkbox" checked={form.active} onChange={event => change('active', event.target.checked)} /><span>Promoción activa</span></label>
            {error && <p className="admin-error">{error}</p>}
            {!editing && <p className="admin-muted">Después de crear la promoción podrás subir su imagen.</p>}
            <button className="admin-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar promoción'}</button>
          </form>
          {editing && <MediaUploader label="Imagen de promoción" target="promotion" entityId={promotionId} value={form.image_url} onChange={value => change('image_url', value)} onUnauthorized={auth.clearSession} />}
        </>}
      </section>
    </main>
  );
}
