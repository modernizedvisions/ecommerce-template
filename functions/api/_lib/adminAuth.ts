type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

// Cloudflare Pages runtime requirements:
// - Secrets: ADMIN_PASSWORD_SALT_B64, ADMIN_PASSWORD_HASH_B64
// - Variables (or secrets): ADMIN_PASSWORD_ITERS, ADMIN_SESSION_TTL_DAYS
// - D1 binding: DB
export type AdminAuthEnv = {
  DB: D1Database;
  ADMIN_PASSWORD?: string;
  ADMIN_PASSWORD_SALT_B64?: string;
  ADMIN_PASSWORD_HASH_B64?: string;
  ADMIN_PASSWORD_ITERS?: string;
  ADMIN_SESSION_TTL_DAYS?: string;
};

export type AdminSessionRow = {
  id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  ip: string | null;
  user_agent: string | null;
};

export const ADMIN_SESSION_COOKIE = 'mv_admin_session';

const textEncoder = new TextEncoder();

const readCookie = (header: string | null, name: string): string | null => {
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

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64ToBytes = (value: string): Uint8Array => {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    throw new Error('Invalid base64 value');
  }
};

const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
};

const parsePositiveInt = (raw: string | undefined, label: string): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
};

const getPasswordConfig = (env: AdminAuthEnv): { salt: Uint8Array; expectedHash: Uint8Array; iterations: number } => {
  const saltB64 = env.ADMIN_PASSWORD_SALT_B64;
  const hashB64 = env.ADMIN_PASSWORD_HASH_B64;
  const iterations = parsePositiveInt(env.ADMIN_PASSWORD_ITERS, 'ADMIN_PASSWORD_ITERS');

  if (!saltB64) throw new Error('Missing ADMIN_PASSWORD_SALT_B64');
  if (!hashB64) throw new Error('Missing ADMIN_PASSWORD_HASH_B64');

  const salt = base64ToBytes(saltB64);
  const expectedHash = base64ToBytes(hashB64);
  if (expectedHash.length !== 32) {
    throw new Error('ADMIN_PASSWORD_HASH_B64 must decode to 32 bytes');
  }
  if (salt.length === 0) {
    throw new Error('ADMIN_PASSWORD_SALT_B64 cannot be empty');
  }

  return { salt, expectedHash, iterations };
};

export const getAdminSessionTtlDays = (env: AdminAuthEnv): number =>
  parsePositiveInt(env.ADMIN_SESSION_TTL_DAYS, 'ADMIN_SESSION_TTL_DAYS');

export const getAdminSessionMaxAgeSeconds = (env: AdminAuthEnv): number =>
  getAdminSessionTtlDays(env) * 24 * 60 * 60;

export const pbkdf2Verify = async (password: string, env: AdminAuthEnv): Promise<boolean> => {
  const { salt, expectedHash, iterations } = getPasswordConfig(env);
  const key = await crypto.subtle.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256
  );
  const derived = new Uint8Array(bits);
  return timingSafeEqual(derived, expectedHash);
};

const getClientIp = (request: Request): string | null => {
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) return cfIp.trim() || null;
  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded) return null;
  const first = forwarded.split(',')[0];
  return first ? first.trim() : null;
};

export const createAdminSession = async (
  env: AdminAuthEnv,
  request: Request
): Promise<{ token: string; expiresAt: string }> => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + getAdminSessionTtlDays(env) * 24 * 60 * 60 * 1000);

  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const token = bytesToBase64Url(random);
  const tokenHash = await sha256Hex(token);

  const id = crypto.randomUUID();
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent');

  const result = await env.DB.prepare(
    `
      INSERT INTO admin_sessions (id, token_hash, created_at, expires_at, revoked_at, ip, user_agent)
      VALUES (?, ?, ?, ?, NULL, ?, ?)
    `
  )
    .bind(id, tokenHash, now.toISOString(), expiresAt.toISOString(), ip, userAgent)
    .run();

  if (!result.success) {
    throw new Error(result.error || 'Failed to create admin session');
  }

  return { token, expiresAt: expiresAt.toISOString() };
};

export const getAdminSession = async (env: AdminAuthEnv, request: Request): Promise<AdminSessionRow | null> => {
  const rawToken = readCookie(request.headers.get('Cookie'), ADMIN_SESSION_COOKIE);
  if (!rawToken) return null;

  const tokenHash = await sha256Hex(rawToken);
  const nowIso = new Date().toISOString();

  const row = await env.DB.prepare(
    `
      SELECT id, token_hash, created_at, expires_at, revoked_at, ip, user_agent
      FROM admin_sessions
      WHERE token_hash = ?
        AND revoked_at IS NULL
        AND expires_at > ?
      LIMIT 1
    `
  )
    .bind(tokenHash, nowIso)
    .first<AdminSessionRow>();

  return row || null;
};

export const revokeAdminSession = async (env: AdminAuthEnv, request: Request): Promise<boolean> => {
  const rawToken = readCookie(request.headers.get('Cookie'), ADMIN_SESSION_COOKIE);
  if (!rawToken) return false;

  const tokenHash = await sha256Hex(rawToken);
  const nowIso = new Date().toISOString();
  const result = await env.DB.prepare(
    `
      UPDATE admin_sessions
      SET revoked_at = ?
      WHERE token_hash = ?
        AND revoked_at IS NULL
    `
  )
    .bind(nowIso, tokenHash)
    .run();

  const changes = typeof result.meta?.changes === 'number' ? result.meta.changes : 0;
  return !!result.success && changes > 0;
};

export const setCookieHeader = (name: string, value: string, maxAgeSeconds: number): string =>
  `${name}=${value}; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; HttpOnly; Secure; SameSite=Lax`;

export const clearCookieHeader = (name: string): string =>
  `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export type RequireAdminOptions = {
  log?: boolean;
  requireHeaderPassword?: boolean;
};

const isHeaderPasswordValid = (request: Request, env: AdminAuthEnv): boolean => {
  const expected = typeof env.ADMIN_PASSWORD === 'string' ? env.ADMIN_PASSWORD : '';
  if (!expected) return false;
  const providedRaw = request.headers.get('x-admin-password');
  const provided = typeof providedRaw === 'string' ? providedRaw.trim() : '';
  if (!provided) return false;
  return provided === expected;
};

const unauthorized = (): Response => Response.json({ ok: false, code: 'ADMIN_UNAUTH' }, { status: 401 });

export const requireAdmin = async (
  request: Request,
  env: AdminAuthEnv,
  options?: RequireAdminOptions
): Promise<Response | null> => {
  const mustUseHeaderPassword = options?.requireHeaderPassword === true;

  if (mustUseHeaderPassword) {
    if (isHeaderPasswordValid(request, env)) return null;
    if (options?.log) {
      console.warn('[admin auth] unauthorized header-based request');
    }
    return unauthorized();
  }

  if (isHeaderPasswordValid(request, env)) {
    return null;
  }

  const session = await getAdminSession(env, request);
  if (!session) {
    if (options?.log) {
      console.warn('[admin auth] unauthorized session-based request');
    }
    return unauthorized();
  }
  return null;
};
