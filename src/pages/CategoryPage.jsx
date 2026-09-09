import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPublicCategory } from '../services/api.js';
import CategoryHeader from '../components/public-menu/CategoryHeader.jsx';
import CategorySkeleton from '../components/public-menu/CategorySkeleton.jsx';
import ProductList from '../components/public-menu/ProductList.jsx';
import MenuError from '../components/public-menu/MenuError.jsx';
import { themeStyle } from '../utils/theme.js';

function Category({ slug, categoryId }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    document.title = 'Menú digital';
    document.documentElement.scrollTop = 0;
    setState({ status: 'loading' });
    getPublicCategory(slug, categoryId, { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        if (data?.ok !== true || !data.business || !data.category || !Array.isArray(data.products)) throw new Error('Invalid response');
        setState({ status: 'success', data });
        document.title = `${data.category.name} | ${data.business.name}`;
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        const status = error.code === 'CATEGORY_NOT_FOUND' ? 'category-not-found'
          : error.status === 404 || error.status === 400 ? 'menu-not-found' : 'error';
        setState({ status });
      });
    return () => { controller.abort(); document.title = 'Menú digital'; };
  }, [slug, categoryId, attempt]);

  return (
    <main className="category-page" style={themeStyle(state.data?.business?.theme_color)} aria-busy={state.status === 'loading'}>
      {state.status === 'loading' && <CategorySkeleton />}
      {state.status === 'menu-not-found' && <MenuError notFound />}
      {state.status === 'category-not-found' && <section className="menu-message category-message" role="status">
        <p className="eyebrow">Menú digital</p>
        <h1>No encontramos esta categoría.</h1>
        <p>Puede que ya no esté disponible.</p>
        <Link className="text-action" to={`/${encodeURIComponent(slug)}`}>Volver al menú</Link>
      </section>}
      {state.status === 'error' && <section className="menu-message category-message" role="status">
        <p className="eyebrow">Menú digital</p>
        <h1>No pudimos cargar esta categoría.</h1>
        <p>Intenta nuevamente en unos momentos.</p>
        <button className="retry-button" onClick={() => setAttempt(value => value + 1)}>Reintentar</button>
      </section>}
      {state.status === 'success' && <>
        <CategoryHeader business={state.data.business} category={state.data.category} />
        <div className="category-products">
          <ProductList categoryId={state.data.category.id} products={state.data.products} categoryName={state.data.category.name} slug={state.data.business.slug} />
        </div>
        <footer className="menu-footer"><span aria-hidden="true">✦</span> Menú digital</footer>
      </>}
    </main>
  );
}

export default function CategoryPage() {
  const { slug, categoryId } = useParams();
  return <Category key={`${slug}/${categoryId}`} slug={slug} categoryId={categoryId} />;
}
