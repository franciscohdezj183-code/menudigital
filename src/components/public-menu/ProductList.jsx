import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ProductSearch from './ProductSearch.jsx';
import ProductListItem from './ProductListItem.jsx';
import { filterProducts } from '../../utils/products.js';

export default function ProductList({ products, categoryName, slug, categoryId }) {
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);
  const visibleProducts = filterProducts(products, search);
  const clearSearch = () => { setSearch(''); inputRef.current?.focus(); };

  if (!products.length) return (
    <section className="category-empty" role="status">
      <h2>Aún no hay productos en esta categoría.</h2>
      <p>Vuelve al menú para explorar otras opciones.</p>
      <Link className="text-action" to={`/${encodeURIComponent(slug)}`}>Volver al menú</Link>
    </section>
  );

  return (
    <section aria-label={`Productos de ${categoryName}`}>
      <ProductSearch value={search} onChange={setSearch} onClear={clearSearch} categoryName={categoryName} inputRef={inputRef} />
      <p className="product-count" role="status">{visibleProducts.length} {visibleProducts.length === 1 ? 'producto' : 'productos'}</p>
      {visibleProducts.length ? <ul className="product-list">{visibleProducts.map(product => <ProductListItem key={product.id} product={product} slug={slug} categoryId={categoryId} />)}</ul> :
        <div className="category-empty" role="status">
          <h2>No encontramos productos con esa búsqueda.</h2>
          <button className="text-action" type="button" onClick={clearSearch}>Limpiar búsqueda</button>
        </div>}
    </section>
  );
}
