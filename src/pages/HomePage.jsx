import { useEffect } from 'react';

export default function HomePage() {
  useEffect(() => { document.title = 'Menú digital'; }, []);
  return (
    <main className="home-page">
      <span className="home-mark" aria-hidden="true">m.</span>
      <p className="eyebrow">Bienvenido a la mesa</p>
      <h1>Menú digital</h1>
      <p>Accede utilizando el código QR del establecimiento.</p>
    </main>
  );
}
