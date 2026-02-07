import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSoldProducts } from '../lib/api';
import { Product } from '../lib/types';
import { useGalleryImages } from '../lib/hooks/useGalleryImages';
import { ProgressiveImage } from '../components/ui/ProgressiveImage';

export function GalleryPage() {
  const [soldProducts, setSoldProducts] = useState<Product[]>([]);
  const [isLoadingSold, setIsLoadingSold] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const { images: galleryImages, isLoading: isLoadingGallery } = useGalleryImages();
  const getSoldCardTitle = (item: Product) =>
    item.id?.startsWith('custom_order:') ? 'Custom Order' : item.name;
  const formatCategoryLabel = (value?: string | null) => {
    if (!value) return '';
    return value
      .toLowerCase()
      .split(/\s+/)
      .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : ''))
      .join(' ');
  };

  useEffect(() => {
    const loadSold = async () => {
      try {
        const sold = await fetchSoldProducts();
        setSoldProducts(sold);
      } catch (error) {
        console.error('Error loading gallery data:', error);
      } finally {
        setIsLoadingSold(false);
      }
    };
    loadSold();
  }, []);

  const isLoading = isLoadingGallery || isLoadingSold;

  return (
    <div className="py-14 bg-linen min-h-screen">
      <div className="w-full max-w-[92vw] sm:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-3 mb-8">
          <p className="text-[11px] uppercase tracking-[0.32em] text-deep-ocean/80">Gallery</p>
          <h1 className="text-4xl md:text-5xl font-serif font-semibold tracking-[0.03em] text-deep-ocean">Gallery</h1>
          <p className="text-center text-charcoal/80 text-base md:text-lg max-w-2xl mx-auto">
            Explore our collection of art pieces and studio works.
          </p>
        </div>
        <div className="flex justify-center mb-10">
          <Link
            to="/shop"
            className="inline-flex items-center justify-center rounded-shell bg-deep-ocean px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.22em] text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            Shop The Collection
          </Link>
        </div>
        <div className="mt-8"></div>

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading gallery...</p>
          </div>
        ) : (
          <>
            <section className="mb-12">
              {galleryImages.length === 0 ? (
                <div className="text-gray-500">No images yet.</div>
              ) : (
                <div className="gallery-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {galleryImages.map((item) => (
                    <div key={item.id} className="relative group cursor-pointer rounded-2xl overflow-hidden">
                      <div
                        className="aspect-[4/3] overflow-hidden rounded-2xl"
                        onClick={() => setSelectedImage(item.imageUrl)}
                      >
                        <ProgressiveImage
                          src={item.imageUrl}
                          alt={item.title || 'Gallery item'}
                          className="h-full w-full"
                          imgClassName="w-full h-full object-contain"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-center text-3xl font-semibold tracking-wide text-gray-900 uppercase mb-4">
                Sold Products
              </h2>
              {soldProducts.length > 0 && (
                <div className="sold-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {soldProducts.map((item) => (
                    <div key={item.id} className="group rounded-2xl overflow-hidden transition-all">
                      <div
                        className="relative aspect-square overflow-hidden cursor-pointer"
                        onClick={() => setSelectedImage(item.imageUrl)}
                      >
                        {item.imageUrl ? (
                          <ProgressiveImage
                            src={item.imageUrl}
                            alt={getSoldCardTitle(item)}
                            className="h-full w-full"
                            imgClassName="w-full h-full object-cover rounded-2xl"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <h3 className="text-sm font-serif font-medium text-deep-ocean truncate">
                            {getSoldCardTitle(item)}
                          </h3>
                          <span className="text-sm font-serif font-medium text-deep-ocean whitespace-nowrap">SOLD</span>
                        </div>
                        {item.collection && (
                          <p className="text-xs text-charcoal/70">{formatCategoryLabel(item.collection)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <img
            src={selectedImage}
            alt="Gallery item"
            className="max-w-full max-h-full object-contain"
            decoding="async"
          />
        </div>
      )}
    </div>
  );
}
