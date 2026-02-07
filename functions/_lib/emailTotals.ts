import type Stripe from 'stripe';
import { extractShippingCentsFromLineItems, isShippingLineItem } from '../api/lib/shipping';

export type LineItemLike = Pick<
  Stripe.LineItem,
  'description' | 'amount_total' | 'amount_subtotal' | 'price' | 'quantity'
> & {
  price?: Stripe.Price | null;
  quantity?: number | null;
};

export type EmailTotalsArgs = {
  order?: {
    total_cents?: number | null;
    amount_total_cents?: number | null;
    subtotal_cents?: number | null;
    amount_subtotal_cents?: number | null;
    amount_cents?: number | null;
    shipping_cents?: number | null;
    amount_shipping_cents?: number | null;
    shipping_amount?: number | null;
    amount_tax_cents?: number | null;
    amount_discount_cents?: number | null;
  } | null;
  session?: Stripe.Checkout.Session | null;
  lineItems?: LineItemLike[];
  shippingCentsFromContext?: number | null;
};

type DeriveShippingResult = {
  shippingCents: number;
  source: string;
};

export function deriveShippingCentsFromSession(args: {
  session?: Stripe.Checkout.Session | null;
  lineItems?: LineItemLike[];
  shippingCentsFromContext?: number | null;
}): DeriveShippingResult {
  const { session } = args;
  const lineItems = args.lineItems || [];
  const clamp = (value: number) => Math.max(0, Math.round(value));

  const ctx = args.shippingCentsFromContext;
  if (Number.isFinite(ctx) && Number(ctx) > 0) {
    return { shippingCents: clamp(Number(ctx)), source: 'context' };
  }

  const fromTotalDetails = (session?.total_details as any)?.amount_shipping;
  if (Number.isFinite(fromTotalDetails)) {
    return { shippingCents: clamp(Number(fromTotalDetails)), source: 'session.total_details.amount_shipping' };
  }

  const shippingFromLines = extractShippingCentsFromLineItems(lineItems);
  if (Number.isFinite(shippingFromLines) && Number(shippingFromLines) >= 0) {
    return { shippingCents: clamp(Number(shippingFromLines)), source: 'shipping_line_items' };
  }

  return { shippingCents: 0, source: 'fallback_zero' };
}

/**
 * Canonical breakdown for email totals:
 * - itemsSubtotalCents: non-shipping line items only
 * - shippingCents: shipping only
 * - taxCents: tax amount (if any)
 * - discountCents: discounts (if any)
 * - totalCents: Stripe session total
 */
export function resolveEmailMoneyTotals(args: EmailTotalsArgs) {
  const session = args.session;
  const lineItems = args.lineItems || [];

  const itemsSubtotalFromLines = sumNonShippingLines(lineItems);

  const derivedShipping = deriveShippingCentsFromSession({
    session,
    lineItems,
    shippingCentsFromContext: args.shippingCentsFromContext,
  });
  const shippingCents =
    coalesceCents([
      derivedShipping.shippingCents,
      args.order?.amount_shipping_cents,
      args.order?.shipping_cents,
      args.order?.shipping_amount,
    ]) ?? 0;

  const itemsSubtotalCents =
    coalesceCents([
      itemsSubtotalFromLines,
      args.order?.subtotal_cents,
      args.order?.amount_subtotal_cents,
      args.order?.amount_cents,
      (session as any)?.amount_subtotal,
    ]) ?? null;

  const totalCents =
    coalesceCents([
      args.order?.amount_total_cents,
      args.order?.total_cents,
      args.order?.amount_cents,
      (session as any)?.amount_total,
    ]) || 0;

  const taxCents =
    coalesceCents([
      args.order?.amount_tax_cents,
      (session?.total_details as any)?.amount_tax,
    ]) ?? 0;

  const discountCents =
    coalesceCents([
      args.order?.amount_discount_cents,
      (session?.total_details as any)?.amount_discount,
    ]) ?? 0;

  const normalizedSubtotal = itemsSubtotalCents ?? 0;

  return {
    itemsSubtotalCents: normalizedSubtotal,
    shippingCents,
    taxCents,
    discountCents,
    totalCents,
    shippingSource: derivedShipping.source,
  };
}

// Backwards-compatible wrappers; both share the same canonical breakdown.
export function resolveStandardEmailTotals(args: EmailTotalsArgs) {
  const totals = resolveEmailMoneyTotals(args);
  return {
    subtotalCents: totals.itemsSubtotalCents,
    shippingCents: totals.shippingCents,
    taxCents: totals.taxCents,
    discountCents: totals.discountCents,
    totalCents: totals.totalCents,
    shippingSource: totals.shippingSource,
  };
}

export function resolveCustomEmailTotals(args: EmailTotalsArgs) {
  const totals = resolveEmailMoneyTotals(args);
  return {
    subtotalCents: totals.itemsSubtotalCents,
    shippingCents: totals.shippingCents,
    taxCents: totals.taxCents,
    discountCents: totals.discountCents,
    totalCents: totals.totalCents,
    shippingSource: totals.shippingSource,
  };
}

function coalesceCents(values: Array<number | null | undefined>): number | null {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (Number.isFinite(Number(v))) return Math.round(Number(v));
  }
  return null;
}

function sumNonShippingLines(lineItems: LineItemLike[]): number | null {
  if (!lineItems.length) return null;
  const total = lineItems
    .filter((line) => !isShippingLineItem(line))
    .reduce((sum, line) => {
      const qty = line.quantity ?? 1;
      const lineTotal =
        line.amount_subtotal ??
        line.amount_total ??
        ((line.price?.unit_amount ?? 0) * qty);
      return sum + Math.round(Number(lineTotal || 0));
    }, 0);
  return Number.isFinite(total) ? total : null;
}
