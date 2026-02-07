import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { ContactForm } from '../components/ContactForm';
import type { HomeGalleryItem } from '../lib/types';

export type HomeTemplateProps = {
  heroImageUrl?: string;
  galleryImageUrls?: string[];
  homeGalleryItems?: HomeGalleryItem[];
  aboutImageUrl?: string;
};

const heroDefault = '/pictures/hero_picture.jpg';

const galleryDefaults = [
  '/pictures/gallery_1.jpg',
  '/pictures/gallery_2.jpg',
  '/pictures/gallery_3.jpg',
  '/pictures/gallery_4.jpg',
  '/pictures/gallery_5.jpg',
  '/pictures/gallery_6.jpg',
  '/pictures/gallery_7.jpg',
  '/pictures/gallery_8.jpg',
];

const artistDefault = '/pictures/artist_section.jpg';

const services = [
  {
    title: 'Curated Collections',
    copy: 'Seasonal and limited-run coastal shell designs ready to style and gift.',
  },
  {
    title: 'Handcrafted Art',
    copy: 'Every shell is carefully selected and finished by hand.',
  },
  {
    title: 'Custom Interior Pieces',
    copy: 'Designed to harmonize with your palette, finishes, and collected objects.',
  },
];

const galleryItems = [
  { label: 'COASTAL CALM', accent: 'COASTAL CALM', tall: true },
  { label: 'COOL TIDES', accent: 'COOL TIDES', tall: false },
  { label: 'SEA SPECTRUM', accent: 'SEA SPECTRUM', tall: true },
  { label: 'LIGHT WASH', accent: 'LIGHT WASH', tall: false },
  { label: 'SOFT GOLD', accent: 'SOFT GOLD', tall: false },
  { label: 'COASTAL DINING', accent: 'COASTAL DINING', tall: true },
  { label: 'PAINTED VIEW', accent: 'PAINTED VIEW', tall: false },
  { label: 'DEEP TIDES', accent: 'DEEP TIDES', tall: false },
];

const testimonials = [
  {
    quote: 'Could not recommend Dover Designs more! Love this piece -- made such a great gift! Unique and high quality!',
    name: 'Megan',
  },
  {
    quote: 'We were so incredibly happy with how these came out and will enjoy them for years. We will definitely buy from again in the future.',
    name: 'TJ',
  },
  {
    quote:
      'It is absolutely gorgeous! The colors are stunning! Rachel was quick to respond & answer my questions! Highly recommend!',
    name: 'Christine',
  },
];

