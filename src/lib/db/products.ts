import type { Product } from '../types';
import { getLocalProducts } from './localProducts';
import { mockProducts } from './mockData';
const PRODUCTS_API_PATH = '/api/products';

async function fetchProductsFromApi(): Promise<Product[] | null> {
  try {
    const response = await fetch(PRODUCTS_API_PATH, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Products API responded with ${response.status}`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.products)) {
      throw new Error('Products API response missing products array');
    }

    return data.products as Product[];
  } catch (error) {
    console.error('Products API failed', error);
    throw error;
  }
}

export async function getActiveProducts(filters?: {
  type?: string;
  collection?: string;
  visible?: boolean;
}): Promise<Product[]> {
  let products: Product[] = [];

  products = await fetchProductsFromApi();

  if (filters?.visible !== undefined) {
    products = products.filter((p) => p.visible === filters.visible);
  }

  if (filters?.type) {
    products = products.filter((p) => p.type === filters.type);
  }

  if (filters?.collection) {
    products = products.filter((p) => p.collection === filters.collection);
  }

  return products;
}

export async function getProductById(productId: string): Promise<Product | null> {
  try {
    const response = await fetch(`/api/products/${productId}`, {
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      const data = await response.json();
      if (data?.product) return data.product as Product;
    }
  } catch (error) {
    console.error('Falling back to mock product by id', error);
  }

  const productFromLocal = getLocalProducts().find(
    (p) => p.id === productId || p.stripeProductId === productId
  );
  if (productFromLocal) return productFromLocal;

  const product = mockProducts.find((p) => p.id === productId || p.stripeProductId === productId);
  return product || null;
}

export async function getRelatedProducts(type: string, excludeProductId: string): Promise<Product[]> {
  const products = getLocalProducts();
  const dataset = products.length ? products : mockProducts;
  return dataset.filter(
    (p) =>
      p.type === type && p.id !== excludeProductId && p.stripeProductId !== excludeProductId && !p.isSold
  );
}

export async function getSoldProducts(): Promise<Product[]> {
  try {
    const response = await fetch(`${PRODUCTS_API_PATH}?filter=sold`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Products API responded with ${response.status}`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.products)) {
      throw new Error('Products API response missing products array');
    }

    return data.products as Product[];
  } catch (error) {
    console.error('Sold products API failed', error);
    throw error;
  }
}
