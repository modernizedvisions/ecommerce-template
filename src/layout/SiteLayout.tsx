import { Outlet, Link, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Menu, X, Instagram } from 'lucide-react';
import { CartIcon } from '../components/cart/CartIcon';
import { CartDrawer } from '../components/cart/CartDrawer';
import { useUIStore } from '../store/uiStore';
import { PromotionProvider, usePromotions } from '../lib/promotions';

export function SiteLayout() {
  return (
    <PromotionProvider>
      <SiteLayoutInner />
    </PromotionProvider>
  );
}

function SiteLayoutInner() {
  const openCartOnLoad = useUIStore((state) => state.openCartOnLoad);
  const setOpenCartOnLoad = useUIStore((state) => state.setOpenCartOnLoad);
  const setCartDrawerOpen = useUIStore((state) => state.setCartDrawerOpen);
  const [isNavDrawerOpen, setNavDrawerOpen] = useState(false);
  const [isNavDrawerVisible, setNavDrawerVisible] = useState(false);
  const [isNavDrawerActive, setNavDrawerActive] = useState(false);
  const location = useLocation();
  const { promotion } = usePromotions();
  const showPromoBanner = !!promotion?.bannerEnabled && !!promotion?.bannerText?.trim();

  const navLinks = useMemo(
    () => [
      { to: '/', label: 'Home' },
      { to: '/shop', label: 'Shop' },
      { to: '/gallery', label: 'Gallery' },
      { to: '/custom-orders', label: 'Custom Orders' },
      { to: '/about', label: 'About' },
    ],
    []
  );

  useEffect(() => {
    if (openCartOnLoad) {
      setCartDrawerOpen(true);
      setOpenCartOnLoad(false);
    }
  }, [openCartOnLoad, setCartDrawerOpen, setOpenCartOnLoad]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNavDrawerOpen(false);
      }
    };
    if (isNavDrawerOpen) {
      document.addEventListener('keydown', onKeyDown);
    }
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isNavDrawerOpen]);

  useEffect(() => {
    setNavDrawerOpen(false);
  }, [location]);

  useEffect(() => {
    if (isNavDrawerOpen) {
      setNavDrawerVisible(true);
      const raf = requestAnimationFrame(() => setNavDrawerActive(true));
      return () => cancelAnimationFrame(raf);
    }
    if (isNavDrawerVisible) {
      setNavDrawerActive(false);
      const timeout = window.setTimeout(() => setNavDrawerVisible(false), 260);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [isNavDrawerOpen, isNavDrawerVisible]);

  return (
    <div className="min-h-screen flex flex-col bg-linen">
      <header className="bg-linen/90 backdrop-blur border-b border-driftwood/70 sticky top-0 z-30 shadow-sm">
        {showPromoBanner && (
          <div className="bg-sea-glass/25 text-deep-ocean text-sm font-semibold text-center py-2 px-4 tracking-wide border-b border-driftwood/60">
            {promotion?.bannerText}
          </div>
        )}
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button
                type="button"
                className="md:hidden p-2 rounded-shell hover:bg-sand/70 transition-colors border border-driftwood/70 bg-white/80"
                aria-label="Open navigation menu"
                onClick={() => setNavDrawerOpen(true)}
              >
                <Menu className="h-6 w-6 text-deep-ocean" />
              </button>
              <Link
                to="/"
                className="text-2xl font-serif tracking-[0.08em] text-deep-ocean flex-1 text-center md:text-left truncate whitespace-nowrap inline-flex items-center gap-2 max-md:flex-row max-md:items-center max-md:justify-center"
              >
                <img src="/logo.jpg" alt="Dover Designs logo" className="h-8 w-auto object-contain md:mr-1" />
                <span className="md:hidden inline-block text-center">Dover Designs</span>
                <span className="hidden md:inline">Dover Designs</span>
              </Link>
            </div>
            <div className="hidden md:flex items-center gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="text-xs font-semibold text-deep-ocean hover:text-charcoal transition-colors uppercase tracking-[0.24em] px-2 py-1 mx-1"
                >
                  {link.label}
                </Link>
              ))}
              <CartIcon />
            </div>
            <div className="md:hidden">
              <CartIcon />
            </div>
          </div>
        </nav>
      </header>

      {isNavDrawerVisible && (
        <>
          <div
            className={`fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-40 drawer-overlay motion-safe-only ${isNavDrawerActive ? 'is-open' : 'is-closed'}`}
            onClick={() => setNavDrawerOpen(false)}
          />
          <div className={`fixed left-0 top-0 h-full w-full max-w-xs bg-linen shadow-xl z-50 flex flex-col menu-panel motion-safe-only ${isNavDrawerActive ? 'is-open' : 'is-closed'}`}>
            <div className="p-4 border-b border-driftwood/70 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-deep-ocean uppercase tracking-[0.08em]">Menu</h2>
              <button
                type="button"
                className="p-2 rounded-shell hover:bg-sand/70 transition-colors border border-driftwood/70 bg-white/80"
                aria-label="Close navigation menu"
                onClick={() => setNavDrawerOpen(false)}
              >
                <X className="h-5 w-5 text-deep-ocean" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-4 space-y-2">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setNavDrawerOpen(false)}
                  className="block px-3 py-3 text-sm font-semibold text-deep-ocean hover:bg-sand/70 transition-colors uppercase tracking-[0.2em]"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </>
      )}

      <main className="flex-1 bg-linen">
        <Outlet />
      </main>

      <footer className="bg-charcoal border-t border-driftwood/50 py-8 text-linen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex items-center gap-3 text-linen/80">
              <a
                href="https://www.instagram.com/dover_designs/"
                target="_blank"
                rel="noreferrer"
                aria-label="Visit Dover Designs on Instagram"
                className="p-2 rounded-full border border-linen/30 hover:border-gold-accent hover:text-gold-accent transition-colors"
              >
                <Instagram className="h-5 w-5" />
              </a>
              <a
                href="https://www.tiktok.com/@doverdesign"
                target="_blank"
                rel="noreferrer"
                aria-label="Visit Dover Designs on TikTok"
                className="p-2 rounded-full border border-linen/30 hover:border-gold-accent hover:text-gold-accent transition-colors"
              >
                <TikTokIcon className="h-5 w-5" />
              </a>
            </div>
            <div className="flex items-center gap-4 text-sm font-serif text-linen/80">
              <Link to="/terms" className="hover:text-linen transition-colors">
                Terms
              </Link>
              <Link to="/privacy" className="hover:text-linen transition-colors">
                Privacy
              </Link>
            </div>
            <p className="text-sm font-serif text-linen/80">
              &copy; 2026 Dover Designs. All rights reserved.
            </p>
            <p className="text-sm font-serif text-linen/80">
              Built By{' '}
              <a
                href="https://modernizedvisions.agency"
                className="underline decoration-1 underline-offset-2 hover:text-gold-accent transition-colors"
              >
                Modernized Visions
              </a>
            </p>
          </div>
        </div>
      </footer>

      <CartDrawer />
    </div>
  );
}

function TikTokIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 8.27c-1.18-.24-2.26-.75-3.2-1.5a6.43 6.43 0 0 1-1.01-1.06c-.15-.21-.29-.43-.42-.66v8.07a5.72 5.72 0 0 1-1.13 3.4c-.88 1.19-2.13 1.98-3.57 2.21a5.64 5.64 0 0 1-3.48-.54A5.18 5.18 0 0 1 5.4 14.8c.02-1.33.55-2.58 1.52-3.53a5.34 5.34 0 0 1 5.77-1.16v2.61c-.38-.25-.82-.39-1.27-.4a2.2 2.2 0 0 0-2.25 2.25c0 .6.23 1.18.65 1.6a2.22 2.22 0 0 0 2.31.53c.38-.14.72-.38 1-.69.47-.54.73-1.24.73-1.96V3h2.4c.08.36.2.72.35 1.06.22.49.5.95.84 1.38.51.66 1.17 1.2 1.92 1.57.57.29 1.18.48 1.81.55V8.27Z" />
    </svg>
  );
}
