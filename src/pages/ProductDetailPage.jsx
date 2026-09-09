import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPublicProduct } from '../services/api.js';
import ProductDetail from '../components/public-menu/ProductDetail.jsx';
import ProductDetailSkeleton from '../components/public-menu/ProductDetailSkeleton.jsx';
import MenuError from '../components/public-menu/MenuError.jsx';
import { themeStyle } from '../utils/theme.js';

function ProductPage({ slug, categoryId, productId }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    document.title = 'Menú digital';
    document.documentElement.scrollTop = 0;
    setState({ status: 'loading' });
    getPublicProduct(slug, categoryId, productId, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      if (data?.ok !== true || !data.business || !data.category || !data.product || !Array.isArray(data.variants)) throw new Error('Invalid response');
      setState({ status: 'success', data });
      document.title = `${data.product.name} | ${data.business.name}`;
    }).catch(error => {
      if (controller.signal.aborted) return;
      const status = error.code === 'PRODUCT_NOT_FOUND' ? 'product-not-found'
        : error.code === 'CATEGORY_NOT_FOUND' ? 'category-not-found'
        : error.status === 404 || error.status === 400 ? 'menu-not-found' : 'error';
      setState({ status });
    });
    return () => { controller.abort(); document.title = 'Menú digital'; };
  }, [slug, categoryId, productId, attempt]);
  const productMissing = state.status === 'product-not-found';
  return <main className="detail-page" style={themeStyle(state.data?.business?.theme_color)} aria-busy={state.status === 'loading'}>
    {state.status === 'loading' && <ProductDetailSkeleton />}
    {state.status === 'success' && <ProductDetail {...state.data} />}
    {state.status === 'menu-not-found' && <MenuError notFound />}
    {(productMissing || state.status === 'category-not-found') && <section className="menu-message category-message" role="status">
      <p className="eyebrow">Menú digital</p>
      <h1>{productMissing ? 'No encontramos este producto.' : 'No encontramos esta categoría.'}</h1>
      <p>{productMissing ? 'Puede que ya no esté disponible en el menú.' : 'Puede que ya no esté disponible.'}</p>
      <Link className="text-action" to={productMissing ? `/${encodeURIComponent(slug)}/categoria/${encodeURIComponent(categoryId)}` : `/${encodeURIComponent(slug)}`}>
        {productMissing ? 'Volver a la categoría' : 'Volver al menú'}
      </Link>
    </section>}
    {state.status === 'error' && <section className="menu-message category-message" role="status">
      <p className="eyebrow">Menú digital</p><h1>No pudimos cargar este producto.</h1>
      <p>Intenta nuevamente en unos momentos.</p>
      <button className="retry-button" onClick={() => setAttempt(value => value + 1)}>Reintentar</button>
    </section>}
  </main>;
}
export default function ProductDetailPage() {
  const { slug, categoryId, productId } = useParams();
  return <ProductPage key={`${slug}/${categoryId}/${productId}`} slug={slug} categoryId={categoryId} productId={productId} />;
}
