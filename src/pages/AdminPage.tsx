import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchGalleryImages,
  fetchOrders,
  fetchSoldProducts,
  saveGalleryImages,
  adminFetchProducts,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  adminUploadImageUnified,
  adminDeleteImage,
} from '../lib/api';
import { adminFetch } from '../lib/adminAuth';
import { GalleryImage, Product } from '../lib/types';
import type { AdminOrder } from '../lib/db/orders';
import { AdminOrdersTab } from '../components/admin/AdminOrdersTab';
import { AdminSoldTab } from '../components/admin/AdminSoldTab';
import { AdminGalleryTab, type AdminGalleryItem } from '../components/admin/AdminGalleryTab';
import { AdminHomeTab } from '../components/admin/AdminHomeTab';
import { AdminMessagesTab } from '../components/admin/AdminMessagesTab';
import { AdminShopTab } from '../components/admin/AdminShopTab';
import { AdminCustomOrdersTab } from '../components/admin/AdminCustomOrdersTab';
import { AdminCustomOrderExamplesTab } from '../components/admin/AdminCustomOrderExamplesTab';
import { OrderDetailsModal } from '../components/admin/OrderDetailsModal';
import { AdminPromotionsTab } from '../components/admin/AdminPromotionsTab';
import { AdminShippingSettingsTab } from '../components/admin/AdminShippingSettingsTab';
import { ShippingLabelsModal } from '../components/admin/ShippingLabelsModal';
import { toast } from 'sonner';
import {
  getAdminCustomOrders,
  createAdminCustomOrder,
  sendAdminCustomOrderPaymentLink,
  updateAdminCustomOrder,
  archiveAdminCustomOrder,
} from '../lib/db/customOrders';
import type { AdminCustomOrder } from '../lib/db/customOrders';
import { useLocation, useNavigate } from 'react-router-dom';

export type ProductFormState = {
  name: string;
  description: string;
  price: string;
  category: string;
  imageUrl: string;
  imageUrls: string;
  quantityAvailable: number;
  isOneOff: boolean;
  isActive: boolean;
  collection?: string;
  stripePriceId?: string;
  stripeProductId?: string;
};

export type ShopImage = {
  id: string;
  url: string;
  file?: File;
  isPrimary: boolean;
  isNew?: boolean;
  uploading?: boolean;
  optimizing?: boolean;
  uploadError?: string;
  cloudflareId?: string;
  imageId?: string | null;
  storageKey?: string;
  previewUrl?: string;
  needsMigration?: boolean;
};

export type ManagedImage = ShopImage;

const normalizeCategoryValue = (value: string | undefined | null) => (value || '').trim();

const initialProductForm: ProductFormState = {
  name: '',
  description: '',
  price: '',
  category: '',
  imageUrl: '',
  imageUrls: '',
  quantityAvailable: 1,
  isOneOff: true,
  isActive: true,
  collection: '',
  stripePriceId: '',
  stripeProductId: '',
};

type ParsedUploadError = {
  message: string;
  httpStatus?: number;
  code?: string;
};

const SHOP_UPLOAD_NO_FILE_MESSAGE = import.meta.env.DEV
  ? 'Upload not started: missing file reference'
  : 'Upload reference missing. Re-select the image.';

const parseUploadError = (error: unknown): ParsedUploadError => {
  const raw = error instanceof Error ? error.message : String(error || 'Upload failed');
  const statusMatch = raw.match(/\((\d{3})\)/);
  const codeMatch = raw.match(/:\s*([A-Z0-9_]+)$/);
  const httpStatus = statusMatch ? Number(statusMatch[1]) : undefined;
  const code = codeMatch ? codeMatch[1] : undefined;
  return {
    message: raw || 'Upload failed',
    httpStatus: Number.isFinite(httpStatus) ? httpStatus : undefined,
    code,
  };
};

const debugShopUpload = (...args: unknown[]) => {
  if (!import.meta.env.DEV) return;
  console.debug(...args);
};

const warnShopUpload = (...args: unknown[]) => {
  if (!import.meta.env.DEV) return;
  console.warn(...args);
};

type AdminTabBadgeProps = {
  count?: number | null;
  isActive?: boolean;
};

const AdminTabBadge = ({ count, isActive }: AdminTabBadgeProps) => {
  const safeCount = typeof count === 'number' && Number.isFinite(count) ? count : 0;
  if (safeCount <= 0) return null;

  return (
    <span
      className={`notif-circle absolute -top-1 -right-1 inline-flex h-5 w-5 items-center justify-center bg-soft-gold text-[10px] font-semibold leading-none text-deep-ocean shadow-sm ${
        isActive ? 'ring-1 ring-white/70' : 'ring-1 ring-deep-ocean/20'
      }`}
    >
      {safeCount > 9 ? '9+' : String(safeCount)}
    </span>
  );
};

type AdminTabKey = 'orders' | 'shop' | 'messages' | 'customOrders' | 'images' | 'sold' | 'promotions' | 'settings';

const ADMIN_TAB_TO_PATH: Record<AdminTabKey, string> = {
  orders: '/admin/customers',
  shop: '/admin/shop',
  messages: '/admin/messages',
  customOrders: '/admin/custom-orders',
  images: '/admin/images',
  sold: '/admin/sold',
  promotions: '/admin/promotions',
  settings: '/admin/settings',
};

const ADMIN_TABS: Array<{ key: AdminTabKey; label: string; badge?: number }> = [
  { key: 'orders', label: 'Orders', badge: 0 },
  { key: 'shop', label: 'Shop' },
  { key: 'messages', label: 'Messages', badge: 0 },
  { key: 'promotions', label: 'Promotions' },
  { key: 'customOrders', label: 'Custom Orders' },
  { key: 'images', label: 'Images' },
  { key: 'settings', label: 'Settings' },
  { key: 'sold', label: 'Sold Products' },
];

