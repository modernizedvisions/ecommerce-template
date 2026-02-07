export const COOKIE_NAME = 'admin_session';

export type AdminSessionPayload = {
  sub: 'admin';
  iat: number;
  exp: number;
};

const textEncoder = new TextEncoder();

const base64UrlEncode = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlDecode = (value: string): Uint8Array | null => {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
};

const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
};

const signBytes = async (payload: string, secret: string): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(payload));
  return new Uint8Array(signature);
};

export const signAdminSession = async (payload: AdminSessionPayload, secret: string): Promise<string> => {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(textEncoder.encode(payloadJson));
  const signature = await signBytes(payloadB64, secret);
  const sigB64 = base64UrlEncode(signature);
  return `${payloadB64}.${sigB64}`;
};

export const verifyAdminSession = async (token: string, secret: string): Promise<AdminSessionPayload | null> => {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  const expectedSig = await signBytes(payloadB64, secret);
  const providedSig = base64UrlDecode(sigB64);
  if (!providedSig || !timingSafeEqual(expectedSig, providedSig)) return null;

  const payloadBytes = base64UrlDecode(payloadB64);
  if (!payloadBytes) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as AdminSessionPayload;
    if (!payload || payload.sub !== 'admin' || typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
      return null;
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
};

export const parseCookie = (header: string | null, name: string = COOKIE_NAME): string | null => {
  if (!header) return null;
  const parts = header.split(';');
  for (const part of parts) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return rest.join('=');
    }
  }
  return null;
};

type CookieOptions = {
  maxAge: number;
  secure: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  path?: string;
  httpOnly?: boolean;
};

export const buildSetCookie = (value: string, opts: CookieOptions): string => {
  const segments = [`${COOKIE_NAME}=${value}`];
  const path = opts.path || '/';
  segments.push(`Path=${path}`);
  segments.push(`Max-Age=${Math.max(0, Math.floor(opts.maxAge))}`);
  segments.push(`SameSite=${opts.sameSite || 'Strict'}`);
  if (opts.httpOnly !== false) segments.push('HttpOnly');
  if (opts.secure) segments.push('Secure');
  return segments.join('; ');
};
