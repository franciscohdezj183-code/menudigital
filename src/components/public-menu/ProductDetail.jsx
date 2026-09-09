import { Link } from 'react-router-dom';
import MenuImage from './MenuImage.jsx';
import { initials } from '../../utils/images.js';
import { formatPrice } from '../../utils/products.js';

export default function ProductDetail({ business, category, product, variants }) {
  return <>
    <header className="detail-header">
      <Link className="detail-back" to={`/${encodeURIComponent(business.slug)}/categoria/${encodeURIComponent(category.id)}`} aria-label={`Volver a ${category.name}`}>
        <span aria-hidden="true">←</span><span>{category.name}</span>
      </Link>
      <p>{business.name}</p>
    </header>
    <MenuImage className="detail-image" src={product.image_url} alt={product.name} fallback={initials(product.name)} loading="eager" />
    <section className="detail-info" aria-labelledby="detail-title">
      <h1 id="detail-title">{product.name}</h1>
      <p className="detail-price">{variants.length > 0 && <span>Precio base </span>}{formatPrice(product.price)}</p>
      <div className="detail-labels">
        {product.featured && <span className="product-badge recommended">Recomendado</span>}
        {!product.available && <span className="detail-availability sold-out">Agotado</span>}
      </div>
      {product.description && <p className="detail-description">{product.description}</p>}
      {variants.length > 0 && <section className="detail-variants" aria-labelledby="variants-title">
        <h2 id="variants-title">Presentaciones</h2>
        <ul>{variants.map(variant => <li key={variant.id}><span>{variant.name}</span><span className="variant-price">{formatPrice(variant.price)}</span></li>)}</ul>
      </section>}
      {product.available && <p className="detail-availability available">Disponible</p>}
    </section>
    <footer className="menu-footer"><span aria-hidden="true">✦</span> Menú digital</footer>
  </>;
}