export default function HomeTemplate({ heroImageUrl, galleryImageUrls, homeGalleryItems, aboutImageUrl }: HomeTemplateProps) {
  const resolvedHeroImage = heroImageUrl ?? heroDefault;
  const resolvedGalleryImages = galleryImageUrls?.length ? galleryImageUrls : galleryDefaults;
  const resolvedAboutImage = aboutImageUrl || artistDefault || resolvedGalleryImages[1] || resolvedHeroImage || galleryDefaults[1];
  const galleryWithSources = useMemo(() => {
    const hasHomeGalleryContent = Array.isArray(homeGalleryItems);
    const normalizedHomeGallery = Array.from({ length: 8 }, (_, index) => ({
      imageUrl: homeGalleryItems?.[index]?.imageUrl || '',
      descriptor: homeGalleryItems?.[index]?.descriptor || '',
    }));
    const fallbackDescriptors = galleryItems.map((item) => item.accent);

    return Array.from({ length: 8 }, (_, index) => {
      const slot = normalizedHomeGallery[index];
      const image = hasHomeGalleryContent
        ? slot.imageUrl || null
        : resolvedGalleryImages[index % resolvedGalleryImages.length] ?? resolvedHeroImage ?? null;
      const descriptor = hasHomeGalleryContent ? slot.descriptor || '' : fallbackDescriptors[index] || '';
      const label = descriptor || (hasHomeGalleryContent ? `Gallery ${index + 1}` : fallbackDescriptors[index] || `Gallery ${index + 1}`);
      return {
        image,
        descriptor,
        label,
      };
    });
  }, [homeGalleryItems, resolvedGalleryImages, resolvedHeroImage]);

  return (
    <div className="bg-linen text-charcoal">
      <div className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 shell-pattern opacity-60" />
        <div className="pointer-events-none absolute inset-x-0 -top-32 h-64 bg-[radial-gradient(circle_at_top,_rgba(159,191,187,0.22),_transparent_52%)]" />

        <section
          id="top"
          className="relative pt-14 sm:pt-20 lg:pt-24 pb-16 bg-gradient-to-b from-[var(--warm-linen)] via-[var(--linen)] to-[var(--sand)]"
        >
          <SectionWrapper>
            <div className="grid gap-10 lg:grid-cols-[1.05fr,0.95fr] items-center">
              <RevealOnScroll className="space-y-8">
                <div className="space-y-5 text-center lg:text-left">
                  <p className="text-[11px] uppercase tracking-[0.32em] text-deep-ocean/70 text-center">
                    DESIGNED FOR PRIVATE HOMES AND CURATED INTERIORS
                  </p>
                  <h1 className="font-serif text-4xl sm:text-5xl lg:text-[54px] leading-tight tracking-[0.05em] text-deep-ocean font-semibold">
                    <span className="block">
                      <span className="text-[1.06em] inline-block">H</span>andcrafted Coastal Shell
                    </span>
                    <span className="block">Art for Curated Interiors</span>
                  </h1>
                  <p className="max-w-2xl mx-auto text-lg text-charcoal/75 text-center">
                    One-of-a-kind, hand-painted shell pieces inspired by the calm of the coast, crafted to elevate modern living spaces.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 lg:flex-row lg:items-start">
                  <LuxuryButton
                    to="/shop"
                    variant="primary"
                    className="w-full sm:w-full lg:w-auto lg:min-w-[260px] lg:h-[54px] px-10 sm:px-12 text-[13px] justify-center whitespace-nowrap box-border border border-transparent"
                  >
                    Explore the Collection
                  </LuxuryButton>
                  <LuxuryButton
                    to="/custom-orders"
                    variant="ghost"
                    className="w-full sm:w-full lg:w-auto lg:min-w-[260px] lg:h-[54px] px-10 sm:px-12 text-[13px] justify-center whitespace-nowrap box-border"
                  >
                    Custom Orders
                  </LuxuryButton>
                </div>
                <div className="grid max-sm:grid-cols-1 grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 justify-items-center">
                  {[
                    { title: 'Hand-painted', desc: 'Every shell finished in-studio' },
                    { title: 'Gallery-grade', desc: 'UV protected and sealed' },
                    { title: 'Ships with care', desc: 'White-glove packaging' },
                  ].map((item) => (
                    <div key={item.title} className="shell-card px-4 py-3 text-center">
                      <p className="text-xs uppercase tracking-[0.28em] text-deep-ocean/80 whitespace-nowrap">{item.title}</p>
                    </div>
                  ))}
                </div>
              </RevealOnScroll>
              <RevealOnScroll delay={120} className="relative">
                <div className="relative rounded-shell-lg overflow-hidden lux-shadow border border-driftwood/70 bg-white/70 mx-auto w-full max-w-xl lg:max-w-none">
                  <div className="absolute inset-0 bg-gradient-to-br from-sand/70 via-transparent to-sea-glass/15 pointer-events-none" />
                  <div className="aspect-[4/5] w-full flex items-end justify-start">
                    {resolvedHeroImage ? (
                      <img
                        src={resolvedHeroImage}
                        alt="Handcrafted shell art lifestyle"
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-sand via-linen to-sea-glass/40 shell-pattern flex items-end">
                        <div className="m-6 shell-card">
                          <p className="text-xs uppercase tracking-[0.26em] text-deep-ocean/80">// Lifestyle shell art image</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </RevealOnScroll>
            </div>
          </SectionWrapper>
        </section>

        <SectionDivider />

        <SectionWrapper id="services" className="py-16 sm:py-20 bg-[var(--sand)]">
          <SectionHeading
            eyebrow="Offerings"
            title="What makes this special"
            subtitle="A boutique coastal studio where fine-art detail meets interior design sensibility."
          />
          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-stretch">
            {services.map((service, index) => (
              <RevealOnScroll
                key={service.title}
                delay={index * 60}
                className="group relative flex flex-col justify-between min-h-[220px] md:min-h-[260px] rounded-2xl border border-driftwood/80 bg-stone/70 shadow-lg transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-xl p-8 md:p-10"
              >
                <div className="flex flex-col flex-1 gap-4">
                  <div className="mb-1">
                    <span className="block h-[2px] w-10 bg-gold-accent/90 rounded-full transition-all duration-300 group-hover:w-14 shadow-[0_6px_18px_rgba(217,199,161,0.35)]" />
                  </div>
                  <h3 className="text-xl md:text-2xl font-serif tracking-[0.02em] text-deep-ocean leading-snug">{service.title}</h3>
                  <p className="text-sm leading-relaxed text-charcoal/80 flex-1">{service.copy}</p>
                </div>
                <div className="text-sm uppercase tracking-[0.3em] text-deep-ocean/80 mt-6">
                  <Link
                    to={
                      service.title === 'Curated Collections'
                        ? '/shop'
                        : service.title === 'Handcrafted Art'
                          ? '/gallery'
                          : '/custom-orders'
                    }
                    className="inline-flex items-center gap-2 group-hover:underline decoration-[0.5px] underline-offset-4"
                  >
                    <span>Discover</span>
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </RevealOnScroll>
            ))}
          </div>
        </SectionWrapper>

        <SectionDivider />

        <SectionWrapper id="gallery" className="py-16 sm:py-20 bg-[var(--stone)]">
          <SectionHeading
            eyebrow="Gallery"
            title="In the making"
            subtitle="Soft, artisanal finishes captured in lifestyle scenes and studio moments."
          />
          <GalleryGrid items={galleryWithSources} />
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <LuxuryButton to="/shop" variant="primary" className="px-8 py-3.5 text-[12px]">
              View in Shop
            </LuxuryButton>
            <LuxuryButton to="/gallery" variant="ghost" className="px-8 py-3.5 text-[12px]">
              Full Gallery
            </LuxuryButton>
          </div>
        </SectionWrapper>

        <SectionWrapper id="reviews" className="py-16 sm:py-20 bg-[var(--warm-linen)]">
          <SectionHeading
            eyebrow="Reviews"
            title="Trusted by collectors"
            subtitle="Words from interior designers and collectors who live with Dover Designs' pieces."
          />
          <div className="mt-10 rounded-shell-lg border border-sea-glass/30 bg-sea-glass/10 px-4 py-6 sm:px-6 sm:py-8 shadow-inner">
            <div className="flex flex-col md:flex-row gap-4 md:overflow-x-auto pb-2 snap-x snap-mandatory items-center md:items-stretch">
              {testimonials.map((testimonial, index) => (
                <RevealOnScroll
                  key={testimonial.name}
                  delay={index * 80}
                  className="w-full max-w-md md:min-w-[260px] md:max-w-sm snap-center"
                >
                  <div className="relative flex flex-col justify-between min-h-[220px] md:min-h-[260px] p-8 rounded-2xl overflow-hidden border border-driftwood/30 shadow-sm bg-linen text-center">
                    <p className="text-lg leading-relaxed text-deep-ocean [display:-webkit-box] [overflow:hidden] [text-overflow:ellipsis] [WebkitLineClamp:3] md:[WebkitLineClamp:4] [WebkitBoxOrient:vertical]">
                      "{testimonial.quote}"
                    </p>
                    <div className="mt-4 text-xs uppercase tracking-[0.3em] text-driftwood flex items-center justify-center gap-2">
                      <span>{testimonial.name}</span>
                    </div>
                    <div className="mt-4 flex justify-center gap-1 text-soft-gold" aria-label="5 star rating">
                      <span>*</span>
                      <span>*</span>
                      <span>*</span>
                      <span>*</span>
                      <span>*</span>
                    </div>
                  </div>
                </RevealOnScroll>
              ))}
            </div>
          </div>
        </SectionWrapper>

        <SectionDivider />

        <SectionWrapper id="about" className="py-16 sm:py-20 bg-[var(--sand)]">
          <div className="grid gap-10 lg:grid-cols-[0.95fr,1.05fr] items-center">
            <RevealOnScroll delay={60} className="relative">
              <div className="rounded-shell-lg overflow-hidden shadow-2xl border border-driftwood/70 bg-gradient-to-br from-linen via-sand to-sea-glass/20 shell-pattern">
                {resolvedAboutImage ? (
                  <img
                    src={resolvedAboutImage}
                    alt="Artist portrait or studio"
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="aspect-[4/5] flex items-end">
                    <div className="m-6 shell-card bg-white/80">
                      <p className="text-xs uppercase tracking-[0.26em] text-deep-ocean/80">// Artist portrait or studio</p>
                    </div>
                  </div>
                )}
              </div>
            </RevealOnScroll>
            <RevealOnScroll className="space-y-6">
              <SectionHeading
                eyebrow="The artist"
                title="Behind Dover Designs"
                subtitle="Dover Designs is a coastal shell art studio based in Boston, creating one-of-a-kind pieces inspired by the shoreline, natural textures, and modern interior spaces."
              />
              <p className="text-base leading-relaxed text-charcoal/80">
                Each shell is sourced, painted, and gilded by hand - balancing soft coastal tones with gallery-grade finishes.
                The work is designed to layer effortlessly with modern furnishings and heirloom objects.
              </p>
              <div className="flex flex-col gap-4">
                <LuxuryButton to="/about" variant="primary">
                  Learn the Story
                </LuxuryButton>
              </div>
            </RevealOnScroll>
          </div>
        </SectionWrapper>

        <SectionDivider />

        <SectionWrapper id="contact" className="py-16 sm:py-20 bg-transparent relative z-10">
          <SectionHeading
            eyebrow="Contact"
            title="Send me a message"
            subtitle="Tell me about your space, palette, or the story you want a shell to hold."
          />
          <div className="mt-10 rounded-shell-lg border border-driftwood/70 bg-white/80 lux-shadow">
            <div className="flex justify-center">
              <div className="p-6 sm:p-8 bg-white/90 w-full max-w-4xl">
                <ContactForm backgroundColor="transparent" variant="embedded" />
              </div>
            </div>
          </div>
        </SectionWrapper>
      </div>

      <MobileStickyCta />
    </div>
  );
}

function SectionWrapper({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={className}>
      <div className="w-full max-w-[92vw] sm:max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">{children}</div>
    </section>
  );
}

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="space-y-3 max-w-3xl">
      <p className="text-xs uppercase tracking-[0.32em] text-deep-ocean/75">{eyebrow}</p>
      <h2 className="text-3xl sm:text-4xl font-serif tracking-[0.03em] text-deep-ocean">{title}</h2>
      {subtitle ? <p className="text-base text-charcoal/80 leading-relaxed">{subtitle}</p> : null}
    </div>
  );
}

