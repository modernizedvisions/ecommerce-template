import type { HeroCollageImage } from '../lib/types';

interface HeroShowcaseProps {
  image?: HeroCollageImage | null;
  isLoading?: boolean;
}

export default function HeroShowcase({ image, isLoading = false }: HeroShowcaseProps) {
  const featured = image && !image.hidden ? image : null;

  return (
    <section className="w-full bg-gray-50 py-16">
      <div className="max-w-6xl mx-auto px-4 text-center">

        {/* Increased hero image height/width by ~33% to give a taller presence */}
        <div className="w-64 h-64 mx-auto bg-white border border-gray-200 rounded-xl flex items-center justify-center overflow-hidden shadow-md">
          {isLoading ? (
            <div className="w-full h-full animate-pulse bg-gray-200" />
          ) : featured ? (
            <img
              src={featured.imageUrl}
              alt="Featured hero"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500 font-sans text-sm">
              HERO IMG
            </div>
          )}
        </div>

        <p className="mt-6 text-sm tracking-[0.25em] uppercase text-gray-700 font-sans">
          NEW ART
        </p>

      </div>
    </section>
  );
}
