import { useEffect, useState } from 'react';
import AdminNav from '../components/admin/AdminNav.jsx';
import { useAuth } from '../components/admin/AuthProvider.jsx';
import { getAdminQr } from '../services/api.js';
import { createQrPng, createQrSvg, downloadDataUrl } from '../utils/qr.js';
import { themeStyle } from '../utils/theme.js';

const svgDataUrl = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

async function copyPublicUrl(value) {
  if (window.navigator.clipboard?.writeText) return window.navigator.clipboard.writeText(value);
  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  const copied = document.execCommand?.('copy');
  input.remove();
  if (!copied) throw new Error('COPY_UNAVAILABLE');
}

export default function AdminQrPage() {
  const auth = useAuth();
  const [state, setState] = useState({ status: 'loading' });
  const [qrImage, setQrImage] = useState('');
  const [feedback, setFeedback] = useState('');
  const [logoFailed, setLogoFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    document.title = 'Código QR | Menú digital';
    getAdminQr({ signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ status: 'success', qr: data.qr });
    }).catch(error => {
      if (controller.signal.aborted) return;
      if ([401, 403].includes(error.status)) auth.clearSession();
      else setState({ status: error.code === 'PUBLIC_URL_UNAVAILABLE' ? 'configuration-error' : 'error' });
    });
    return () => { controller.abort(); document.title = 'Menú digital'; };
  }, []);

  useEffect(() => {
    if (state.status !== 'success') return;
    let active = true;
    setQrImage('');
    setLogoFailed(false);
    createQrSvg(state.qr.public_url)
      .then(svg => { if (active) setQrImage(svgDataUrl(svg)); })
      .catch(() => { if (active) setState({ status: 'error' }); });
    return () => { active = false; };
  }, [state.status, state.qr?.public_url, state.qr?.logo_url, state.qr?.theme_color]);

  const copy = async () => {
    setFeedback('');
    try { await copyPublicUrl(state.qr.public_url); setFeedback('Enlace copiado.'); }
    catch { setFeedback('No pudimos copiar el enlace.'); }
  };

  const download = async () => {
    if (downloading) return;
    setDownloading(true); setFeedback('');
    try {
      const logo = logoFailed ? null : state.qr.logo_url;
      const result = await createQrPng(state.qr.public_url, logo);
      downloadDataUrl(result.dataUrl, `qr-${state.qr.slug}.png`);
      setFeedback(logo && !result.logoIncluded ? 'QR descargado. No pudimos incluir el logo, pero el código sigue siendo válido.' : 'QR descargado.');
      if (logo && !result.logoIncluded) setLogoFailed(true);
    } catch { setFeedback('No pudimos preparar la descarga. Intenta nuevamente.'); }
    finally { setDownloading(false); }
  };

  return (
    <main className="admin-shell admin-dashboard admin-qr-page" style={themeStyle(state.qr?.theme_color ?? auth.business.theme_color)}>
      <AdminNav />
      <section className="admin-page-title">
        <p className="admin-eyebrow">Código QR</p>
        <h1>Tu menú está listo para compartir.</h1>
        <p>Coloca este código en tus mesas para que tus clientes consulten el menú.</p>
      </section>
      {state.status === 'loading' && <div className="admin-skeleton qr-skeleton" aria-label="Preparando código QR" />}
      {state.status === 'configuration-error' && <div className="admin-error" role="alert"><strong>No se ha configurado la URL pública del menú.</strong><br />Configura PUBLIC_SITE_URL antes de imprimir el código QR.</div>}
      {state.status === 'error' && <p className="admin-error" role="alert">No pudimos preparar el código QR. Intenta nuevamente.</p>}
      {state.status === 'success' && <div className="qr-admin-layout">
        <section className="qr-preview-panel" aria-label="Vista previa del código QR">
          <div className="qr-print-preview">
            <strong>{state.qr.business_name}</strong>
            <div className="qr-code-surface">
              {qrImage ? <img className="qr-code-image" src={qrImage} alt={`Código QR del menú de ${state.qr.business_name}`} /> : <div className="admin-skeleton qr-code-loading" aria-label="Generando código QR" />}
              {state.qr.logo_url && !logoFailed && <span className="qr-center-logo"><img src={state.qr.logo_url} crossOrigin="anonymous" alt="" onError={() => setLogoFailed(true)} /></span>}
            </div>
            <span>Escanea para ver nuestro menú</span>
          </div>
        </section>
        <section className="qr-share-panel">
          <h2>Enlace público</h2>
          <p className="qr-public-url">{state.qr.public_url}</p>
          {state.qr.is_local_url && <div className="qr-local-warning" role="status"><strong>Este código QR es solo para pruebas en tu red local.</strong><span>Configura la URL pública antes de imprimirlo.</span></div>}
          {logoFailed && <p className="admin-muted">No pudimos incluir el logo, pero el código QR sigue siendo válido.</p>}
          {feedback && <p className="admin-success" role="status">{feedback}</p>}
          <div className="qr-actions">
            <button type="button" className="admin-secondary" onClick={copy}>Copiar enlace</button>
            <a className="admin-secondary" href={state.qr.public_url} target="_blank" rel="noopener noreferrer">Ver menú <span aria-hidden="true">↗</span></a>
            <button type="button" className="admin-primary" onClick={download} disabled={downloading || !qrImage}>{downloading ? 'Preparando PNG…' : 'Descargar PNG'}</button>
          </div>
          <div className="qr-before-print"><h2>Antes de imprimir</h2><ol><li>Escanea el código con tu celular.</li><li>Confirma que abre tu menú.</li><li>Después puedes imprimirlo.</li></ol></div>
        </section>
      </div>}
    </main>
  );
}