function SectionDivider() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
      <div className="shell-divider" />
    </div>
  );
}

function LuxuryButton({
  to,
  variant = 'primary',
  children,
  className,
}: {
  to: string;
  variant?: 'primary' | 'ghost' | 'outline';
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    primary: 'bg-deep-ocean text-white shadow-lg hover:-translate-y-0.5 hover:shadow-xl',
    ghost: 'bg-white/80 text-deep-ocean border border-driftwood/70 hover:bg-sand/80 hover:-translate-y-0.5',
    outline: 'border border-charcoal/60 text-charcoal hover:bg-charcoal hover:text-sand hover:-translate-y-0.5',
  };
  const ariaLabel = typeof children === 'string' ? children : undefined;

  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2 rounded-shell px-6 py-3 uppercase tracking-[0.24em] text-[11px] transition-all duration-200 ${styles[variant]} ${className ?? ''}`}
      aria-label={ariaLabel}
    >
      <span className="whitespace-nowrap">{children}</span>
      <ArrowUpRight className="h-4 w-4" />
    </Link>
  );
}

function AnchorPill({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="rounded-shell bg-white/70 border border-driftwood/70 px-4 py-2 hover:bg-sand/80 transition-all duration-150"
    >
      {label}
    </a>
  );
}

function RevealOnScroll({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-[cubic-bezier(.22,1,.36,1)] ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      } ${className}`}
    >
      {children}
    </div>
  );
}

