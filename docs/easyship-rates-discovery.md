# Easyship Rates Discovery

Date: 2026-02-17

## Scope

Investigate current Easyship `/rates` request construction and identify exact patch points for:

- `422 invalid_content`
- `"RateRequest does not define properties: shipment"`

This patch changes only `/rates` request construction and default Easyship base URL fallback. Added debug tooling remains gated by `EASYSHIP_DEBUG=true`.

## Findings Summary

- `/rates` payload is built in `functions/api/_lib/easyship.ts` in `buildEasyshipRatesPayload` and now matches v2024-09 top-level `RateRequest` shape (no top-level `shipment` wrapper).
- Each parcel now includes a non-empty `items` array built from `order_items` rows (with safe fallback when no rows exist).
- Easyship HTTP calls are made in `requestEasyship` (`functions/api/_lib/easyship.ts`), with URL built from:
  - `normalizeBaseUrl(env.EASYSHIP_API_BASE_URL)` (fallback `https://public-api.easyship.com/2024-09`)
  - plus path `'/rates'`
- Carrier allow-list filtering is **response-side** only, via `filterAllowedRates(...)` in:
  - `functions/api/admin/orders/[orderId]/shipments/[shipmentId]/quotes.ts`
  - `functions/api/admin/orders/[orderId]/shipments/[shipmentId]/buy.ts`
- `EASYSHIP_API_BASE_URL`, `EASYSHIP_TOKEN`, and `EASYSHIP_ALLOWED_CARRIERS` are all actively read.
- New debug logs confirm outgoing shape without leaking sensitive fields.

## Call Chain (Admin UI to Easyship Fetch)

Quotes flow:

1. UI click in `src/components/admin/ShippingLabelsModal.tsx` (`handleGetQuotes`)
2. Client API helper `src/lib/adminShipping.ts` (`adminFetchShipmentQuotes`)
3. API route `functions/api/admin/orders/[orderId]/shipments/[shipmentId]/quotes.ts` (`onRequestPost`)
4. Easyship wrapper `functions/api/_lib/easyship.ts` (`fetchEasyshipRates`)
5. Payload builder `functions/api/_lib/easyship.ts` (`buildEasyshipRatesPayload`)
6. HTTP client `functions/api/_lib/easyship.ts` (`requestEasyship`) -> `fetch(url, ...)`

Buy-label flow (also requotes if cache miss):

1. UI click in `src/components/admin/ShippingLabelsModal.tsx` (`handleBuyLabel`)
2. Client API helper `src/lib/adminShipping.ts` (`adminBuyShipmentLabel`)
3. API route `functions/api/admin/orders/[orderId]/shipments/[shipmentId]/buy.ts` (`onRequestPost`)
4. `fetchEasyshipRates` (if needed), then `createShipmentAndBuyLabel`
5. `requestEasyship` for `/rates`, `/shipments`, and purchase endpoints

## Current `/rates` URL Construction

Source:

- `functions/api/_lib/easyship.ts` -> `normalizeBaseUrl(...)`
- `functions/api/_lib/easyship.ts` -> `requestEasyship(...)`

Runtime formula:

- `baseUrl = normalizeBaseUrl(EASYSHIP_API_BASE_URL || 'https://public-api.easyship.com/2024-09')`
- `url = baseUrl + '/rates'`

Important implication:

- Version path is carried by the base URL value.
- To hit `https://public-api-sandbox.easyship.com/2024-09/rates`, `EASYSHIP_API_BASE_URL` must already include `/2024-09`.
- Repo config does not define this variable in `wrangler.toml` or `.env.example`, so runtime confirmation depends on deployment env.

## Current Outgoing `/rates` JSON Shape (Redacted)

Constructed by `buildEasyshipRatesPayload(...)` in `functions/api/_lib/easyship.ts`:

```json
{
  "origin_address": {
    "contact_name": "[present]",
    "company_name": "[present]",
    "contact_email": "[present]",
    "contact_phone": "[present]",
    "line_1": "[present]",
    "line_2": "[present]",
    "city": "[present]",
    "state": "[present]",
    "postal_code": "[present]",
    "country_alpha2": "[present]"
  },
  "destination_address": {
    "contact_name": "[present]",
    "company_name": "[present]",
    "contact_email": "[present]",
    "contact_phone": "[present]",
    "line_1": "[present]",
    "line_2": "[present]",
    "city": "[present]",
    "state": "[present]",
    "postal_code": "[present]",
    "country_alpha2": "[present]"
  },
  "shipping_settings": {
    "units": {
      "weight": "[present]",
      "dimensions": "[present]"
    }
  },
  "parcels": [
    {
      "box": {
        "length": "[present]",
        "width": "[present]",
        "height": "[present]"
      },
      "total_actual_weight": "[present]",
      "items": [
        {
          "description": "[present]",
          "category": "[present]",
          "quantity": "[present]",
          "actual_weight": "[present]",
          "declared_currency": "[present]",
          "declared_customs_value": "[present]"
        }
      ]
    }
  ]
}
```

