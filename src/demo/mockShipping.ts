export type MockQuote = {
  id: string;
  courier: string;
  service: string;
  deliveryDays: string;
  priceCents: number;
  currency: 'USD';
  includesTracking: boolean;
};

export type MockLabelPurchase = {
  labelId: string;
  purchasedAt: string;
  trackingNumber: string;
  labelUrl: string;
};

type MockQuoteInput = {
  weightLb: number;
  boxPresetName?: string;
  dimsIn?: { l: number; w: number; h: number } | null;
};

type MockBuyLabelInput = {
  quoteId: string;
  orderId: string;
  parcelIndex: number;
};

const DEMO_LABEL_URL = '/demo-assets/labels/demo-label.pdf';

const QUOTE_TEMPLATES: Array<Omit<MockQuote, 'priceCents'> & { basePriceCents: number }> = [
  {
    id: 'demo-usps-ground-advantage',
    courier: 'USPS',
    service: 'Ground Advantage',
    deliveryDays: '3-5 days',
    basePriceCents: 845,
    currency: 'USD',
    includesTracking: true,
  },
  {
    id: 'demo-ups-ground',
    courier: 'UPS',
    service: 'Ground',
    deliveryDays: '2-4 days',
    basePriceCents: 1290,
    currency: 'USD',
    includesTracking: true,
  },
  {
    id: 'demo-fedex-home',
    courier: 'FedEx',
    service: 'Home Delivery',
    deliveryDays: '2-3 days',
    basePriceCents: 1575,
    currency: 'USD',
    includesTracking: true,
  },
  {
    id: 'demo-dhl-ecommerce',
    courier: 'DHL',
    service: 'eCommerce Ground',
    deliveryDays: '4-7 days',
    basePriceCents: 795,
    currency: 'USD',
    includesTracking: true,
  },
];

const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const delayFromSeed = (seed: string, minMs: number, maxMs: number): number => {
  const span = Math.max(1, maxMs - minMs + 1);
  return minMs + (hashString(seed) % span);
};

const normalizeWeight = (weightLb: number): number => {
  if (!Number.isFinite(weightLb) || weightLb <= 0) return 0.1;
  return Math.max(0.1, weightLb);
};

const calculateSurchargeCents = (input: MockQuoteInput): number => {
  const weight = normalizeWeight(input.weightLb);
  const tier =
    weight <= 1 ? 0 : weight <= 3 ? 65 : weight <= 6 ? 145 : weight <= 10 ? 295 : 495;
  const dims = input.dimsIn;
  const volumeSurcharge =
    dims && dims.l > 0 && dims.w > 0 && dims.h > 0 && dims.l * dims.w * dims.h > 1000 ? 85 : 0;
  return tier + volumeSurcharge;
};

export async function getMockQuotes(input: MockQuoteInput): Promise<MockQuote[]> {
  const seed = JSON.stringify({
    weight: normalizeWeight(input.weightLb).toFixed(2),
    boxPresetName: input.boxPresetName || '',
    dims: input.dimsIn || null,
  });
  await wait(delayFromSeed(seed, 500, 900));

  const surchargeCents = calculateSurchargeCents(input);
  return QUOTE_TEMPLATES.map((template) => ({
    id: template.id,
    courier: template.courier,
    service: template.service,
    deliveryDays: template.deliveryDays,
    priceCents: template.basePriceCents + surchargeCents,
    currency: 'USD',
    includesTracking: template.includesTracking,
  }));
}

export async function buyMockLabel(input: MockBuyLabelInput): Promise<MockLabelPurchase> {
  const seed = `${input.orderId}|${input.parcelIndex}|${input.quoteId}`;
  await wait(delayFromSeed(seed, 600, 1200));

  const token = (hashString(`${seed}|tracking|${Date.now().toString()}`) % 1000000)
    .toString()
    .padStart(6, '0');
  const purchasedAt = new Date().toISOString();

  return {
    labelId: `demo_label_${hashString(`${seed}|label`)}`,
    purchasedAt,
    trackingNumber: `DEMO-TRACK-${token}`,
    labelUrl: DEMO_LABEL_URL,
  };
}
