export interface Product {
  id: string;
  stripeProductId?: string | null;
  name: string;
  slug?: string;
  description: string;
  imageUrls: string[];
  imageUrl: string;
  primaryImageId?: string;
  imageIds?: string[];
  thumbnailUrl?: string;
  type: string;
  /**
   * Optional category aliases for flexibility while we transition away from a fixed set.
   * `type` remains the primary category field in most of the UI/API.
   */
  category?: string;
  categories?: string[];
  collection?: string;
  oneoff: boolean;
  quantityAvailable?: number;
  visible: boolean;
  isSold: boolean;
  stripePriceId?: string | null;
  priceCents?: number;
  soldAt?: string;
}

export interface CartItem {
  productId: string;
  name: string;
  priceCents: number;
  quantity: number;
  imageUrl?: string;
  oneoff?: boolean;
  quantityAvailable?: number | null;
  stripeProductId?: string | null;
  stripePriceId?: string | null;
  category?: string | null;
  categories?: string[] | null;
  optionGroupLabel?: string | null;
  optionValue?: string | null;
}

export interface CartItemLegacy {
  stripeProductId: string;
  stripePriceId: string;
  name: string;
  priceCents: number;
  quantity: number;
  imageUrl?: string;
  oneoff: boolean;
}

export interface Customer {
  id: string;
  email: string;
  name: string;
}

export interface Order {
  id: string;
  customer: Customer;
  items: CartItem[];
  totalCents: number;
  status: 'paid' | 'pending' | 'canceled';
  createdAt: string;
}

export interface GalleryImage {
  id: string;
  imageUrl: string;
  imageId?: string;
  hidden: boolean;
  alt?: string;
  title?: string;
  position?: number;
  createdAt?: string;
  uploading?: boolean;
  optimizing?: boolean;
  uploadError?: string;
  previewUrl?: string;
  file?: File;
}

// Collage images for the homepage hero
export interface HeroCollageImage {
  id: string;
  imageUrl: string;
  imageId?: string;
  alt?: string;
  createdAt?: string;
  uploading?: boolean;
  optimizing?: boolean;
  uploadError?: string;
  previewUrl?: string;
}

export interface CustomOrdersImage {
  imageUrl: string;
  alt?: string;
  uploading?: boolean;
  optimizing?: boolean;
  uploadError?: string;
  previewUrl?: string;
}

export interface HomeGalleryItem {
  imageUrl: string;
  descriptor?: string;
  alt?: string;
  uploading?: boolean;
  optimizing?: boolean;
  uploadError?: string;
  previewUrl?: string;
}

export type AboutImages = {
  home?: string;
  about?: string;
};

export interface HeroConfig {
  heroImages: HeroCollageImage[]; // up to 3
  customOrdersImages?: CustomOrdersImage[]; // up to 4 for custom shells grid
  heroRotationEnabled?: boolean;
}

export type HomeSiteContent = {
  heroImages?: {
    left?: string;
    middle?: string;
    right?: string;
  };
  // Home Gallery (Homepage): 8 slots with optional pill descriptors.
  homeGallery?: HomeGalleryItem[];
  // About images shared by homepage + About page.
  aboutImages?: AboutImages;
  heroRotationEnabled?: boolean;
  shopCategoryCards?: Array<{
    slotIndex: number;
    categoryId?: string;
    categorySlug?: string;
    label?: string;
    ctaLabel?: string;
  }>;
};

export interface Category {
  id: string;
  name: string;
  subtitle?: string;
  slug: string;
  imageUrl?: string;
  heroImageUrl?: string;
  imageId?: string;
  heroImageId?: string;
  showOnHomePage: boolean;
  shippingCents?: number | null;
  sortOrder?: number;
  optionGroupLabel?: string | null;
  optionGroupOptions?: string[];
}

export type ShopCategoryTile = {
  id: string;
  label: string;
  ctaLabel: string;
  categorySlug: string;
  imageUrl: string;
  slotIndex?: number;
  categoryId?: string;
};

export interface Review {
  id: string;
  productId: string;
  author: string;
  rating: number; // 1–5
  comment: string;
  createdAt: string; // ISO date
}

export type PromotionScope = 'global' | 'categories';

export interface Promotion {
  id: string;
  name: string;
  percentOff: number;
  scope: PromotionScope;
  categorySlugs: string[];
  bannerEnabled: boolean;
  bannerText: string;
  startsAt?: string | null;
  endsAt?: string | null;
  enabled: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PromoCode {
  id: string;
  code: string;
  enabled: boolean;
  percentOff: number | null;
  freeShipping: boolean;
  scope: PromotionScope;
  categorySlugs: string[];
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AdminOrderItem {
  productId: string;
  productName: string | null;
  quantity: number;
  priceCents: number;
  productImageUrl?: string | null;
  imageUrl?: string | null;
  customOrderDisplayId?: string | null;
  optionGroupLabel?: string | null;
  optionValue?: string | null;
}

export interface AdminOrder {
  id: string;
  displayOrderId?: string | null;
  createdAt: string;
  totalCents: number;
  amountTotalCents?: number | null;
  amountSubtotalCents?: number | null;
  amountShippingCents?: number | null;
  amountTaxCents?: number | null;
  amountDiscountCents?: number | null;
  currency?: string | null;
  customerEmail: string | null;
  shippingName: string | null;
  customerName: string | null;
  shippingAddress: Record<string, any> | null;
  cardLast4?: string | null;
  cardBrand?: string | null;
  paymentMethodType?: string | null;
  paymentMethodLabel?: string | null;
  shippingCents?: number | null;
  promoCode?: string | null;
  promoPercentOff?: number | null;
  promoFreeShipping?: boolean | null;
  promoSource?: string | null;
  items: AdminOrderItem[];
}
