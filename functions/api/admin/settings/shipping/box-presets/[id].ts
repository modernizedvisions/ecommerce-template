import { requireAdmin } from '../../../../_lib/adminAuth';
import {
  ensureShippingLabelsSchema,
  jsonResponse,
  listShippingBoxPresets,
  type ShippingLabelsEnv,
} from '../../../../_lib/shippingLabels';

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

const getPresetId = (request: Request): string | null => {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/admin\/settings\/shipping\/box-presets\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

export async function onRequestPut(context: { request: Request; env: ShippingLabelsEnv }): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;
  const presetId = getPresetId(context.request);
  if (!presetId) return jsonResponse({ ok: false, error: 'Missing preset id' }, 400);

  try {
    await ensureShippingLabelsSchema(context.env.DB);
    const body = (await context.request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);

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

    const result = await context.env.DB.prepare(
      `UPDATE shipping_box_presets
       SET name = ?,
           length_in = ?,
           width_in = ?,
           height_in = ?,
           default_weight_lb = ?,
           updated_at = ?
       WHERE id = ?;`
    )
      .bind(
        name,
        Number(lengthIn.toFixed(3)),
        Number(widthIn.toFixed(3)),
        Number(heightIn.toFixed(3)),
        defaultWeightLb === null ? null : Number(defaultWeightLb.toFixed(3)),
        new Date().toISOString(),
        presetId
      )
      .run();

    if (!result.success || (result.meta?.changes ?? 0) < 1) {
      return jsonResponse({ ok: false, error: 'Preset not found' }, 404);
    }

    const boxPresets = await listShippingBoxPresets(context.env.DB);
    return jsonResponse({ ok: true, boxPresets });
  } catch (error) {
    console.error('[admin/settings/shipping/box-presets/:id] failed to update preset', error);
    const detail = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: 'Failed to update shipping box preset', detail }, 500);
  }
}

export async function onRequestDelete(context: { request: Request; env: ShippingLabelsEnv }): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;
  const presetId = getPresetId(context.request);
  if (!presetId) return jsonResponse({ ok: false, error: 'Missing preset id' }, 400);

  try {
    await ensureShippingLabelsSchema(context.env.DB);
    const usage = await context.env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM order_shipments
       WHERE box_preset_id = ?
         AND (purchased_at IS NOT NULL OR label_state = 'generated');`
    )
      .bind(presetId)
      .first<{ count: number }>();
    if ((usage?.count ?? 0) > 0) {
      return jsonResponse(
        { ok: false, code: 'PRESET_IN_USE', error: 'Cannot delete a box preset used by purchased shipments.' },
        409
      );
    }

    await context.env.DB.prepare(`DELETE FROM shipping_box_presets WHERE id = ?;`).bind(presetId).run();
    const boxPresets = await listShippingBoxPresets(context.env.DB);
    return jsonResponse({ ok: true, boxPresets });
  } catch (error) {
    console.error('[admin/settings/shipping/box-presets/:id] failed to delete preset', error);
    const detail = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: 'Failed to delete shipping box preset', detail }, 500);
  }
}

export async function onRequest(context: { request: Request; env: ShippingLabelsEnv }): Promise<Response> {
  const method = context.request.method.toUpperCase();
  if (method === 'PUT') return onRequestPut(context);
  if (method === 'DELETE') return onRequestDelete(context);
  return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
}

