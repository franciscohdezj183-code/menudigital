import { Link } from 'react-router-dom';
import MenuImage from './MenuImage.jsx';
import { initials } from '../../utils/images.js';

export default function CategoryHeader({ business, category }) {
  const destination = `/${encodeURIComponent(business.slug)}`;
  const handleBack = event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    try { window.sessionStorage.setItem(`menu-restore-scroll:${business.slug}`, 'true'); } catch {}
  };

  return (
    <header className="category-header">
      <div className="category-hero" aria-hidden="true">
        <MenuImage className="category-hero-image" src={category.image_url} alt="" fallback={initials(category.name)} loading="eager" />
      </div>
      <div className="category-header-content">
        <div className="category-controls">
          <Link className="back-link" to={destination} aria-label="Volver al menú" onClick={handleBack}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12" /></svg>
          </Link>
          <h1>{category.name}</h1>
        </div>
        <p className="category-invitation">¿Qué se te antoja?</p>
      </div>
    </header>
  );
}
