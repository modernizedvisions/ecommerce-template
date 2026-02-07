import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import type { HeroCollageImage } from '../lib/types';
import HeroSlideshow from './HeroSlideshow';

interface HomeHeroProps {
  heroImages?: HeroCollageImage[];
  heroRotationEnabled?: boolean;
}

export default function HomeHero({ heroImages = [], heroRotationEnabled = false }: HomeHeroProps) {
  const filteredHeroImages = useMemo(
    () =>
      (heroImages || [])
        .filter((img) => !!img?.imageUrl)
        .filter((img) => {
          const url = img?.imageUrl?.trim() || '';
          return url && !url.startsWith('blob:') && !url.startsWith('data:');
        }),
    [heroImages]
  );
  const heroImage = filteredHeroImages[0];
  const shouldRotate = heroRotationEnabled && filteredHeroImages.length > 1;

  if (import.meta.env.DEV) {
    console.debug('[HomeHero] heroImages', heroImages.length, heroImages[0] ? Object.keys(heroImages[0]) : null);
  }
  // Root cause: description text was hardcoded in this component and hero images were falling back to mock data.
  // We now remove the description block and rely solely on admin-uploaded hero images.

  return (
    <section
      id="hero"
      className="relative w-full overflow-hidden"
      style={{ backgroundColor: '#ffffff' }}
    >
      <div className="relative z-10 max-w-6xl mx-auto px-4 py-16 md:py-20">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div className="order-2 md:order-1 text-center md:text-center">
            <h1 className="hidden md:block text-[20px] sm:text-[22px] md:text-[24px] font-semibold tracking-tight text-slate-900">
              DOVER DESIGNS
            </h1>
            <p className="mt-3 max-w-lg mx-auto md:mx-auto text-base sm:text-lg text-slate-900 font-serif subtitle-text">
              Made by hand, one piece at a time - using shells, texture, and a little coastal magic. Browse what's available or reach out for a custom design.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center md:justify-center gap-3">
              <Link
                to="/shop"
                className="inline-flex items-center justify-center rounded-full rounded-ui bg-slate-900 px-5 py-2.5 text-sm font-medium font-serif text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 focus:ring-offset-white/70"
              >
                Shop New Art
              </Link>
              <Link
                to="/gallery"
                className="inline-flex items-center justify-center rounded-full rounded-ui border border-slate-300 bg-white/70 px-5 py-2.5 text-sm font-medium font-serif text-slate-900 shadow-sm transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 focus:ring-offset-white/70"
              >
                View Gallery
              </Link>
            </div>
          </div>

          <div className="order-1 md:order-2 flex justify-center md:justify-end">
            <div className="w-full max-w-[620px] aspect-[5/4] min-h-[320px] md:min-h-[420px] lg:min-h-[460px] overflow-hidden rounded-2xl bg-white/80 flex items-center justify-center">
              {shouldRotate ? (
                <HeroSlideshow
                  images={filteredHeroImages.map((img, idx) => ({
                    id: img.id || `hero-${idx}`,
                    imageUrl: img.imageUrl,
                    title: img.alt,
                  }))}
                  intervalMs={5000}
                />
              ) : heroImage ? (
                <img
                  src={heroImage.imageUrl}
                  alt={heroImage.alt || 'Featured hero'}
                  className="h-full w-full object-cover"
                  decoding="async"
                  fetchpriority="high"
                />
              ) : (
                <div className="text-slate-400 text-sm">Hero image will appear here</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
