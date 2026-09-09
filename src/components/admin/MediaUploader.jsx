import { useRef, useState } from 'react';
import { removeAdminImage, uploadAdminImage } from '../../services/api.js';
import { optimizedImageUrl } from '../../utils/images.js';

export default function MediaUploader({ label, target, entityId, value, onChange, onUnauthorized }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const run = async (action, successMessage, failureMessage) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await action();
      onChange(result?.media?.image_url ?? null);
      setSuccess(successMessage);
    } catch (apiError) {
      if ([401, 403].includes(apiError.status)) onUnauthorized?.();
      else setError(apiError.code === 'MEDIA_UNAVAILABLE' ? 'Configura Cloudinary para gestionar imágenes.' : failureMessage);
    } finally { setBusy(false); }
  };

  return (
    <fieldset className="media-uploader" disabled={busy}>
      <legend>{label}</legend>
      {value ? <img src={optimizedImageUrl(value, { width: 720 })} alt={`Vista previa de ${label.toLowerCase()}`} /> : <div className="media-placeholder">Sin imagen</div>}
      <div className="media-actions">
        <button type="button" className="admin-secondary" onClick={() => input.current?.click()}>{busy ? 'Procesando…' : value ? 'Cambiar imagen' : 'Subir imagen'}</button>
        {value && <button type="button" className="admin-secondary" onClick={() => run(() => removeAdminImage(target, entityId), 'Imagen eliminada.', 'No pudimos quitar la imagen. Intenta nuevamente.')}>Quitar imagen</button>}
      </div>
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) run(() => uploadAdminImage(file, target, entityId), 'Imagen actualizada.', 'No pudimos subir la imagen. Intenta nuevamente.');
        }}
      />
      <p className="admin-muted">JPG, PNG o WebP · máximo 5 MB</p>
      {success && <p className="admin-success" role="status">{success}</p>}
      {error && <p className="admin-field-error" role="alert">{error}</p>}
    </fieldset>
  );
}
