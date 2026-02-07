import type Stripe from 'stripe';

type LineItemLike = Pick<Stripe.LineItem, 'description' | 'amount_total' | 'amount_subtotal' | 'quantity' | 'price'> & {
  price?: Stripe.Price | null;
  metadata?: Record<string, string> | null;
};

const includesShipping = (value?: string | null) =>
  typeof value === 'string' && value.toLowerCase().includes('shipping');

const getProductName = (line: LineItemLike): string => {
  const price = line.price as Stripe.Price | null | undefined;
  const productObj =
    price?.product && typeof price.product !== 'string'
      ? (price.product as Stripe.Product)
      : null;
  return (
    (price as any)?.product_data?.name ||
    productObj?.name ||
    ''
  );
};

const hasShippingMetadata = (line: LineItemLike): boolean => {
  const lineMeta = line.metadata || {};
  if (lineMeta.mv_line_type === 'shipping') return true;
  const priceMeta = (line.price as any)?.metadata || {};
  if (priceMeta.mv_line_type === 'shipping') return true;
  const productMeta =
    line.price?.product && typeof line.price.product !== 'string'
      ? (line.price.product as Stripe.Product).metadata || {}
      : {};
  return productMeta?.mv_line_type === 'shipping';
};

export const isShippingLineItem = (line: LineItemLike): boolean => {
  if (hasShippingMetadata(line)) return true;
  if (includesShipping(line.description || '')) return true;
  const productName = getProductName(line);
  if (includesShipping(productName)) return true;
  const productDataName = (line.price as any)?.product_data?.name;
  if (includesShipping(productDataName)) return true;
  return false;
};

export const extractShippingCentsFromLineItems = (lineItems: LineItemLike[]): number => {
  if (!lineItems.length) return 0;
  return lineItems
    .filter(isShippingLineItem)
    .reduce((sum, line) => {
      const quantity = line.quantity ?? 1;
      const lineTotal =
        line.amount_subtotal ??
        line.amount_total ??
        ((line.price?.unit_amount ?? 0) * quantity);
      return sum + Math.round(Number(lineTotal || 0));
    }, 0);
};

export const filterNonShippingLineItems = <T extends LineItemLike>(lineItems: T[]): T[] =>
  lineItems.filter((line) => !isShippingLineItem(line));
