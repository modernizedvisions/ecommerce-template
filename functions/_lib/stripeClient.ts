type StripeRequestOptions = {
  apiKey: string;
  apiVersion?: string;
  method?: 'GET' | 'POST';
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
};

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const DEFAULT_STRIPE_API_VERSION = '2024-06-20';

export async function createCheckoutSession(
  apiKey: string,
  payload: Record<string, unknown>,
  opts?: { apiVersion?: string; idempotencyKey?: string }
) {
  return stripeRequest({
    apiKey,
    apiVersion: opts?.apiVersion,
    idempotencyKey: opts?.idempotencyKey,
    method: 'POST',
    path: 'checkout/sessions',
    body: payload,
  });
}

export async function retrieveCheckoutSession(
  apiKey: string,
  sessionId: string,
  opts?: { apiVersion?: string; expand?: string[] }
) {
  return stripeRequest({
    apiKey,
    apiVersion: opts?.apiVersion,
    method: 'GET',
    path: `checkout/sessions/${encodeURIComponent(sessionId)}`,
    query: opts?.expand?.length ? { expand: opts.expand } : undefined,
  });
}

export async function listCheckoutSessionLineItems(
  apiKey: string,
  sessionId: string,
  opts?: { apiVersion?: string; limit?: number; expand?: string[] }
) {
  return stripeRequest({
    apiKey,
    apiVersion: opts?.apiVersion,
    method: 'GET',
    path: `checkout/sessions/${encodeURIComponent(sessionId)}/line_items`,
    query: {
      ...(opts?.limit ? { limit: opts.limit } : {}),
      ...(opts?.expand?.length ? { expand: opts.expand } : {}),
    },
  });
}

export async function createStripeProduct(
  apiKey: string,
  payload: Record<string, unknown>,
  opts?: { apiVersion?: string; idempotencyKey?: string }
) {
  return stripeRequest({
    apiKey,
    apiVersion: opts?.apiVersion,
    idempotencyKey: opts?.idempotencyKey,
    method: 'POST',
    path: 'products',
    body: payload,
  });
}

export async function createStripePrice(
  apiKey: string,
  payload: Record<string, unknown>,
  opts?: { apiVersion?: string; idempotencyKey?: string }
) {
  return stripeRequest({
    apiKey,
    apiVersion: opts?.apiVersion,
    idempotencyKey: opts?.idempotencyKey,
    method: 'POST',
    path: 'prices',
    body: payload,
  });
}

export async function constructStripeEvent(
  payload: string,
  signatureHeader: string,
  webhookSecret: string,
  toleranceSeconds = 300
) {
  const { timestamp, signatures } = parseStripeSignatureHeader(signatureHeader);
  if (!timestamp || !signatures.length) {
    throw new Error('Invalid Stripe signature header');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (toleranceSeconds && Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    throw new Error('Stripe signature timestamp outside tolerance');
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expected = await hmacSha256Hex(webhookSecret, signedPayload);
  const match = signatures.some((sig) => timingSafeEqual(expected, sig));
  if (!match) {
    throw new Error('Stripe signature verification failed');
  }

  return JSON.parse(payload);
}

async function stripeRequest(options: StripeRequestOptions) {
  const url = new URL(`${STRIPE_API_BASE}/${options.path}`);
  const query = options.query || {};
  if (Object.keys(query).length > 0) {
    const params = encodeStripeParams(query);
    url.search = params.toString();
  }

  const headers = new Headers({
    Authorization: `Bearer ${options.apiKey}`,
  });
  headers.set('Stripe-Version', options.apiVersion || DEFAULT_STRIPE_API_VERSION);
  if (options.idempotencyKey) {
    headers.set('Idempotency-Key', options.idempotencyKey);
  }

  let body: string | undefined;
  if (options.method === 'POST') {
    const encoded = encodeStripeParams(options.body || {});
    body = encoded.toString();
    headers.set('Content-Type', 'application/x-www-form-urlencoded');
  }

  const response = await fetch(url.toString(), {
    method: options.method || 'GET',
    headers,
    body,
  });

  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error?.type ||
      text ||
      `Stripe request failed with status ${response.status}`;
    throw new Error(typeof message === 'string' ? message : 'Stripe request failed');
  }

  return data;
}

function encodeStripeParams(input: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    appendStripeParam(params, key, value);
  }
  return params;
}

function appendStripeParam(params: URLSearchParams, key: string, value: unknown) {
  if (value === undefined || value === null) return;
  if (value instanceof Date) {
    params.append(key, String(Math.floor(value.getTime() / 1000)));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, idx) => {
      appendStripeParam(params, `${key}[${idx}]`, entry);
    });
    return;
  }
  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([childKey, childValue]) => {
      appendStripeParam(params, `${key}[${childKey}]`, childValue);
    });
    return;
  }
  params.append(key, String(value));
}

function parseStripeSignatureHeader(header: string): { timestamp: number | null; signatures: string[] } {
  const parts = header.split(',').map((part) => part.trim());
  let timestamp: number | null = null;
  const signatures: string[] = [];
  parts.forEach((part) => {
    const [key, value] = part.split('=');
    if (!key || !value) return;
    if (key === 't') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) timestamp = parsed;
    } else if (key === 'v1') {
      signatures.push(value);
    }
  });
  return { timestamp, signatures };
}

async function hmacSha256Hex(secret: string, payload: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return bufferToHex(signature);
}

function bufferToHex(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