const resolveTabFromPath = (pathname: string): AdminTabKey => {
  if (pathname.startsWith('/admin/messages')) return 'messages';
  if (pathname.startsWith('/admin/shop')) return 'shop';
  if (pathname.startsWith('/admin/custom-orders')) return 'customOrders';
  if (pathname.startsWith('/admin/images')) return 'images';
  if (pathname.startsWith('/admin/sold')) return 'sold';
  if (pathname.startsWith('/admin/promotions')) return 'promotions';
  if (pathname.startsWith('/admin/settings')) return 'settings';
  if (pathname.startsWith('/admin/customers') || pathname.startsWith('/admin/orders')) return 'orders';
  return 'orders';
};

export function AdminPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [unseenOrders, setUnseenOrders] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [shippingModalOrder, setShippingModalOrder] = useState<AdminOrder | null>(null);
  const [soldProducts, setSoldProducts] = useState<Product[]>([]);
  const [adminProducts, setAdminProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [galleryImages, setGalleryImages] = useState<AdminGalleryItem[]>([]);
  const [gallerySaveState, setGallerySaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [productSaveState, setProductSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [editProductSaveState, setEditProductSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [productStatus, setProductStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  const [productForm, setProductForm] = useState<ProductFormState>(initialProductForm);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [editProductForm, setEditProductForm] = useState<ProductFormState | null>(null);
  const [productImages, setProductImages] = useState<ManagedImage[]>([]);
  const [editProductImages, setEditProductImages] = useState<ManagedImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const productImageFileInputRef = useRef<HTMLInputElement | null>(null);
  const editProductImageFileInputRef = useRef<HTMLInputElement | null>(null);
  const [messages] = useState<any[]>([]);
  const [customOrders, setCustomOrders] = useState<AdminCustomOrder[]>([]);
  const [customOrderDraft, setCustomOrderDraft] = useState<any>(null);
  const [customOrdersError, setCustomOrdersError] = useState<string | null>(null);
  const [isLoadingCustomOrders, setIsLoadingCustomOrders] = useState(false);
  const activeTab = useMemo(() => resolveTabFromPath(location.pathname), [location.pathname]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return orders;

    return orders.filter((order) => {
      const idMatch =
        (order.displayOrderId || order.id || '').toLowerCase().includes(q);
      const nameMatch = (order.customerName ?? '').toLowerCase().includes(q);
      const emailMatch = (order.customerEmail ?? '').toLowerCase().includes(q);
      const productMatch = order.items?.some((item) =>
        (item.productName ?? '').toLowerCase().includes(q)
      );
      return idMatch || nameMatch || emailMatch || productMatch;
    });
  }, [orders, searchQuery]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      if (import.meta.env.DEV) {
        console.debug('[admin auth] required', detail?.message || 'session invalid');
      }
      window.location.href = '/admin';
    };
    window.addEventListener('admin-auth-required', handler as EventListener);
    return () => window.removeEventListener('admin-auth-required', handler as EventListener);
  }, []);

  useEffect(() => {
    if (activeTab === 'shop' || activeTab === 'sold') {
      loadAdminProducts();
      refreshSoldProducts();
    }
  }, [activeTab]);

  useEffect(() => {
    void loadAdminData();
  }, []);

  const loadAdminData = async () => {
    // Fetch orders first with explicit loading/error handling so UI never shows stale empty data.
    setIsLoadingOrders(true);
    try {
      const { orders: ordersData, unseenCount } = await fetchOrders();
      setOrders(ordersData);
      setUnseenOrders(unseenCount);
      setOrdersError(null);
      if (import.meta.env.DEV) {
        console.debug('[admin] fetched orders', { count: ordersData.length });
      }
    } catch (err) {
      console.error('Failed to load admin orders', err);
      setOrdersError(err instanceof Error ? err.message : 'Failed to load orders');
      setOrders([]);
      setUnseenOrders(0);
    } finally {
      setIsLoadingOrders(false);
    }

    try {
      const res = await adminFetch('/api/admin/messages', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (typeof data?.unreadCount === 'number') {
          setUnreadMessages(data.unreadCount);
        } else if (Array.isArray(data?.messages)) {
          const count = data.messages.reduce((total: number, msg: any) => total + (msg?.isRead ? 0 : 1), 0);
          setUnreadMessages(count);
        } else {
          setUnreadMessages(0);
        }
      } else {
        setUnreadMessages(0);
      }
    } catch (err) {
      console.error('Failed to load admin message count', err);
      setUnreadMessages(0);
    }

    // Fetch other admin data in parallel; failures here should not hide orders.
    try {
      const [soldData, galleryData] = await Promise.all([
        fetchSoldProducts().catch((err) => {
          console.error('Failed to load sold products', err);
          return [];
        }),
        fetchGalleryImages().catch((err) => {
          console.error('Failed to load gallery images', err);
          return [];
        }),
      ]);
      setSoldProducts(soldData);
      setGalleryImages(
        galleryData.map((img: any) => ({
          id: img.id,
          url: img.imageUrl,
          imageId: img.imageId,
          alt: img.alt,
          hidden: img.hidden,
          position: img.position,
          createdAt: img.createdAt,
        }))
      );
    } catch (err) {
      // Already logged per-call; avoid throwing to keep orders visible.
    }

    await loadAdminProducts();
    await loadCustomOrders();
  };

  const loadCustomOrders = async () => {
    setIsLoadingCustomOrders(true);
    if (import.meta.env.DEV) {
      console.debug('[custom orders] fetching');
    }
    try {
      const orders = await getAdminCustomOrders();
      setCustomOrders(orders);
      setCustomOrdersError(null);
      if (import.meta.env.DEV) {
        console.debug('[custom orders] fetched', { count: orders.length, first: orders[0] });
      }
    } catch (err) {
      console.error('Failed to load custom orders', err);
      setCustomOrders([]);
      setCustomOrdersError(err instanceof Error ? err.message : 'Failed to load custom orders');
    } finally {
      setIsLoadingCustomOrders(false);
      if (import.meta.env.DEV) {
        console.debug('[custom orders] state set (post-load)');
      }
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug('[admin auth] logout request failed', error);
      }
    } finally {
      window.location.href = '/admin';
    }
  };

  const handleCreateCustomOrderFromMessage = (message: {
    id: string;
    name: string;
    email: string;
    message: string;
  }) => {
    setCustomOrderDraft({
      customerName: message.name || '',
      customerEmail: message.email || '',
      description: message.message || '',
      messageId: message.id,
    });
    navigate(ADMIN_TAB_TO_PATH.customOrders);
  };

  const handleSelectOrder = (order: AdminOrder) => {
    setSelectedOrder(order);
    if (order.isSeen) return;
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, isSeen: true } : o)));
    setUnseenOrders((prev) => Math.max(0, prev - 1));
    void markOrderSeen(order.id);
  };

  const openShippingModal = (order: AdminOrder) => {
    setShippingModalOrder(order);
  };

  const openShippingSettings = () => {
    setShippingModalOrder(null);
    navigate(ADMIN_TAB_TO_PATH.settings);
  };

  const markOrderSeen = async (orderId: string) => {
    try {
      const res = await adminFetch('/api/admin/orders/seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to mark order as seen');
      }
      const data = await res.json().catch(() => null);
      if (typeof data?.unseenCount === 'number') {
        setUnseenOrders(data.unseenCount);
      }
    } catch (err) {
      console.error('Failed to mark order as seen', err);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, isSeen: false } : o)));
      setUnseenOrders((prev) => prev + 1);
      toast.error("Couldn't mark order as seen");
    }
  };

  const refreshSoldProducts = async () => {
    try {
      const data = await fetchSoldProducts();
      setSoldProducts(data);
    } catch (err) {
      console.error('Failed to refresh sold products', err);
    }
  };

  const loadAdminProducts = async () => {
    setIsLoadingProducts(true);
    try {
      const data = await adminFetchProducts();
      setAdminProducts(data);
    } catch (err) {
      console.error('Failed to load admin products', err);
      setProductStatus({ type: 'error', message: 'Could not load products.' });
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const handleProductFormChange = (field: keyof ProductFormState, value: string | number | boolean) => {
    setProductForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'isOneOff' && value === true) {
        next.quantityAvailable = 1;
      }
      return next;
    });
  };

  const handleEditFormChange = (field: keyof ProductFormState, value: string | number | boolean) => {
    setEditProductForm((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [field]: value };
      if (field === 'isOneOff' && value === true) {
        next.quantityAvailable = 1;
      }
      return next;
    });
  };

  const resetProductForm = () => {
    setProductForm({ ...initialProductForm });
    setProductImages([]);
  };

  const uploadManagedImage = async (
    id: string,
    file: File,
    previewUrl: string,
    setImages: React.Dispatch<React.SetStateAction<ManagedImage[]>>
  ) => {
    debugShopUpload('[shop images] E upload start', {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      endpoint: '/api/admin/images/upload?scope=products',
    });
    setImages((prev) =>
      prev.map((img) =>
        img && img.id === id
          ? {
              ...img,
              uploading: true,
              optimizing: true,
              uploadError: undefined,
            }
          : img
      )
    );
    try {
      const result = await adminUploadImageUnified(file, {
        scope: 'products',
        onStatus: (status) => {
          debugShopUpload('[shop images] C/D status', {
            id,
            name: file.name,
            status,
          });
          setImages((prev) =>
            prev.map((img) =>
              img && img.id === id
                ? {
                    ...img,
                    uploading: true,
                    optimizing: status === 'optimizing',
                  }
                : img
            )
          );
        },
      });
      if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
      setImages((prev) =>
        prev.map((img) =>
          img && img.id === id
            ? {
                ...img,
                url: result.url,
                cloudflareId: result.id,
                imageId: result.imageId ?? null,
                storageKey: result.storageKey,
                file: undefined,
                uploading: false,
                optimizing: false,
                uploadError: undefined,
                previewUrl: undefined,
              }
            : img
        )
      );
      debugShopUpload('[shop images] F upload success', {
        id,
        name: file.name,
        url: result.url,
        imageId: result.imageId ?? null,
        storageKey: result.storageKey ?? null,
      });
      return result;
    } catch (err) {
      const parsed = parseUploadError(err);
      setImages((prev) =>
        prev.map((img) =>
          img && img.id === id
            ? {
                ...img,
                uploading: false,
                optimizing: false,
                uploadError: parsed.message,
              }
            : img
        )
      );
      warnShopUpload('[shop images] F upload failure', {
        id,
        name: file.name,
        httpStatus: parsed.httpStatus ?? null,
        code: parsed.code ?? null,
        message: parsed.message,
      });
      throw err;
    } finally {
      setImages((prev) =>
        prev.map((img) =>
          img && img.id === id && img.uploading
            ? {
                ...img,
                uploading: false,
                optimizing: false,
              }
            : img
        )
      );
      debugShopUpload('[shop images] G transition settled', { id, name: file.name });
    }
  };

  type UploadJob = {
    id: string;
    file: File;
    previewUrl: string;
    slot: number;
  };

  const addImages = async (
    files: File[],
    currentImages: ManagedImage[],
    setImages: React.Dispatch<React.SetStateAction<ManagedImage[]>>,
    slotIndex?: number
  ) => {
    if (!files.length) return;
    const maxSlots = 4;
    const selected = [...files].slice(0, maxSlots);
    const nextImages = currentImages.slice(0, maxSlots);
    const uploads: UploadJob[] = [];

    debugShopUpload('[shop images] A files selected', {
      count: selected.length,
      slotIndex: slotIndex ?? null,
      files: selected.map((file) => ({ name: file.name, type: file.type, size: file.size })),
    });

    const queueAt = (file: File, pos: number) => {
      const existing = nextImages[pos];
      if (existing?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(existing.previewUrl);
      }
      const previewUrl = URL.createObjectURL(file);
      const id = crypto.randomUUID();
      uploads.push({ id, file, previewUrl, slot: pos });
      nextImages[pos] = {
        id,
        url: previewUrl,
        previewUrl,
        file,
        isPrimary: false,
        isNew: true,
        uploading: true,
        optimizing: true,
      };
      debugShopUpload('[shop images] B preview created', {
        id,
        slot: pos,
        name: file.name,
        previewUrl,
      });
    };

    if (slotIndex !== undefined && slotIndex !== null && slotIndex >= 0) {
      const start = Math.min(slotIndex, maxSlots - 1);
      selected.forEach((file, offset) => {
        queueAt(file, Math.min(start + offset, maxSlots - 1));
      });
    } else {
      const emptySlots: number[] = [];
      for (let i = 0; i < maxSlots; i += 1) {
        if (!nextImages[i]) emptySlots.push(i);
      }
      if (emptySlots.length === 0) {
        warnShopUpload('[shop images] no empty slots; skipping queue');
        return;
      }
      selected.slice(0, emptySlots.length).forEach((file, offset) => {
        queueAt(file, emptySlots[offset]);
      });
    }

    if (!nextImages.some((img) => img?.isPrimary)) {
      const first = nextImages.find((img) => !!img);
      if (first) first.isPrimary = true;
    }

    setImages(nextImages);

    debugShopUpload('[shop images] queue prepared', {
      count: uploads.length,
      ids: uploads.map((u) => u.id),
      slots: uploads.map((u) => u.slot),
      names: uploads.map((u) => u.file.name),
    });
    if (!uploads.length) return;

    const runUploads = async () => {
      let attempted = 0;
      let succeeded = 0;
      let failed = 0;

      for (const { id, file, previewUrl } of uploads) {
        attempted += 1;
        debugShopUpload('[shop images] E upload attempt', {
          attempted,
          id,
          name: file.name,
          size: file.size,
          type: file.type,
        });
        try {
          const result = await uploadManagedImage(id, file, previewUrl, setImages);
          debugShopUpload('[shop images] F upload success', {
            name: file.name,
            id: result.id,
            url: result.url,
          });
          debugShopUpload('[shop images] G slot transition', { id, name: file.name, next: 'uploaded' });
          succeeded += 1;
        } catch (err) {
          failed += 1;
          const parsed = parseUploadError(err);
          warnShopUpload('[shop images] F upload failure', {
            id,
            name: file.name,
            httpStatus: parsed.httpStatus ?? null,
            code: parsed.code ?? null,
            message: parsed.message,
          });
          debugShopUpload('[shop images] G slot transition', { id, name: file.name, next: 'failed' });
        }
      }

      let uploadingCountAfter = 0;
      setImages((prev) => {
        const next = prev.map((img) => {
          if (!img) return img;
          if (!img.uploading) return img;
          const hasFinalUrl =
            !!img.url && !img.url.startsWith('blob:') && !img.url.startsWith('data:');
          const hasError = !!img.uploadError;
          if (!hasFinalUrl && !hasError) {
            return {
              ...img,
              uploading: false,
              uploadError: import.meta.env.DEV
                ? 'Upload not started: queue stopped before network request'
                : 'Upload did not complete. Please retry or remove.',
            };
          }
          return { ...img, uploading: false };
        });
        uploadingCountAfter = next.filter((img) => img?.uploading).length;
        debugShopUpload(
          '[shop images] G reconcile',
          next.map((img) => ({
            id: img?.id,
            uploading: img?.uploading,
            hasFile: !!img?.file,
            hasUrl: !!img?.url,
            hasError: !!img?.uploadError,
            error: img?.uploadError || null,
            urlPrefix: img?.url?.slice(0, 40),
          }))
        );
        return next;
      });
      debugShopUpload('[shop images] batch done', { attempted, succeeded, failed, uploadingCountAfter });
    };

    void runUploads();
  };

  const setPrimaryImage = (
    id: string,
    setImages: React.Dispatch<React.SetStateAction<ManagedImage[]>>
  ) => {
    setImages((prev) => prev.map((img) => (img ? { ...img, isPrimary: img.id === id } : img)));
  };

  const moveImage = (
    id: string,
    direction: 'up' | 'down',
    setImages: React.Dispatch<React.SetStateAction<ManagedImage[]>>
  ) => {
    setImages((prev) => {
      const idx = prev.findIndex((img) => img?.id === id);
      if (idx === -1) return prev;
      const swapWith = direction === 'up' ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= prev.length) return prev;
      const newOrder = prev.slice();
      [newOrder[idx], newOrder[swapWith]] = [newOrder[swapWith], newOrder[idx]];
      return newOrder;
    });
  };

  const removeImage = (
    id: string,
    setImages: React.Dispatch<React.SetStateAction<ManagedImage[]>>
  ) => {
    setImages((prev) => {
      const target = prev.find((img) => img?.id === id);
      if (target?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(target.previewUrl);
      }
      if (target?.imageId) {
        void adminDeleteImage(target.imageId).catch((err) => {
          warnShopUpload('[shop images] delete failed', { imageId: target.imageId, err });
        });
      }
      const filtered = prev.filter((img) => img && img.id !== id);
      if (filtered.length > 0 && !filtered.some((img) => img?.isPrimary)) {
        filtered[0].isPrimary = true;
      }
      return filtered;
    });
  };

  const retryManagedImage = async (
    id: string,
    images: ManagedImage[],
    setImages: React.Dispatch<React.SetStateAction<ManagedImage[]>>
  ) => {
    const target = images.find((img) => img?.id === id);
    if (!target) return;
    if (!target.file) {
      setImages((prev) =>
        prev.map((img) =>
          img && img.id === id
            ? {
                ...img,
                uploading: false,
                optimizing: false,
                uploadError: SHOP_UPLOAD_NO_FILE_MESSAGE,
              }
            : img
        )
      );
      warnShopUpload('[shop images] G slot transition', {
        id,
        next: 'failed',
        reason: 'missing-file-reference',
      });
      return;
    }

    let previewUrl = target.previewUrl && target.previewUrl.startsWith('blob:')
      ? target.previewUrl
      : '';
    if (!previewUrl) {
      previewUrl = URL.createObjectURL(target.file);
      setImages((prev) =>
        prev.map((img) =>
          img && img.id === id
            ? {
                ...img,
                previewUrl,
                url: img.url && !img.url.startsWith('blob:') ? img.url : previewUrl,
              }
            : img
        )
      );
      debugShopUpload('[shop images] B preview created (retry)', {
        id,
        name: target.file.name,
        previewUrl,
      });
    }

    try {
      await uploadManagedImage(id, target.file, previewUrl, setImages);
    } catch {
      // uploadManagedImage sets slot-level failure state
    }
  };

  const normalizeImageOrder = (images: ManagedImage[]): ManagedImage[] => {
    if (!images.length) return images;
    const primary = images.find((i) => i?.isPrimary) || images.find((i) => !!i);
    if (!primary) return images;
    return [primary, ...images.filter((i) => i && i.id !== primary.id)];
  };

  const uploadImage = async (file: File): Promise<string> => {
    const result = await adminUploadImageUnified(file, { scope: 'products' });
    return result.url;
  };

  const resolveImageUrls = async (images: ManagedImage[]): Promise<{ imageUrl: string; imageUrls: string[] }> => {
    const ordered = normalizeImageOrder(images);
    const urls: string[] = [];

    for (const img of ordered) {
      if (!img) continue;
      if (img.file) {
        const uploadedUrl = await uploadImage(img.file);
        urls.push(uploadedUrl);
      } else if (img.url) {
        urls.push(img.url);
      }
    }

    const primary = urls[0] || '';
    return { imageUrl: primary, imageUrls: urls };
  };

  const deriveImagePayload = (images: ManagedImage[]): {
    imageUrl: string;
    imageUrls: string[];
    primaryImageId?: string;
    imageIds: string[];
  } => {
    const normalized = normalizeImageOrder(images);
    const urls = normalized
      .filter((img) => img && !img.uploading && !img.uploadError)
      .map((img) => img.url)
      .filter((url) => !!url && !url.startsWith('blob:') && !url.startsWith('data:'));
    const unique = Array.from(new Set(urls));
    const primary = unique[0] || '';
    const rest = primary ? unique.filter((url) => url !== primary) : unique;
    const primaryImage = normalized[0];
    const primaryImageId = primaryImage?.imageId || undefined;
    const imageIds = normalized
      .slice(1)
      .map((img) => img?.imageId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    return { imageUrl: primary, imageUrls: rest, primaryImageId, imageIds };
  };

  const hasPendingUploads = (images: ManagedImage[]) => images.some((img) => img?.uploading);
  const hasUploadErrors = (images: ManagedImage[]) => images.some((img) => img?.uploadError);

  const startEditProduct = (product: Product) => {
    console.debug('[edit modal] open', {
      productId: product?.id,
      image_url: (product as any)?.image_url ?? (product as any)?.imageUrl,
      image_urls_json: (product as any)?.image_urls_json ?? (product as any)?.imageUrlsJson,
      imageUrls: (product as any)?.imageUrls,
    });
    setEditProductId(product.id);
    setEditProductForm(productToFormState(product));
    const urls = product.imageUrls && product.imageUrls.length > 0 ? product.imageUrls : (product.imageUrl ? [product.imageUrl] : []);
      const ids = product.primaryImageId
        ? [product.primaryImageId, ...(product.imageIds || [])]
        : product.imageIds || [];
      const managed: ManagedImage[] = urls.map((url, idx) => ({
        id: `${product.id}-${idx}`,
        url,
        imageId: ids[idx],
        isPrimary: idx === 0,
        isNew: false,
        needsMigration: isBlockedImageUrl(url),
      }));
    console.debug('[edit modal] images hydrated', managed);
    setEditProductImages(managed);
  };

  const cancelEditProduct = () => {
    setEditProductId(null);
    setEditProductForm(null);
    setEditProductImages([]);
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const uploadingCount = productImages.filter((img) => img?.uploading).length;
    const missingUrlCount = productImages.filter(
      (img) =>
        img &&
        !img.uploading &&
        !img.uploadError &&
        (!!img.file || isBlockedImageUrl(img.url) || (!!img.previewUrl && !img.url))
    ).length;
    const failedCount = productImages.filter((img) => img?.uploadError).length;
    console.debug('[shop save] clicked', {
      mode: 'new',
      name: productForm.name,
      price: productForm.price,
      qty: productForm.quantityAvailable,
      categoryCount: productForm.category ? 1 : 0,
      imageCount: productImages.length,
      imageKinds: describeImageKinds(productImages),
      uploadingCount,
      missingUrlCount,
      failedCount,
    });
    setProductSaveState('saving');
    setProductStatus({ type: null, message: '' });

    try {
      if (uploadingCount > 0) {
        console.debug('[shop save] blocked', { uploadingCount, missingUrlCount, failedCount });
        setProductStatus({ type: 'error', message: 'Images are still uploading. Please wait.' });
        setProductSaveState('error');
        setTimeout(() => setProductSaveState('idle'), 1500);
        return;
      }
      if (missingUrlCount > 0) {
        console.debug('[shop save] blocked', { uploadingCount, missingUrlCount, failedCount });
        setProductStatus({ type: 'error', message: 'Some images were not uploaded yet.' });
        setProductSaveState('error');
        setTimeout(() => setProductSaveState('idle'), 1500);
        return;
      }
      if (failedCount > 0) {
        console.debug('[shop save] blocked', { uploadingCount, missingUrlCount, failedCount });
        setProductStatus({ type: 'error', message: 'One or more images failed to upload.' });
        setProductSaveState('error');
        setTimeout(() => setProductSaveState('idle'), 1500);
        return;
      }

      const manualUrls = mergeManualImages(productForm);
      const base64Urls = findBase64Urls([
        ...manualUrls.imageUrls,
        ...productImages.map((img) => img?.url).filter((url): url is string => !!url),
      ]);
      const needsMigration = productImages.some((img) => img?.needsMigration);
      if (needsMigration || base64Urls.length > 0) {
        console.error('[shop save] blocked: invalid image URLs detected. Re-upload images using Cloudflare upload.', {
          base64Count: base64Urls.length,
        });
        throw new Error('Images must be uploaded first (no blob/data URLs).');
      }
      const uploaded = await resolveImageUrls(productImages);
        const mergedImages = mergeImages(uploaded, manualUrls);
        const imageIdsPayload = deriveImagePayload(productImages);

        const payload = {
          ...formStateToPayload(productForm),
          imageUrl: mergedImages.imageUrl,
          imageUrls: mergedImages.imageUrls,
          primaryImageId: imageIdsPayload.primaryImageId,
          imageIds: imageIdsPayload.imageIds,
        };

      const payloadBytes = new Blob([JSON.stringify(payload)]).size;
      console.debug('[shop save] request', { url: '/api/admin/products', method: 'POST', bytes: payloadBytes });
      if (payloadBytes > 900 * 1024) {
        console.warn('[shop save] blocked: payload too large', { bytes: payloadBytes });
        throw new Error('Payload too large (likely base64).');
      }

      const created = await adminCreateProduct(payload);
      console.debug('[shop save] success', {
        mode: 'new',
        productId: created?.id ?? null,
      });
      if (created) {
        setProductStatus({ type: 'success', message: 'Product saved successfully.' });
        resetProductForm();
        setProductImages([]);
        await loadAdminProducts();
        setProductSaveState('success');
        setTimeout(() => setProductSaveState('idle'), 1500);
      } else {
        setProductSaveState('error');
        setProductStatus({ type: 'error', message: 'Please fill out all required fields.' });
      }
    } catch (err) {
      console.error('Create product failed', err);
      setProductStatus({ type: 'error', message: err instanceof Error ? err.message : 'Create product failed.' });
      setProductSaveState('error');
      setTimeout(() => setProductSaveState('idle'), 1500);
    }
  };

  const handleUpdateProduct = async (e: React.FormEvent): Promise<boolean> => {
    e.preventDefault();
    if (!editProductId || !editProductForm) return false;
    console.debug('[shop save] clicked', {
      mode: 'edit',
      name: editProductForm.name,
      price: editProductForm.price,
      qty: editProductForm.quantityAvailable,
      categoryCount: editProductForm.category ? 1 : 0,
      imageCount: editProductImages.length,
      imageKinds: describeImageKinds(editProductImages),
    });
    setEditProductSaveState('saving');
    setProductStatus({ type: null, message: '' });

    try {
      if (hasPendingUploads(editProductImages)) {
        console.debug('[shop save] blocked', { reason: 'images-uploading' });
        setProductStatus({ type: 'error', message: 'Images are still uploading. Please wait.' });
        setEditProductSaveState('error');
        setTimeout(() => setEditProductSaveState('idle'), 1500);
        return false;
      }
      if (hasUploadErrors(editProductImages)) {
        console.debug('[shop save] blocked', { reason: 'image-upload-error' });
        setProductStatus({ type: 'error', message: 'One or more images failed to upload.' });
        setEditProductSaveState('error');
        setTimeout(() => setEditProductSaveState('idle'), 1500);
        return false;
      }

      const base64Urls = findBase64Urls(
        editProductImages.map((img) => img?.url).filter((url): url is string => !!url)
      );
      const needsMigration = editProductImages.some((img) => img?.needsMigration);
      if (needsMigration || base64Urls.length > 0) {
        console.error('[shop save] blocked: invalid image URLs detected. Re-upload images using Cloudflare upload.', {
          base64Count: base64Urls.length,
        });
        throw new Error('Images must be uploaded first (no blob/data URLs).');
      }
      const mergedImages = deriveImagePayload(editProductImages);

      const payload = {
        ...formStateToPayload(editProductForm),
        imageUrl: mergedImages.imageUrl || '',
        imageUrls: mergedImages.imageUrls,
        primaryImageId: mergedImages.primaryImageId,
        imageIds: mergedImages.imageIds,
      };

      const payloadBytes = new Blob([JSON.stringify(payload)]).size;
      console.debug('[shop save] request', { url: `/api/admin/products/${editProductId}`, method: 'PUT', bytes: payloadBytes });
      if (payloadBytes > 900 * 1024) {
        console.warn('[shop save] blocked: payload too large', { bytes: payloadBytes });
        throw new Error('Payload too large (likely base64).');
      }

      const updated = await adminUpdateProduct(editProductId, payload);
      console.debug('[shop save] success', {
        mode: 'edit',
        productId: updated?.id ?? null,
      });
      if (updated) {
        setProductStatus({ type: 'success', message: 'Product updated.' });
        setEditProductId(null);
        setEditProductForm(null);
        setEditProductImages([]);
        await loadAdminProducts();
        setEditProductSaveState('success');
        setTimeout(() => setEditProductSaveState('idle'), 1500);
        return true;
      } else {
        setProductStatus({ type: 'error', message: 'Update failed. Please try again.' });
        setEditProductSaveState('error');
        setTimeout(() => setEditProductSaveState('idle'), 1500);
        return false;
      }
    } catch (err) {
      console.error('Update product failed', err);
      setProductStatus({ type: 'error', message: err instanceof Error ? err.message : 'Update failed. Please try again.' });
      setEditProductSaveState('error');
      setTimeout(() => setEditProductSaveState('idle'), 1500);
      return false;
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      await adminDeleteProduct(id);
      await loadAdminProducts();
    } catch (err) {
      console.error('Delete product failed', err);
      setProductStatus({ type: 'error', message: 'Delete failed.' });
    }
  };

  useEffect(() => {
    if (!productStatus.type) return;
    const timeout = setTimeout(() => {
      setProductStatus({ type: null, message: '' });
    }, 3000);
    return () => clearTimeout(timeout);
  }, [productStatus]);


  return (
    <>
    <div className="admin-dashboard min-h-screen bg-gradient-to-b from-[var(--warm-linen)] via-[var(--sand)] to-[var(--linen)] text-charcoal py-12 overflow-x-hidden">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="lux-heading text-3xl">Admin Dashboard</h1>
          <button
            onClick={handleLogout}
            className="lux-button--ghost px-4 py-2 text-[10px]"
          >
            Logout
          </button>
        </div>

          <div className="mb-6 border-b border-driftwood/50 pb-2">
          <nav className="flex gap-3 justify-start md:justify-center overflow-x-auto overflow-y-visible whitespace-nowrap -mx-4 px-4 py-2 md:mx-0 md:px-0">
            {ADMIN_TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              const badge = tab.key === 'orders' ? unseenOrders : tab.key === 'messages' ? unreadMessages : tab.badge;
              return (
                <button
                  key={tab.key}
                  onClick={() => navigate(ADMIN_TAB_TO_PATH[tab.key])}
                  className={`relative inline-flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-[0.24em] transition-all ${
                    isActive
                      ? 'lux-button shadow-none'
                      : 'lux-button--ghost shadow-none'
                  }`}
                >
                  {tab.label}
                  <AdminTabBadge count={badge} isActive={isActive} />
                </button>
              );
            })}
          </nav>
        </div>

        {activeTab === 'orders' && (
          <AdminOrdersTab
            searchQuery={searchQuery}
            filteredOrders={filteredOrders}
            onSearchChange={setSearchQuery}
            onSelectOrder={handleSelectOrder}
            onOpenShipping={openShippingModal}
            loading={isLoadingOrders}
            error={ordersError}
          />
        )}

        {activeTab === 'sold' && <AdminSoldTab soldProducts={soldProducts} />}

        {activeTab === 'shop' && (
          <AdminShopTab
            productStatus={productStatus}
            productForm={productForm}
            productImages={productImages}
            editProductImages={editProductImages}
            adminProducts={adminProducts}
            editProductId={editProductId}
            editProductForm={editProductForm}
            productSaveState={productSaveState}
            editProductSaveState={editProductSaveState}
            isLoadingProducts={isLoadingProducts}
            productImageFileInputRef={productImageFileInputRef}
            editProductImageFileInputRef={editProductImageFileInputRef}
            onCreateProduct={handleCreateProduct}
            onProductFormChange={handleProductFormChange}
            onResetProductForm={resetProductForm}
            onAddProductImages={(files, slotIndex) => addImages(files, productImages, setProductImages, slotIndex)}
            onSetPrimaryProductImage={(id) => setPrimaryImage(id, setProductImages)}
            onRemoveProductImage={(id) => removeImage(id, setProductImages)}
            onRetryProductImage={(id) => void retryManagedImage(id, productImages, setProductImages)}
            onAddEditProductImages={(files, slotIndex) => addImages(files, editProductImages, setEditProductImages, slotIndex)}
            onSetPrimaryEditImage={(id) => setPrimaryImage(id, setEditProductImages)}
            onMoveEditImage={(id, dir) => moveImage(id, dir, setEditProductImages)}
            onRemoveEditImage={(id) => removeImage(id, setEditProductImages)}
            onRetryEditImage={(id) => void retryManagedImage(id, editProductImages, setEditProductImages)}
            onEditFormChange={handleEditFormChange}
            onUpdateProduct={handleUpdateProduct}
            onCancelEditProduct={cancelEditProduct}
            onStartEditProduct={startEditProduct}
            onDeleteProduct={handleDeleteProduct}
          />
        )}

        {activeTab === 'messages' && (
          <AdminMessagesTab
            messages={messages}
            onCreateCustomOrderFromMessage={handleCreateCustomOrderFromMessage}
            onUnreadCountChange={setUnreadMessages}
          />
        )}

        {activeTab === 'promotions' && <AdminPromotionsTab />}

        {activeTab === 'settings' && <AdminShippingSettingsTab />}

        {activeTab === 'customOrders' && (
          <AdminCustomOrdersTab
            allCustomOrders={customOrders}
            onCreateOrder={async (order) => {
              // Previously we set the global loading flag and refetched the table, causing a full-table flicker.
              // We now append the created order locally for a seamless UX.
              try {
                setCustomOrdersError(null);
                const created = await createAdminCustomOrder({
                  customerName: order.customerName,
                  customerEmail: order.customerEmail,
                  description: order.description,
                  imageUrl: order.imageUrl ?? null,
                  imageId: order.imageId ?? null,
                  imageStorageKey: order.imageStorageKey ?? null,
                  amount: order.amount ? Math.round(Number(order.amount) * 100) : undefined,
                  shippingCents: typeof order.shippingCents === 'number' ? order.shippingCents : undefined,
                  showOnSoldProducts: order.showOnSoldProducts === true,
                  messageId: order.messageId ?? null,
                });
                setCustomOrders((prev) => {
                  if (prev.some((o) => o.id === created.id)) return prev;
                  return [created, ...prev];
                });
                setCustomOrderDraft(null);
              } catch (err) {
                console.error('Failed to create custom order', err);
                setCustomOrdersError(err instanceof Error ? err.message : 'Failed to create custom order');
              }
            }}
            onUpdateOrder={async (orderId, patch) => {
              try {
                await updateAdminCustomOrder(orderId, patch);
                setCustomOrders((prev) =>
                  prev.map((order) =>
                    order.id === orderId ? { ...order, ...patch } : order
                  )
                );
              } catch (err) {
                console.error('Failed to update custom order', err);
                setCustomOrdersError(err instanceof Error ? err.message : 'Failed to update custom order');
                throw err;
              }
            }}
            initialDraft={customOrderDraft}
            onDraftConsumed={() => setCustomOrderDraft(null)}
            isLoading={isLoadingCustomOrders}
            error={customOrdersError}
            onReloadOrders={loadCustomOrders}
            onArchiveOrder={async (orderId: string) => {
              setCustomOrdersError(null);
              try {
                await archiveAdminCustomOrder(orderId);
                setCustomOrders((prev) => prev.filter((order) => order.id !== orderId));
              } catch (err) {
                console.error('Failed to archive custom order', err);
                throw err;
              }
            }}
            onSendPaymentLink={async (orderId: string) => {
              try {
                setCustomOrdersError(null);
                const hadLink = customOrders.some((order) => order.id === orderId && !!order.paymentLink);
                const result = await sendAdminCustomOrderPaymentLink(orderId);
                setCustomOrders((prev) =>
                  prev.map((order) =>
                    order.id === orderId
                      ? { ...order, paymentLink: result.paymentLink || order.paymentLink }
                      : order
                  )
                );
                toast.success(hadLink ? 'Payment link resent.' : 'Payment link sent.');
              } catch (err) {
                console.error('Failed to send payment link', err);
                setCustomOrdersError(err instanceof Error ? err.message : 'Failed to send payment link');
              }
            }}
          />
        )}

        {activeTab === 'images' && (
          <div className="space-y-10">
            <AdminHomeTab />
            <AdminCustomOrderExamplesTab />

            <AdminGalleryTab
              images={galleryImages}
              onChange={setGalleryImages}
              onSave={async () => {
                setGallerySaveState('saving');
                try {
                  const hasPending = galleryImages.some((img) => img.isUploading);
                  const hasErrors = galleryImages.some((img) => img.uploadError);
                  const missingUrl = galleryImages.some((img) => !img.url);
                  const hasInvalid = galleryImages.some((img) => img.url?.startsWith('blob:') || img.url?.startsWith('data:'));
                  if (hasPending) throw new Error('Gallery images are still uploading.');
                  if (hasErrors) throw new Error('Fix failed gallery uploads before saving.');
                  if (missingUrl) throw new Error('Some images haven’t finished uploading.');
                  if (hasInvalid) throw new Error('Gallery images must be uploaded first (no blob/data URLs).');
                  const normalized = galleryImages.map((img, idx) => ({
                    id: img.id,
                    url: img.url,
                    imageId: img.imageId,
                    alt: img.alt,
                    hidden: !!img.hidden,
                    position: idx,
                    createdAt: img.createdAt || new Date().toISOString(),
                  }));
                  if (import.meta.env.DEV) {
                    console.debug('[admin gallery] saving', {
                      count: normalized.length,
                      first: normalized[0],
                      payloadBytes: JSON.stringify({ images: normalized }).length,
                    });
                  }
                  const saved = await saveGalleryImages(normalized);
                  setGalleryImages(
                    saved.map((img: GalleryImage) => ({
                      id: img.id,
                      url: img.imageUrl,
                      imageId: img.imageId,
                      alt: img.alt,
                      hidden: img.hidden,
                      position: img.position,
                      createdAt: img.createdAt,
                    }))
                  );
                  setGallerySaveState('success');
                  setTimeout(() => setGallerySaveState('idle'), 1500);
                } catch (err) {
                  console.error('Failed to save gallery images', err);
                  setGallerySaveState('error');
                }
              }}
              saveState={gallerySaveState}
              fileInputRef={fileInputRef}
              title="Gallery Management"
              description="Add, hide, or remove gallery images."
            />
          </div>
        )}
      </div>
    </div>

        {selectedOrder && (
        <OrderDetailsModal
          open={!!selectedOrder}
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onOpenShippingLabels={(order) => {
            setSelectedOrder(null);
            openShippingModal(order);
          }}
        />
        )}
      {shippingModalOrder && (
        <ShippingLabelsModal
          open={!!shippingModalOrder}
          order={shippingModalOrder}
          onClose={() => setShippingModalOrder(null)}
          onOpenSettings={openShippingSettings}
        />
      )}
    </>
  );
}

