import AuthProvider from './components/admin/AuthProvider.jsx';
import ProtectedRoute from './components/admin/ProtectedRoute.jsx';
import AdminLoginPage from './pages/AdminLoginPage.jsx';
import AdminHomePage from './pages/AdminHomePage.jsx';
import AdminMenuPage from './pages/AdminMenuPage.jsx';
import AdminCategoryFormPage from './pages/AdminCategoryFormPage.jsx';
import AdminProductFormPage from './pages/AdminProductFormPage.jsx';
import ProductDetailPage from './pages/ProductDetailPage.jsx';
import CategoryPage from './pages/CategoryPage.jsx';
import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import PublicMenuPage from './pages/PublicMenuPage.jsx';
import AdminBusinessPage from './pages/AdminBusinessPage.jsx';
import AdminPromotionsPage from './pages/AdminPromotionsPage.jsx';
import AdminPromotionFormPage from './pages/AdminPromotionFormPage.jsx';
import AdminQrPage from './pages/AdminQrPage.jsx';
import MenuError from './components/public-menu/MenuError.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/admin" element={<AuthProvider />}>
        <Route path="login" element={<AdminLoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route index element={<AdminHomePage />} />
          <Route path="menu" element={<AdminMenuPage />} />
          <Route path="menu/categorias/nueva" element={<AdminCategoryFormPage />} />
          <Route path="menu/categorias/:categoryId/editar" element={<AdminCategoryFormPage />} />
          <Route path="menu/productos/nuevo" element={<AdminProductFormPage />} />
          <Route path="menu/productos/:productId/editar" element={<AdminProductFormPage />} />
          <Route path="promociones" element={<AdminPromotionsPage />} />
          <Route path="promociones/nueva" element={<AdminPromotionFormPage />} />
          <Route path="promociones/:promotionId/editar" element={<AdminPromotionFormPage />} />
          <Route path="mi-negocio" element={<AdminBusinessPage />} />
          <Route path="qr" element={<AdminQrPage />} />
        </Route>
        <Route path="*" element={<main className="admin-shell admin-session"><h1>Página no encontrada</h1><a href="/admin">Volver al inicio</a></main>} />
      </Route>
      <Route path="/" element={<HomePage />} />
      <Route path="/:slug/categoria/:categoryId/producto/:productId" element={<ProductDetailPage />} />
      <Route path="/:slug/categoria/:categoryId" element={<CategoryPage />} />
      <Route path="/:slug" element={<PublicMenuPage />} />
      <Route path="*" element={<main className="menu-shell"><MenuError notFound /></main>} />
    </Routes>
  );
}

