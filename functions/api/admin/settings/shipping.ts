import { requireAdmin } from '../../_lib/adminAuth';
import {
  ensureShippingLabelsSchema,
  jsonResponse,
  listShippingBoxPresets,
  readShippingSettings,
  type ShippingLabelsEnv,
} from '../../_lib/shippingLabels';

export async function onRequestGet(context: { request: Request; env: ShippingLabelsEnv }): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;

  try {
    await ensureShippingLabelsSchema(context.env.DB);
    const [shipFrom, boxPresets] = await Promise.all([
      readShippingSettings(context.env.DB),
      listShippingBoxPresets(context.env.DB),
    ]);
    return jsonResponse({ ok: true, shipFrom, boxPresets });
  } catch (error) {
    console.error('[admin/settings/shipping] failed to load settings', error);
    const detail = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: 'Failed to load shipping settings', detail }, 500);
  }
}

export async function onRequest(context: { request: Request; env: ShippingLabelsEnv }): Promise<Response> {
  if (context.request.method.toUpperCase() !== 'GET') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }
  return onRequestGet(context);
}