function productToFormState(product: Product): ProductFormState {
  return {
    name: product.name,
    description: product.description,
    price: product.priceCents ? (product.priceCents / 100).toFixed(2) : '',
    category: normalizeCategoryValue(product.type || (product as any).category) || '',
    imageUrl: product.imageUrl,
    imageUrls: product.imageUrls ? product.imageUrls.join(',') : '',
    quantityAvailable: product.quantityAvailable ?? 1,
    isOneOff: product.oneoff,
    isActive: product.visible,
    collection: product.collection || '',
    stripePriceId: product.stripePriceId || '',
    stripeProductId: product.stripeProductId || '',
  };
}

function formStateToPayload(state: ProductFormState) {
  const priceNumber = Number(state.price || 0);
  const parsedImages = parseImageUrls(state.imageUrls);
  const quantityAvailable = state.isOneOff ? 1 : Math.max(1, Number(state.quantityAvailable) || 1);
  const category = normalizeCategoryValue(state.category);

  return {
    name: state.name.trim(),
    description: state.description.trim(),
    priceCents: Math.round(priceNumber * 100),
    category,
    categories: category ? [category] : undefined,
    imageUrl: state.imageUrl.trim(),
    imageUrls: parsedImages,
    quantityAvailable,
    isOneOff: state.isOneOff,
    isActive: state.isActive,
    collection: state.collection?.trim() || undefined,
    stripePriceId: state.stripePriceId?.trim() || undefined,
    stripeProductId: state.stripeProductId?.trim() || undefined,
  };
}

