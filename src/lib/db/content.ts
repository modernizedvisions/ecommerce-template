import type { CustomOrdersImage, GalleryImage, HeroConfig, HeroCollageImage } from '../types';
import {
  GALLERY_STORAGE_KEY,
  HOME_HERO_STORAGE_KEY,
  SHOP_CATEGORY_TILES_STORAGE_KEY,
  defaultGalleryImages,
  defaultHomeHeroConfig,
  defaultShopCategoryTiles,
} from './mockData';
import type { ShopCategoryTile } from '../types';

// TODO: Swap localStorage for Cloudflare D1 tables exposed via Workers.

export async function getGalleryImages(): Promise<GalleryImage[]> {
  try {
    const stored = localStorage.getItem(GALLERY_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as GalleryImage[];
    }
  } catch (err) {
    console.warn('Gallery storage read failed, using defaults.', err);
  }
  return defaultGalleryImages;
}

export async function saveGalleryImages(images: GalleryImage[]): Promise<void> {
  localStorage.setItem(GALLERY_STORAGE_KEY, JSON.stringify(images));
}

const normalizeHeroImage = (
  image: Partial<HeroCollageImage> | undefined,
  fallbackAlt?: string
): HeroCollageImage | null => {
  if (!image?.imageUrl) return null;
  return {
    id: image.id || crypto.randomUUID?.() || `hero-${Date.now()}`,
    imageUrl: image.imageUrl,
    alt: image.alt || fallbackAlt,
  };
};

export async function getHomeHeroConfig(): Promise<HeroConfig> {
  try {
    const stored = localStorage.getItem(HOME_HERO_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);

      // Legacy array payload: treat as heroImages
      if (Array.isArray(parsed)) {
        const heroImages = parsed
          .slice(0, 3)
          .map((img: Partial<HeroCollageImage>) => normalizeHeroImage(img))
          .filter(Boolean) as HeroCollageImage[];
        return { heroImages };
      }

      // Legacy object with main + grid images
      if (parsed?.mainImage || parsed?.gridImages) {
        const heroImages: HeroCollageImage[] = [];
        const legacyMain = normalizeHeroImage(parsed.mainImage, 'Featured hero image');
        if (legacyMain) heroImages.push(legacyMain);
        if (Array.isArray(parsed.gridImages)) {
          parsed.gridImages.slice(0, 2).forEach((img: Partial<HeroCollageImage>) => {
            const normalized = normalizeHeroImage(img);
            if (normalized) heroImages.push(normalized);
          });
        }
        return { heroImages };
      }

      const config = parsed as HeroConfig;
      return {
        heroImages: Array.isArray(config.heroImages) ? config.heroImages.slice(0, 3) : [],
        customOrdersImages: Array.isArray(config.customOrdersImages)
          ? config.customOrdersImages.slice(0, 4)
          : [],
        heroRotationEnabled: !!config.heroRotationEnabled,
      };
    }
  } catch (err) {
    console.warn('Home hero storage read failed, using defaults.', err);
  }
  return {
    heroImages: (defaultHomeHeroConfig.heroImages || []).slice(0, 3),
    customOrdersImages: (defaultHomeHeroConfig.customOrdersImages || []).slice(0, 4),
    heroRotationEnabled: !!defaultHomeHeroConfig.heroRotationEnabled,
  };
}

export async function saveHomeHeroConfig(config: HeroConfig): Promise<void> {
  const safeImages = (config.heroImages || [])
    .filter((img) => !!img?.imageUrl)
    .slice(0, 3)
    .map((img, index) => ({
      id: img.id || `hero-${index}-${crypto.randomUUID?.() || Date.now()}`,
      imageUrl: img.imageUrl,
      alt: img.alt,
    }));

  const safeCustomOrders: CustomOrdersImage[] = (config.customOrdersImages || [])
    .filter((img) => !!img?.imageUrl)
    .slice(0, 4)
    .map((img) => ({
      imageUrl: img.imageUrl,
      alt: img.alt,
    }));

  const safeConfig: HeroConfig = {
    heroImages: safeImages,
    customOrdersImages: safeCustomOrders,
    heroRotationEnabled: !!config.heroRotationEnabled,
  };
  localStorage.setItem(HOME_HERO_STORAGE_KEY, JSON.stringify(safeConfig));
}

export function fetchShopCategoryTiles(): ShopCategoryTile[] {
  try {
    const stored = localStorage.getItem(SHOP_CATEGORY_TILES_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed as ShopCategoryTile[];
      }
    }
  } catch (err) {
    console.warn('Shop category tiles storage read failed, using defaults.', err);
  }
  return defaultShopCategoryTiles;
}

export async function saveShopCategoryTiles(tiles: ShopCategoryTile[]): Promise<void> {
  localStorage.setItem(SHOP_CATEGORY_TILES_STORAGE_KEY, JSON.stringify(tiles));
}
