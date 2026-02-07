export interface EmbeddedCheckoutSession {
  clientSecret: string;
  sessionId: string;
  promo?: CheckoutPromoSummary | null;
}

export interface CheckoutPromoSummary {
  code: string | null;
  percentOff: number;
  freeShippingApplied: boolean;
  source: string | null;
  codePercentOff: number | null;
  codeScope: 'global' | 'categories' | null;
  codeCategorySlugs: string[];
  autoPromoId: string | null;
}

export interface CheckoutSessionInfo {
  id: string;
  amountTotal: number | null;
  amountSubtotal: number | null;
  amountShipping: number | null;
  amountTax: number | null;
  amountDiscount: number | null;
  currency: string | null;
  paymentStatus?: string | null;
  customerEmail: string | null;
  paymentMethodType?: string | null;
  paymentMethodLabel?: string | null;
  paymentLast4?: string | null;
  paymentBrand?: string | null;
  shipping: {
    name: string | null;
    address: Record<string, string | null> | null;
  } | null;
  lineItems: {
    productName: string;
    quantity: number;
    unitAmount?: number | null;
    lineSubtotal?: number | null;
    lineTotal: number;
    imageUrl?: string | null;
    oneOff?: boolean;
    isShipping?: boolean;
    stripeProductId?: string | null;
    optionGroupLabel?: string | null;
    optionValue?: string | null;
  }[];
  cardLast4: string | null;
  cardBrand?: string | null;
}

export async function createEmbeddedCheckoutSession(
  items: { productId: string; quantity: number; optionGroupLabel?: string | null; optionValue?: string | null }[],
  promoCode?: string
): Promise<EmbeddedCheckoutSession> {
  const normalizedPromoCode = typeof promoCode === 'string' ? promoCode.trim() : '';
  const payload = normalizedPromoCode ? { items, promoCode: normalizedPromoCode } : { items };
  const response = await fetch('/api/checkout/create-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  let data: any = {};
  try {
    data = await response.json();
  } catch {
    // ignore
  }
  console.log('create-session response', response.status, data);

  if (!response.ok) {
    const message = (data && data.error) || (await safeMessage(response));
    throw new Error(message || 'Unable to start checkout');
  }

  if (!data?.clientSecret) {
    throw new Error('Missing client secret from checkout session');
  }

  if (!data?.sessionId) {
    throw new Error('Missing session id from checkout session');
  }

  return {
    clientSecret: data.clientSecret as string,
    sessionId: data.sessionId as string,
    promo: (data?.promo as CheckoutPromoSummary) ?? null,
  };
}

export async function fetchCheckoutSession(sessionId: string): Promise<CheckoutSessionInfo | null> {
  const response = await fetch(`/api/checkout/session/${sessionId}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const message = await safeMessage(response);
    throw new Error(message || 'Unable to fetch checkout session');
  }

  const data = await response.json();
  return {
    id: data.id as string,
    amountTotal: data.amount_total ?? null,
    amountSubtotal: data.amount_subtotal ?? null,
    amountShipping: data.amount_shipping ?? null,
    amountTax: data.amount_tax ?? null,
    amountDiscount: data.amount_discount ?? null,
    currency: data.currency ?? null,
    paymentStatus: data.payment_status ?? null,
    customerEmail: data.customer_email ?? null,
    paymentMethodType: data.payment_method_type ?? null,
    paymentMethodLabel: data.payment_method_label ?? null,
    paymentLast4: data.card_last4 ?? data.payment_last4 ?? null,
    paymentBrand: data.card_brand ?? data.payment_brand ?? null,
    shipping: data.shipping ?? null,
    lineItems: Array.isArray(data.line_items)
      ? data.line_items.map((li: any) => ({
          productName: li.productName ?? 'Item',
          quantity: li.quantity ?? 0,
          unitAmount: li.unitAmount ?? null,
          lineSubtotal: li.lineSubtotal ?? null,
          lineTotal: li.lineTotal ?? 0,
          imageUrl: li.imageUrl ?? li.image_url ?? null,
          oneOff: li.oneOff ?? false,
          isShipping: li.isShipping ?? false,
          stripeProductId: li.stripeProductId ?? null,
          optionGroupLabel: li.optionGroupLabel ?? null,
          optionValue: li.optionValue ?? null,
        }))
      : [],
    cardLast4: data.card_last4 ?? null,
    cardBrand: data.card_brand ?? null,
  };
}

const safeMessage = async (response: Response): Promise<string | null> => {
  try {
    const data = await response.json();
    if (data?.error) return data.error as string;
  } catch {
    // ignore parse errors
  }
  return null;
};