Schema fix status:

- Top-level `shipment` wrapper has been removed from `/rates` payload.
- `parcels[0].items` is always emitted as a non-empty array.
- Each item now includes `category` (default `fashion`) so `category`/`hs_code` conditional validation passes.
- Debug logs/endpoint now expose `hasShipmentWrapper` to verify wrapper absence in runtime requests.

## Env Vars Actually Read

From `functions/api/_lib/easyship.ts`:

- `EASYSHIP_TOKEN` (required for live API calls)
- `EASYSHIP_API_BASE_URL` (optional; fallback `https://public-api.easyship.com/2024-09`)
- `EASYSHIP_ALLOWED_CARRIERS` (optional; fallback `USPS,UPS,FEDEX`)
- `EASYSHIP_MOCK` (`'1'` enables mock rates/labels)
- `EASYSHIP_DEBUG` (new, debug logging gate)

## Carrier Filtering Location

Carrier filtering is performed after receiving rates (response-side):

- `functions/api/admin/orders/[orderId]/shipments/[shipmentId]/quotes.ts`
  - fetch all rates -> `filterAllowedRates(rawRates, allowedCarriers)`
- `functions/api/admin/orders/[orderId]/shipments/[shipmentId]/buy.ts`
  - same pattern when cache miss

No carrier filtering is currently included in the outgoing `/rates` request body.

## Fix-Path Map for 422 (`shipment` Wrapper)

Primary patch point:

- `functions/api/_lib/easyship.ts` -> `buildEasyshipRatesPayload(...)`
  - removed top-level `shipment` wrapper
  - aligned to top-level v2024-09 `RateRequest` shape

Related verification/support files:

- `functions/api/_lib/easyship.ts` -> `requestEasyship(...)` (debug logs now show top-level keys and `hasShipmentWrapper`)
- `functions/api/admin/debug/easyship/rates-shape.ts` (debug endpoint uses same payload builder)
- `functions/api/_lib/shippingLabels.ts` -> `getOrderItemsForEasyship(...)` (maps D1 `order_items` into Easyship parcel items)

Secondary review point (separate endpoint/schema):

- `functions/api/_lib/easyship.ts` -> `buildShipmentPayload(...)` for `/shipments`
  - review separately against Easyship Shipment schema before changing

## Next-Step Mapping Recommendation (Not Implemented Here)

When aligning to Easyship `RateRequest`, map current model as:

- `origin_address` from ship-from settings (`site_settings`):
  - name, line1/line2, city, state, postal, country, phone
- `destination_address` from order shipping destination (`orders.shipping_address_json` + `shipping_name` + `customer_email`)
- `parcels[]` from shipment dimensions (`resolveShipmentDimensions`):
  - box length/width/height (in), total_actual_weight (lb), and non-empty `items[]`
- `items[]` from order lines (`order_items`):
  - description from product name/product id
  - category defaults to `fashion` (v2024-09 docs example category)
  - quantity from `order_items.quantity`
  - declared value from `order_items.price_cents` (USD)

## Debug Instrumentation Added

### 1) DEBUG-only request logging in Easyship wrapper

File:

- `functions/api/_lib/easyship.ts`

Gate:

- `EASYSHIP_DEBUG=true` (also accepts `1`)

Logs include:

- method
- endpoint host + path (no query)
- env presence booleans (`EASYSHIP_API_BASE_URL`, `EASYSHIP_TOKEN`, `EASYSHIP_ALLOWED_CARRIERS`)
- token length only
- request body top-level keys
- whether `shipment` wrapper exists + `shipment` nested keys
- redacted body skeleton (keys/structure only, no values)

### 2) Optional admin debug endpoint

Route:

- `GET /api/admin/debug/easyship/rates-shape?orderId=...&shipmentId=...`
- optional `parcelIndex` if `shipmentId` omitted

File:

- `functions/api/admin/debug/easyship/rates-shape.ts`

Protection:

- admin auth required
- returns 404 unless `EASYSHIP_DEBUG=true`

Returns:

- computed `/rates` host/path
- env presence + token length
- selected shipment metadata
- payload top-level keys and redacted skeleton

## Verification Procedure

1. Set `EASYSHIP_DEBUG=true` in the environment.
2. Trigger one quote request from Admin Shipping Labels UI, or call:
   - `/api/admin/debug/easyship/rates-shape?orderId=<id>&shipmentId=<id>`
3. Confirm logs/response show top-level keys do not include `shipment` (`hasShipmentWrapper=false`).
4. Confirm no addresses, names, email, phone, or token value appear.
5. Disable `EASYSHIP_DEBUG` after verification.
