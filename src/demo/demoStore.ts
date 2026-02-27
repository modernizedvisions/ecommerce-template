import type { AdminOrder } from '../lib/db/orders';
import type { AdminCustomOrder } from '../lib/db/customOrders';
import type { Category, HomeSiteContent, Product, PromoCode, Promotion } from '../lib/types';
import type { EmailListItem } from '../lib/emailListTypes';
import type { OrderShipment, ShipFromSettings, ShippingBoxPreset, ShipmentQuote } from '../lib/adminShipping';
import type { DemoImageAsset, DemoMessage, DemoOrderLabel, DemoOrderLabelsMap, DemoQuoteMap, DemoShipmentMap } from './types';
import { seedCategories } from './seed/categories';
import { seedHomeContent, seedGalleryImages, seedCustomOrderExamples, type SeedCustomOrderExample } from './seed/content';
import { seedEmailListItems } from './seed/emailList';
import { seedAdminMessages } from './seed/messages';
import { seedAdminCustomOrders } from './seed/customOrders';
import { seedAdminOrders } from './seed/orders';
import { seedAdminProducts } from './seed/products';
import { seedPromoCodes, seedPromotions } from './seed/promotions';
import { seedShippingState } from './seed/shipping';
import { seedSoldProducts } from './seed/soldProducts';
import { createLocalImageAsset, revokeLocalImageAsset } from './localImageUpload';

export type DemoState = {
  orders: AdminOrder[];
  messages: DemoMessage[];
  soldProducts: Product[];
  products: Product[];
  categories: Category[];
  promotions: Promotion[];
  promoCodes: PromoCode[];
  customOrders: AdminCustomOrder[];
  images: DemoImageAsset[];
  emailList: EmailListItem[];
  homeContent: HomeSiteContent;
  galleryImages: Array<{
    id: string;
    imageUrl: string;
    imageId?: string | null;
    hidden: boolean;
    alt?: string;
    title?: string;
    position?: number;
    createdAt?: string;
  }>;
  customOrderExamples: SeedCustomOrderExample[];
  shippingSettings: {
    shipFrom: ShipFromSettings;
    boxPresets: ShippingBoxPreset[];
  };
  orderShipments: DemoShipmentMap;
  orderQuotes: DemoQuoteMap;
  orderLabels: DemoOrderLabelsMap;
};

const clone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const timestamp = () => new Date().toISOString();

export const demoId = (prefix: string) => {
  const uid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `demo_${prefix}_${uid}`;
};

const createInitialState = (): DemoState => ({
  orders: clone(seedAdminOrders),
  messages: clone(seedAdminMessages),
  soldProducts: clone(seedSoldProducts),
  products: clone(seedAdminProducts),
  categories: clone(seedCategories),
  promotions: clone(seedPromotions),
  promoCodes: clone(seedPromoCodes),
  customOrders: clone(seedAdminCustomOrders),
  images: [],
  emailList: clone(seedEmailListItems),
  homeContent: clone(seedHomeContent),
  galleryImages: clone(seedGalleryImages),
  customOrderExamples: clone(seedCustomOrderExamples),
  shippingSettings: clone(seedShippingState),
  orderShipments: {},
  orderQuotes: {},
  orderLabels: {},
});

let state: DemoState = createInitialState();
const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error('[demoStore] subscriber error', error);
    }
  });
};

const setState = (updater: (current: DemoState) => DemoState): DemoState => {
  state = updater(state);
  emit();
  return state;
};

const revokeAllObjectUrls = (images: DemoImageAsset[]) => {
  images.forEach((asset) => {
    revokeLocalImageAsset(asset);
  });
};

export const getState = (): DemoState => state;

export const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const upsertOrderShipment = (orderId: string, shipment: OrderShipment) =>
  setState((current) => {
    const existing = current.orderShipments[orderId] || [];
    const next = existing.some((entry) => entry.id === shipment.id)
      ? existing.map((entry) => (entry.id === shipment.id ? shipment : entry))
      : [...existing, shipment];
    return {
      ...current,
      orderShipments: {
        ...current.orderShipments,
        [orderId]: next.sort((a, b) => a.parcelIndex - b.parcelIndex),
      },
    };
  });

const removeOrderShipment = (orderId: string, shipmentId: string) =>
  setState((current) => {
    const next = (current.orderShipments[orderId] || [])
      .filter((entry) => entry.id !== shipmentId)
      .map((entry, index) => ({ ...entry, parcelIndex: index + 1 }));
    const quotes = { ...current.orderQuotes };
    delete quotes[shipmentId];
    return {
      ...current,
      orderShipments: {
        ...current.orderShipments,
        [orderId]: next,
      },
      orderQuotes: quotes,
    };
  });

