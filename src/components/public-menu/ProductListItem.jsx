import { Link } from 'react-router-dom';
import MenuImage from './MenuImage.jsx';
import { initials } from '../../utils/images.js';

export default function ProductListItem({ product, slug, categoryId }) {
  return (
    <li>
      <Link to={`/${encodeURIComponent(slug)}/categoria/${encodeURIComponent(categoryId)}/producto/${encodeURIComponent(product.id)}`} className={`product-row${product.available ? '' : ' is-unavailable'}`} aria-labelledby={`product-${product.id}`}>
        <MenuImage className="product-photo" src={product.image_url} alt="" fallback={initials(product.name)} />
        <div className="product-info">
          <h2 id={`product-${product.id}`}>{product.name}</h2>
          {product.description && <p className="product-description">{product.description}</p>}
          {(product.featured || !product.available) && <div className="product-bottom">
            <div className="product-badges">
              {product.featured && <span className="product-badge recommended">Recomendado</span>}
              {!product.available && <span className="product-badge sold-out">Agotado</span>}
            </div>
          </div>}
        </div>
        <span className="product-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m9 5 7 7-7 7" /></svg>
        </span>
      </Link>
    </li>
  );
}
