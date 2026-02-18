import { requireAdmin } from '../../../_lib/adminAuth';
import {
  ensureShippingLabelsSchema,
  jsonResponse,
  readShippingSettings,
  type ShippingLabelsEnv,
} from '../../../_lib/shippingLabels';

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const US_STATE_CODES = new Set<string>([
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'DC',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
]);

const normalizeCountryCode = (value: string): string => value.trim().toUpperCase().slice(0, 2);

const normalizeUSStateCode = (value: string): string => {
  const normalized = value.trim().toUpperCase();
  return US_STATE_CODES.has(normalized) ? normalized : '';
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

    const shipFromName = trimOrNull(body.shipFromName) || '';
    const shipFromAddress1 = trimOrNull(body.shipFromAddress1) || '';
    const shipFromAddress2 = trimOrNull(body.shipFromAddress2) || '';
    const shipFromCity = trimOrNull(body.shipFromCity) || '';
    const rawShipFromState = trimOrNull(body.shipFromState) || '';
    const shipFromPostal = trimOrNull(body.shipFromPostal) || '';
    const shipFromCountry = normalizeCountryCode(trimOrNull(body.shipFromCountry) || 'US') || 'US';
    const shipFromPhone = trimOrNull(body.shipFromPhone) || '';
    const shipFromState = shipFromCountry === 'US' ? normalizeUSStateCode(rawShipFromState) : rawShipFromState;

    if (shipFromCountry === 'US' && !shipFromState) {
      return jsonResponse(
        {
          ok: false,
          error: 'Invalid ship-from state',
          detail: 'For US ship-from addresses, state is required and must be a 2-letter abbreviation (e.g., PA).',
        },
        400
      );
    }

    await context.env.DB.prepare(
      `UPDATE site_settings
       SET ship_from_name = ?,
           ship_from_address1 = ?,
           ship_from_address2 = ?,
           ship_from_city = ?,
           ship_from_state = ?,
           ship_from_postal = ?,
           ship_from_country = ?,
           ship_from_phone = ?,
           updated_at = ?
       WHERE id = 1;`
    )
      .bind(
        shipFromName,
        shipFromAddress1,
        shipFromAddress2,
        shipFromCity,
        shipFromState,
        shipFromPostal,
        shipFromCountry,
        shipFromPhone,
        new Date().toISOString()
      )
      .run();

    const shipFrom = await readShippingSettings(context.env.DB);
    return jsonResponse({ ok: true, shipFrom });
  } catch (error) {
    console.error('[admin/settings/shipping/ship-from] failed to update', error);
    const detail = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: 'Failed to update ship-from settings', detail }, 500);
  }
}

export async function onRequest(context: { request: Request; env: ShippingLabelsEnv }): Promise<Response> {
  if (context.request.method.toUpperCase() !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }
  return onRequestPost(context);
}