function parseImageUrls(value: string): string[] {
  if (!value) return [];
  return value
    .split(/[\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function mergeManualImages(state: ProductFormState): { imageUrl: string; imageUrls: string[] } {
  const extra = parseImageUrls(state.imageUrls);
  const combined = [state.imageUrl, ...extra].filter(Boolean);
  return {
    imageUrl: combined[0] || '',
    imageUrls: combined,
  };
}

function mergeImages(
  primarySet: { imageUrl: string; imageUrls: string[] },
  secondary: { imageUrl: string; imageUrls: string[] }
): { imageUrl: string; imageUrls: string[] } {
  const merged = [...(primarySet.imageUrls || [])];
  for (const url of secondary.imageUrls || []) {
    if (!merged.includes(url)) merged.push(url);
  }
  const imageUrl = primarySet.imageUrl || secondary.imageUrl || merged[0] || '';
  if (imageUrl && !merged.includes(imageUrl)) {
    merged.unshift(imageUrl);
  }
  return { imageUrl, imageUrls: merged };
}

function isBlockedImageUrl(value?: string) {
  if (!value) return false;
  return value.startsWith('data:image/') || value.includes(';base64,') || value.startsWith('blob:');
}

function describeImageKinds(images: ManagedImage[]) {
  return images.map((img) => ({
    isDataUrl: isBlockedImageUrl(img.url),
    urlPrefix: typeof img.url === 'string' ? img.url.slice(0, 30) : null,
    previewPrefix: img.previewUrl ? img.previewUrl.slice(0, 30) : null,
    needsMigration: !!img.needsMigration,
  }));
}

function findBase64Urls(urls: string[]) {
  return urls.filter((url) => isBlockedImageUrl(url));
}

