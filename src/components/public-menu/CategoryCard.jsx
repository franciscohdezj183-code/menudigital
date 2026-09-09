import { useState } from 'react';
import { Link } from 'react-router-dom';
import MenuImage from './MenuImage.jsx';
import { initials } from '../../utils/images.js';

export default function CategoryCard({ category, index, slug }) {
  const [touchShine, setTouchShine] = useState(false);
  const destination = `/${encodeURIComponent(slug)}/categoria/${encodeURIComponent(category.id)}`;

  const handlePointerDown = event => {
    if (event.pointerType === 'mouse') return;
    setTouchShine(true);
  };

  return (
    <li>
      <Link
        to={destination}
        className={`category-card${touchShine ? ' is-touch-shining' : ''}`}
        aria-labelledby={`category-${category.id}`}
        onPointerDown={handlePointerDown}
        onPointerCancel={() => setTouchShine(false)}
        onClick={() => {
          try { window.sessionStorage.setItem(`menu-scroll:${slug}`, String(window.scrollY || document.documentElement.scrollTop || 0)); } catch {}
        }}
        onAnimationEnd={() => setTouchShine(false)}
        onContextMenu={event => event.preventDefault()}
        onDragStart={event => event.preventDefault()}
      >
        <MenuImage src={category.image_url} alt="" fallback={initials(category.name)} />
        <div className="category-caption">
          <span className="category-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <h3 id={`category-${category.id}`}>{category.name}</h3>
        </div>
      </Link>
    </li>
  );
}

