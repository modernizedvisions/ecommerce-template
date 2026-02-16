import { requireAdmin } from '../../../_lib/adminAuth';
import {
  ensureShippingLabelsSchema,
  jsonResponse,
  listShippingBoxPresets,
  type ShippingLabelsEnv,
} from '../../../_lib/shippingLabels';

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toPositiveNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

export async function onRequestPost(context: { request: Request; env: ShippingLabelsEnv }): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;

  try {
    await ensureShippingLabelsSchema(context.env.DB);
    const body = (await context.request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
    }

    const name = trimOrNull(body.name);
    const lengthIn = toPositiveNumberOrNull(body.lengthIn);
    const widthIn = toPositiveNumberOrNull(body.widthIn);
    const heightIn = toPositiveNumberOrNull(body.heightIn);
    const defaultWeightLb = toPositiveNumberOrNull(body.defaultWeightLb);

    if (!name || lengthIn === null || widthIn === null || heightIn === null) {
      return jsonResponse(
        { ok: false, error: 'name, lengthIn, widthIn, and heightIn are required positive values' },
        400
      );
    }

    await context.env.DB.prepare(
      `INSERT INTO shipping_box_presets (
         id,
         name,
         length_in,
         width_in,
         height_in,
         default_weight_lb,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`
    )
      .bind(
        crypto.randomUUID(),
        name,
        Number(lengthIn.toFixed(3)),
        Number(widthIn.toFixed(3)),
        Number(heightIn.toFixed(3)),
        defaultWeightLb === null ? null : Number(defaultWeightLb.toFixed(3)),
        new Date().toISOString(),
        new Date().toISOString()
      )
      .run();

    const boxPresets = await listShippingBoxPresets(context.env.DB);
    return jsonResponse({ ok: true, boxPresets });
  } catch (error) {
    console.error('[admin/settings/shipping/box-presets] failed to create preset', error);
    const detail = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: 'Failed to create shipping box preset', detail }, 500);
  }
}

export async function onRequest(context: { request: Request; env: ShippingLabelsEnv }): Promise<Response> {
  if (context.request.method.toUpperCase() !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }
  return onRequestPost(context);
}