function GalleryGrid({ items }: { items: Array<{ label?: string; descriptor?: string; image?: string | null }> }) {
  return (
    <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 items-stretch">
      {items.map((item, index) => {
        const toneClass = index % 2 === 0 ? 'bg-white/90' : 'bg-sand/70';
        const descriptor = (item.descriptor || '').trim();
        return (
          <RevealOnScroll key={`${item.label || 'gallery'}-${index}`} delay={index * 40}>
            <div
              className={`group relative rounded-shell-lg border border-driftwood/30 ${toneClass} shadow-sm transition-all duration-300 ease-out hover:shadow-md cursor-pointer bg-linen`}
            >
              <div className="aspect-[3/4] w-full overflow-hidden rounded-shell-lg">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={descriptor || item.label || 'Gallery image'}
                    className="h-full w-full object-cover rounded-shell-lg transition duration-500 group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-sand via-linen to-sea-glass/20 shell-pattern rounded-shell-lg" />
                )}
                {descriptor ? (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 sm:left-auto sm:right-2 sm:translate-x-0 shell-card bg-white/90 px-3 py-2 text-[11px] uppercase tracking-[0.28em] text-deep-ocean/80 sm:block hidden">
                    {descriptor}
                  </div>
                ) : null}
              </div>
              {descriptor ? (
                <div className="sm:hidden flex justify-center px-3 pb-3 pt-2">
                  <span className="inline-flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm border border-driftwood/30 shadow-sm px-3 py-1.5 text-[11px] uppercase tracking-[0.28em] text-deep-ocean/80 whitespace-nowrap">
                    {descriptor}
                  </span>
                </div>
              ) : null}
            </div>
          </RevealOnScroll>
        );
      })}
    </div>
  );
}

function MobileStickyCta() {
  return (
    <div className="fixed bottom-0 inset-x-0 z-30 md:hidden">
      <div className="mx-3 mb-3 rounded-shell-lg bg-deep-ocean text-white shadow-2xl">
        <Link to="/shop" className="flex items-center justify-center gap-2 px-4 py-4 text-xs uppercase tracking-[0.26em]">
          Shop Collection
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
