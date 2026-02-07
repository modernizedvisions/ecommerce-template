import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SiteLayout } from './layout/SiteLayout';
import { HomePage } from './pages/HomePage';
import { ShopPage } from './pages/ShopPage';
import { GalleryPage } from './pages/GalleryPage';
import { AboutPage } from './pages/AboutPage';
import { TermsPage } from './pages/TermsPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import CustomOrdersPage from './pages/CustomOrdersPage';
import { ScrollToTop } from './components/ScrollToTop';
import { Toaster } from 'sonner';
import './index.css';

const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const CheckoutReturnPage = lazy(() => import('./pages/CheckoutReturnPage').then((m) => ({ default: m.CheckoutReturnPage })));

const RouteLoading = () => (
  <div className="min-h-[40vh] flex items-center justify-center text-sm opacity-80">
    Loading...
  </div>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<SiteLayout />}>
          <Route index element={<HomePage />} />
          <Route path="shop" element={<ShopPage />} />
          <Route path="product/:productId" element={<ProductDetailPage />} />
          <Route path="gallery" element={<GalleryPage />} />
          <Route path="custom-orders" element={<CustomOrdersPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route
            path="checkout"
            element={
              <Suspense fallback={<RouteLoading />}>
                <CheckoutPage />
              </Suspense>
            }
          />
          <Route
            path="checkout/return"
            element={
              <Suspense fallback={<RouteLoading />}>
                <CheckoutReturnPage />
              </Suspense>
            }
          />
          <Route
            path="admin"
            element={
              <Suspense fallback={<RouteLoading />}>
                <AdminPage />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
    <Toaster richColors position="top-center" />
  </StrictMode>
);
