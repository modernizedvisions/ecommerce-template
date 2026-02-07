import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { fetchCustomOrderExamples } from '../lib/api';
import type { CustomOrderExample } from '../lib/api';
import { ContactForm } from '../components/ContactForm';

const skeletonExamples = Array.from({ length: 6 });

export default function CustomOrdersPage() {
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  const [selectedItem, setSelectedItem] = useState<CustomOrderExample | null>(null);
  const contactBg = '#E6DFD4';
  const [examples, setExamples] = useState<CustomOrderExample[]>([]);
  const [isLoadingExamples, setIsLoadingExamples] = useState(true);
  const [examplesError, setExamplesError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadExamples = async () => {
      try {
        setIsLoadingExamples(true);
        const data = await fetchCustomOrderExamples();
        if (!isMounted) return;
        setExamples(Array.isArray(data) ? data : []);
        setExamplesError(null);
      } catch (_err) {
        if (!isMounted) return;
        setExamples([]);
        setExamplesError('Examples are loading soon.');
      } finally {
        if (isMounted) setIsLoadingExamples(false);
      }
    };
    void loadExamples();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleScrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleScrollToGallery = () => {
    galleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleRequestFromModal = () => {
    setSelectedItem(null);
    handleScrollToForm();
  };

  return (
    <main className="w-full bg-linen text-charcoal relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 shell-pattern opacity-60" />
      <section className="px-4 relative">
        <div className="section-shell mx-auto w-full max-w-[92vw] sm:max-w-6xl py-12 md:py-16">
          <div className="dd-card-shell bg-white p-8 sm:p-12 space-y-6 max-w-4xl mx-auto text-center rounded-shell-lg shadow-2xl border border-driftwood/70">
            <div className="space-y-3">
              <p className="section-eyebrow">Made with intention</p>
              <h1 className="section-heading">Custom Orders</h1>
              <p className="section-subtext">
                Thoughtfully created, just for you. I'll share a proof before finishing so everything feels just right.
              </p>
            </div>
            <div className="pt-1 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <button
                type="button"
                onClick={handleScrollToForm}
                className="lux-button w-full sm:w-auto justify-center"
              >
                Start Your Request
              </button>
              <button
                type="button"
                onClick={handleScrollToGallery}
                className="lux-button--ghost w-full sm:w-auto justify-center"
              >
                Browse Past Customs
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4">
        <div ref={galleryRef} className="section-shell mx-auto w-full max-w-[92vw] sm:max-w-6xl py-12 md:py-16 md:pt-10">
          <div className="section-shell mx-auto max-w-2xl text-center space-y-3">
            <p className="section-eyebrow">PREVIOUS WORK</p>
            <h2 className="section-heading">Past Custom Pieces</h2>
          </div>

          {examplesError && (
            <p className="mt-4 text-center text-xs text-slate-500">{examplesError}</p>
          )}

          {isLoadingExamples ? (
            <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 items-start">
              {skeletonExamples.map((_, idx) => (
                <div key={`example-skeleton-${idx}`} className="space-y-3">
                  <div className="aspect-[4/5] sm:aspect-square rounded-shell-lg bg-stone animate-pulse" />
                  <div className="h-4 rounded bg-stone animate-pulse" />
                  <div className="h-3 rounded bg-stone animate-pulse" />
                </div>
              ))}
            </div>
          ) : examples.length ? (
            <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 items-start">
              {examples.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedItem(item)}
                  className="text-left w-full flex flex-col items-stretch"
                >
                  <div className="relative w-full flex-none overflow-hidden rounded-shell-lg bg-white/85 border border-driftwood/50 lux-shadow aspect-[4/5] sm:aspect-square">
                    <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                  <div className="mt-3 space-y-1">
                    <h3 className="font-semibold font-serif text-deep-ocean line-clamp-1 min-h-[1.75rem]">
                      {item.title}
                    </h3>
                    <p className="text-sm text-charcoal/80 leading-6 line-clamp-3">
                      {item.description}
                    </p>
                    <div className="mt-2 min-h-[34px] flex flex-wrap gap-2">
                      {item.tags?.length ? (
                        item.tags.map((tag) => (
                          <span
                            key={`${item.id}-${tag}`}
                            className="lux-chip"
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="lux-chip opacity-0" aria-hidden="true">
                          placeholder
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-8 text-center text-sm text-charcoal/70">Examples coming soon.</div>
          )}
        </div>
      </section>

      <section id="contact" className="relative py-16 sm:py-20" style={{ backgroundColor: contactBg }}>
        <div className="absolute inset-0" aria-hidden="true" />
        <div ref={formRef} className="relative w-full max-w-[92vw] sm:max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="space-y-8">
            <div className="space-y-3 max-w-3xl">
              <p className="lux-eyebrow">Contact</p>
              <h2 className="text-3xl sm:text-4xl font-serif tracking-[0.03em] text-deep-ocean">Send me a message</h2>
              <p className="lux-subtitle">
                Tell me about your space, palette, or the story you want a shell to hold.
              </p>
            </div>
            <div className="mt-10 lux-card bg-white">
              <div className="flex justify-center">
                <div className="p-6 sm:p-8 bg-white w-full max-w-4xl dd-form-serif">
                  <ContactForm backgroundColor="transparent" variant="embedded" defaultInquiryType="custom_order" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/70 backdrop-blur-sm p-4"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="relative w-full max-w-4xl rounded-shell-lg bg-white/95 shadow-2xl border border-driftwood/70"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedItem(null)}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm hover:bg-sand"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-slate-700" />
            </button>
            <div className="grid gap-6 p-6 md:grid-cols-2 md:p-8">
              <div className="rounded-shell-lg bg-linen p-4 border border-driftwood/50">
                <div className="relative aspect-[4/5] sm:aspect-square">
                  <img
                    src={selectedItem.imageUrl}
                    alt={selectedItem.title}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                </div>
              </div>
              <div className="flex flex-col">
                <h3 className="text-xl font-semibold font-serif text-deep-ocean">{selectedItem.title}</h3>
                <p className="mt-3 text-sm text-charcoal/80 leading-6">{selectedItem.description}</p>
                {selectedItem.tags?.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedItem.tags.map((tag) => (
                      <span
                        key={`${selectedItem.id}-modal-${tag}`}
                        className="lux-chip"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={handleRequestFromModal}
                  className="mt-6 lux-button"
                >
                  Start a request like this
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
