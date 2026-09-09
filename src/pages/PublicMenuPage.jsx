import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicMenu } from '../services/api.js';
import BusinessHero from '../components/public-menu/BusinessHero.jsx';
import CategoryList from '../components/public-menu/CategoryList.jsx';
import MenuSkeleton from '../components/public-menu/MenuSkeleton.jsx';
import MenuError from '../components/public-menu/MenuError.jsx';
import PromotionList from '../components/public-menu/PromotionList.jsx';
import { themeStyle } from '../utils/theme.js';

function PublicMenu({ slug }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    document.title = 'Menú digital';
    setState({ status: 'loading' });
    getPublicMenu(slug, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data?.ok !== true || !data.business || !Array.isArray(data.categories)) throw new Error('Invalid response');
        setState({ status: 'success', data });
        document.title = `Menú | ${data.business.name}`;
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ status: error.status === 404 || error.status === 400 ? 'not-found' : 'error' });
      });
    return () => { controller.abort(); document.title = 'Menú digital'; };
  }, [slug, attempt]);

  useEffect(() => {
    if (state.status !== 'success') return;
    try {
      const restoreKey = `menu-restore-scroll:${slug}`;
      if (window.sessionStorage.getItem(restoreKey) !== 'true') return;
      window.sessionStorage.removeItem(restoreKey);
      const top = Number(window.sessionStorage.getItem(`menu-scroll:${slug}`)) || 0;
      document.documentElement.scrollTop = top;
      document.body.scrollTop = top;
    } catch {}
  }, [slug, state.status]);

  return (
    <main className="menu-shell public-menu-page" style={themeStyle(state.data?.business?.theme_color)} aria-busy={state.status === 'loading'}>
      {state.status === 'loading' && <MenuSkeleton />}
      {state.status === 'not-found' && <MenuError notFound />}
      {state.status === 'error' && <MenuError onRetry={() => setAttempt((value) => value + 1)} />}
      {state.status === 'success' && <>
        <BusinessHero business={state.data.business} />
        <PromotionList promotions={state.data.promotions} coverUrl={state.data.business.promotion_cover_url} />
        <CategoryList categories={state.data.categories} slug={state.data.business.slug} />
        <footer className="menu-footer"><span aria-hidden="true">✦</span> Menú digital</footer>
      </>}
    </main>
  );
}

export default function PublicMenuPage() {
  const { slug } = useParams();
  // Reiniciar la página al cambiar de empresa evita mostrar datos del slug anterior.
  return <PublicMenu key={slug} slug={slug} />;
}

