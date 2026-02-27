import type { GalleryImage, HomeSiteContent } from '../../lib/types';

export type SeedCustomOrderExample = {
  id: string;
  imageUrl: string;
  imageId?: string;
  title: string;
  description: string;
  tags: string[];
  sortOrder: number;
  isActive: boolean;
};

export const seedHomeContent: HomeSiteContent = {
  heroImages: {
    left: '/demo-assets/home/hero-01.svg',
    middle: '/demo-assets/home/hero-02.svg',
    right: '/demo-assets/home/hero-03.svg',
  },
  heroRotationEnabled: true,
  homeGallery: Array.from({ length: 8 }).map((_, idx) => ({
    imageUrl: `/demo-assets/home/home-${String(idx + 1).padStart(2, '0')}.svg`,
    descriptor: `Collection ${idx + 1}`,
  })),
  aboutImages: {
    home: '/demo-assets/home/about-home.svg',
    about: '/demo-assets/home/about-page.svg',
  },
};

export const seedGalleryImages: GalleryImage[] = Array.from({ length: 8 }).map((_, idx) => ({
  id: `seed_gallery_${String(idx + 1).padStart(3, '0')}`,
  imageUrl: `/demo-assets/gallery/gallery-${String(idx + 1).padStart(2, '0')}.svg`,
  imageId: null as unknown as string,
  hidden: false,
  alt: `Gallery image ${idx + 1}`,
  position: idx,
  createdAt: '2026-02-20T00:00:00.000Z',
}));

export const seedCustomOrderExamples: SeedCustomOrderExample[] = Array.from({ length: 9 }).map((_, idx) => ({
  id: `seed_example_${String(idx + 1).padStart(3, '0')}`,
  imageUrl: `/demo-assets/custom-order-examples/example-${String(idx + 1).padStart(2, '0')}.svg`,
  title: `Example ${idx + 1}`,
  description: `Custom oyster shell example design ${idx + 1}.`,
  tags: ['custom', 'coastal'],
  sortOrder: idx,
  isActive: true,
}));

