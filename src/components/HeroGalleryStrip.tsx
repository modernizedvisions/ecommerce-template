import type { GalleryImage } from '../lib/types';

interface HeroGalleryStripProps {
  images: GalleryImage[];
  isLoading?: boolean;
}

export default function HeroGalleryStrip({ images, isLoading = false }: HeroGalleryStripProps) {
  const placeholders = [1, 2, 3, 4, 5, 6];
  const visibleImages = (images ?? []).filter((img) => !img.hidden).slice(0, 6);
  const renderedImages = visibleImages;

  return (
    <section className="w-full bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">

        <div className="flex gap-3 md:gap-4 overflow-x-auto md:overflow-visible">
          {isLoading && placeholders.map((i) => (
            <div key={`loading-${i}`} className="flex-1 min-w-[140px]">
              <div className="w-full h-44 bg-gray-100 border border-gray-200 rounded-md animate-pulse" />
            </div>
          ))}

          {!isLoading && renderedImages.length === 0 &&
            placeholders.map((i) => (
              <div key={`empty-${i}`} className="flex-1 min-w-[140px]">
                <div className="w-full h-44 bg-gray-100 border border-gray-300 rounded-md flex items-center justify-center text-gray-400 font-sans text-sm">
                  IMG
                </div>
              </div>
            ))}

          {!isLoading &&
            renderedImages.map((img) => (
              <div key={img.id} className="flex-1 min-w-[140px]">
                <div className="w-full h-44 rounded-md overflow-hidden border border-gray-200">
                  <img
                    src={img.imageUrl}
                    alt={img.title || 'Hero gallery'}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            ))}
        </div>

      </div>
    </section>
  );
}