export const actions = {
  addProduct(product: Product): Product {
    const next = { ...product, id: product.id || demoId('prod') };
    setState((current) => ({ ...current, products: [next, ...current.products] }));
    return next;
  },
  updateProduct(id: string, patch: Partial<Product>): Product | null {
    let updated: Product | null = null;
    setState((current) => ({
      ...current,
      products: current.products.map((item) => {
        if (item.id !== id) return item;
        updated = { ...item, ...patch };
        return updated;
      }),
    }));
    return updated;
  },
  deleteProduct(id: string): void {
    setState((current) => ({ ...current, products: current.products.filter((item) => item.id !== id) }));
  },
  setCategories(categories: Category[]): void {
    setState((current) => ({ ...current, categories: clone(categories) }));
  },
  addPromotion(promotion: Promotion): Promotion {
    const next = { ...promotion, id: promotion.id || demoId('promo'), createdAt: promotion.createdAt || timestamp(), updatedAt: timestamp() };
    setState((current) => ({ ...current, promotions: [next, ...current.promotions] }));
    return next;
  },
  updatePromotion(id: string, patch: Partial<Promotion>): Promotion | null {
    let updated: Promotion | null = null;
    setState((current) => ({
      ...current,
      promotions: current.promotions.map((entry) => {
        if (entry.id !== id) return entry;
        updated = { ...entry, ...patch, updatedAt: timestamp() };
        return updated;
      }),
    }));
    return updated;
  },
  deletePromotion(id: string): void {
    setState((current) => ({ ...current, promotions: current.promotions.filter((entry) => entry.id !== id) }));
  },
  setPromoCodes(promoCodes: PromoCode[]): void {
    setState((current) => ({ ...current, promoCodes: clone(promoCodes) }));
  },
  addCustomOrder(order: AdminCustomOrder): AdminCustomOrder {
    const next = { ...order, id: order.id || demoId('co'), createdAt: order.createdAt || timestamp() };
    setState((current) => ({ ...current, customOrders: [next, ...current.customOrders] }));
    return next;
  },
  updateCustomOrder(id: string, patch: Partial<AdminCustomOrder>): AdminCustomOrder | null {
    let updated: AdminCustomOrder | null = null;
    setState((current) => ({
      ...current,
      customOrders: current.customOrders.map((entry) => {
        if (entry.id !== id) return entry;
        updated = { ...entry, ...patch };
        return updated;
      }),
    }));
    return updated;
  },
  removeCustomOrder(id: string): void {
    setState((current) => ({ ...current, customOrders: current.customOrders.filter((entry) => entry.id !== id) }));
  },
  addImageAsset(file: File): DemoImageAsset {
    const asset = createLocalImageAsset(file);
    setState((current) => ({ ...current, images: [asset, ...current.images] }));
    return asset;
  },
  removeImageAsset(id: string): void {
    setState((current) => {
      const target = current.images.find((asset) => asset.id === id);
      revokeLocalImageAsset(target);
      return { ...current, images: current.images.filter((asset) => asset.id !== id) };
    });
  },
  setShippingSettings(shipFrom: ShipFromSettings): void {
    setState((current) => ({
      ...current,
      shippingSettings: {
        ...current.shippingSettings,
        shipFrom: { ...shipFrom, updatedAt: shipFrom.updatedAt || timestamp() },
      },
    }));
  },
  setPackages(boxPresets: ShippingBoxPreset[]): void {
    setState((current) => ({
      ...current,
      shippingSettings: {
        ...current.shippingSettings,
        boxPresets: clone(boxPresets),
      },
    }));
  },
  setOrderQuotes(shipmentId: string, rates: ShipmentQuote[]): void {
    setState((current) => ({
      ...current,
      orderQuotes: {
        ...current.orderQuotes,
        [shipmentId]: clone(rates),
      },
    }));
  },
  setOrderShipments(orderId: string, shipments: OrderShipment[]): void {
    setState((current) => ({
      ...current,
      orderShipments: {
        ...current.orderShipments,
        [orderId]: clone(shipments).sort((a, b) => a.parcelIndex - b.parcelIndex),
      },
    }));
  },
  addOrderShipment(orderId: string, shipment: OrderShipment): void {
    upsertOrderShipment(orderId, shipment);
  },
  updateOrderShipment(orderId: string, shipment: OrderShipment): void {
    upsertOrderShipment(orderId, shipment);
  },
  removeOrderShipment(orderId: string, shipmentId: string): void {
    removeOrderShipment(orderId, shipmentId);
  },
  attachLabelToOrder(orderId: string, label: DemoOrderLabel): void {
    setState((current) => {
      const existing = current.orderLabels[orderId] || [];
      return {
        ...current,
        orderLabels: {
          ...current.orderLabels,
          [orderId]: [...existing, label],
        },
      };
    });
  },
  setHomeContent(homeContent: HomeSiteContent): void {
    setState((current) => ({ ...current, homeContent: clone(homeContent) }));
  },
  setGalleryImages(images: DemoState['galleryImages']): void {
    setState((current) => ({
      ...current,
      galleryImages: clone(images).map((item, index) => ({ ...item, position: index })),
    }));
  },
  setCustomOrderExamples(examples: SeedCustomOrderExample[]): void {
    setState((current) => ({
      ...current,
      customOrderExamples: clone(examples).map((item, index) => ({ ...item, sortOrder: index })),
    }));
  },
  setOrders(orders: AdminOrder[]): void {
    setState((current) => ({ ...current, orders: clone(orders) }));
  },
  setMessages(messages: DemoMessage[]): void {
    setState((current) => ({ ...current, messages: clone(messages) }));
  },
  reset(): void {
    revokeAllObjectUrls(state.images);
    state = createInitialState();
    emit();
  },
};



