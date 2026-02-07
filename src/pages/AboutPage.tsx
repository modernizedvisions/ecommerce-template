import { useEffect, useState } from 'react';
import { ContactForm } from '../components/ContactForm';
import { getPublicSiteContentHome } from '../lib/api';
import type { HomeSiteContent } from '../lib/types';

export function AboutPage() {
  const [homeContent, setHomeContent] = useState<HomeSiteContent | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const content = await getPublicSiteContentHome();
        if (!cancelled) {
          setHomeContent(content || {});
        }
      } catch (err) {
        console.error('Failed to load about images', err);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const aboutImage = homeContent?.aboutImages?.about || '/pictures/about_page.jpg';
  return (
    <div className="bg-linen text-charcoal">
      <section className="py-16 sm:py-20">
        <div className="w-full max-w-[92vw] sm:max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 space-y-3">
            <p className="text-[11px] uppercase tracking-[0.32em] text-deep-ocean/80">About Dover Designs</p>
            <h1 className="text-4xl sm:text-5xl font-serif font-semibold tracking-[0.03em] text-deep-ocean">Hi, I&apos;m Rachel!</h1>
          </div>

          <div className="grid gap-10 lg:grid-cols-[1.05fr,0.95fr] items-center">
            <div className="order-2 lg:order-1 space-y-5 text-[15px] sm:text-lg leading-relaxed font-sans text-center max-w-2xl mx-auto tracking-[0.01em]">
              <p>
                Hi, I’m Rachel a self-taught artist and the creator of Dover Designs. I handpick most of my shells along the Boston shoreline and transform them into modern coastal pieces inspired by the sea.
              </p>
              <p>
                Dover Designs crafts one-of-a-kind shell art for curated interiors, pairing natural shells with hand-applied finishes to bring calm, warm elegance into modern living spaces.
              </p>
              <p>
                Inspired by shoreline textures and timeless design, each commission or limited collection is created with balance, intention, and a gallery-worthy finish meant to live beautifully for years.
              </p>
              <p>
                From bespoke statements to cohesive sets, every piece is designed to layer effortlessly with heirloom objects and modern furnishings alike—quiet luxury that feels personal, collected, and enduring.
              </p>
            </div>

            <div className="order-1 lg:order-2">
              <div className="relative rounded-shell-lg overflow-hidden lux-shadow border border-driftwood/70 bg-white/70">
                <div className="absolute inset-0 bg-gradient-to-br from-sand/70 via-transparent to-sea-glass/15 pointer-events-none" />
                <img
                  src={aboutImage}
                  alt="Dover Designs studio"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-transparent">
        <div className="w-full max-w-[92vw] sm:max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="space-y-8">
            <div className="space-y-3 max-w-3xl">
              <p className="text-xs uppercase tracking-[0.32em] text-deep-ocean/75">Contact</p>
              <h2 className="text-3xl sm:text-4xl font-serif tracking-[0.03em] text-deep-ocean">Send me a message</h2>
              <p className="text-base text-charcoal/80 leading-relaxed">
                Tell me about your space, palette, or the story you want a shell to hold.
              </p>
            </div>
            <div className="mt-10 rounded-shell-lg border border-driftwood/70 bg-white/80 lux-shadow">
              <div className="flex justify-center">
                <div className="p-6 sm:p-8 bg-white/90 w-full max-w-4xl">
                  <ContactForm backgroundColor="transparent" variant="embedded" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
