export default function MenuError({ notFound = false, onRetry }) {
  return (
    <section className="menu-message" role="status">
      <span className="message-mark" aria-hidden="true">m.</span>
      <p className="eyebrow">Menú digital</p>
      <h1>{notFound ? 'No encontramos este menú.' : 'No pudimos cargar el menú.'}</h1>
      <p>{notFound ? 'Verifica que el código QR o enlace sea correcto.' : 'Intenta nuevamente en unos momentos.'}</p>
      {!notFound && onRetry && <button className="retry-button" onClick={onRetry}>Reintentar</button>}
    </section>
  );
}
