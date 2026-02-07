import { resolveEmailMoneyTotals } from './emailTotals';

export type CustomOrderPaymentLinkEmailParams = {
  brandName: string;
  orderLabel?: string | null;
  ctaUrl: string;
  amountCents: number;
  currency?: string | null;
  subtotalCents?: number | null;
  shippingCents?: number | null;
  totalCents?: number | null;
  thumbnailUrl?: string | null;
  description?: string | null;
};

export function renderCustomOrderPaymentLinkEmailHtml(
  params: CustomOrderPaymentLinkEmailParams
): string {
  const brand = params.brandName || 'Order';
  const orderLabel = params.orderLabel || '';
  const showOrderLabel = !!orderLabel;
  const baseFont = "'Inter', 'Helvetica Neue', Arial, sans-serif";
  const serifFont = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
  const baseColor = '#2F4F4F';
  const mutedColor = '#5f6f75';
  const borderColor = '#E6DFD4';
  const totals = resolveEmailMoneyTotals({
    order: {
      amount_cents: params.amountCents,
      shipping_cents: params.shippingCents ?? null,
    },
    shippingCentsFromContext: params.shippingCents ?? null,
  });
  const resolvedSubtotal =
    Number.isFinite(params.subtotalCents as number) ? Number(params.subtotalCents) : totals.itemsSubtotalCents;
  const resolvedShipping =
    Number.isFinite(params.shippingCents as number) ? Number(params.shippingCents) : totals.shippingCents;
  const resolvedTotal =
    Number.isFinite(params.totalCents as number)
      ? Number(params.totalCents)
      : Number.isFinite(resolvedSubtotal as number)
      ? Number(resolvedSubtotal) + Number(resolvedShipping)
      : totals.totalCents;
  const shippingCents = resolvedShipping;
  const subtotalCents = resolvedSubtotal;
  const totalCents = resolvedTotal;
  const itemLabel = params.orderLabel ? `Custom Order ${params.orderLabel}` : 'Custom Order';
  const note = (params.description || '').trim();
  const hasImage = !!params.thumbnailUrl;
  const imageCell = hasImage
    ? `<img src="${escapeHtml(params.thumbnailUrl || '')}" alt="${escapeHtml(itemLabel)}" width="56" height="56" class="item-img" />`
    : '<span class="item-placeholder"></span>';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin:0; padding:0; background:#FBF9F5; }
    table { border-collapse:collapse; }
    img { border:0; line-height:100%; }
    body, table, td, a, p, div, span { font-family:${baseFont}; }
    .container { width:100%; background:#FBF9F5; }
    .inner { width:600px; max-width:600px; background:#ffffff; border-radius:28px; border:1px solid ${borderColor}; overflow:hidden; box-shadow:0 24px 56px rgba(31,41,51,0.12); }
    .pad { padding:32px 24px; }
    .inner-pad { padding:30px 28px 32px; }
    .section { padding-bottom:24px; }
    .brand { font-size:20px; font-weight:600; color:${baseColor}; font-family:${serifFont}; letter-spacing:0.04em; }
    .order-label { font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:${mutedColor}; white-space:nowrap; }
    .title { font-size:28px; font-weight:600; color:${baseColor}; margin:0 0 6px; font-family:${serifFont}; letter-spacing:0.02em; }
    .subtitle { font-size:14px; color:${mutedColor}; margin:8px 0 0; }
    .button { display:inline-block; padding:12px 22px; background:${baseColor}; color:#ffffff; text-decoration:none; border-radius:9999px; font-size:14px; font-weight:600; letter-spacing:0.08em; }
    .subhead { font-size:13px; letter-spacing:0.18em; text-transform:uppercase; color:${mutedColor}; margin:0 0 8px; }
    .item-row td { padding:14px 0; border-bottom:1px solid #ededed; vertical-align:top; }
    .item-info { width:100%; }
    .item-media { display:inline-block; width:56px; height:56px; vertical-align:top; }
    .item-text { display:inline-block; vertical-align:top; margin-left:12px; max-width:420px; }
    .item-img { width:56px; height:56px; border:1px solid ${borderColor}; object-fit:cover; display:block; border-radius:14px; }
    .item-placeholder { width:56px; height:56px; border:1px solid ${borderColor}; background:#f3f4f6; display:block; border-radius:14px; }
    .item-name { font-size:16px; font-weight:600; color:${baseColor}; font-family:${serifFont}; }
    .item-desc { display:block; font-size:13px; color:${mutedColor}; margin-top:4px; line-height:1.5; font-weight:400; }
    .item-price { font-size:15px; font-weight:600; color:${baseColor}; white-space:nowrap; }
    .totals-label { padding:4px 0; font-size:14px; color:${mutedColor}; }
    .totals-value { padding:4px 0; font-size:14px; color:${baseColor}; font-weight:600; }
    .totals-start td { padding-top:16px; border-top:1px solid #ededed; }
    .total-row td { padding-top:10px; font-size:16px; font-weight:700; color:${baseColor}; }
    .footer { padding-top:16px; font-size:12px; color:${mutedColor}; }
    @media screen and (max-width: 640px) {
      .pad { padding:24px 16px 30px; }
      .inner-pad { padding:24px 18px 28px; }
      .title { font-size:24px; }
      .item-text { max-width:260px; }
    }
  </style>
</head>
<body>
  <table role="presentation" class="container" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" class="pad">
        <table role="presentation" class="inner" width="600" cellspacing="0" cellpadding="0">
          <tr>
            <td class="inner-pad">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td class="section brand">${escapeHtml(brand)}</td>
                  <td class="section order-label" align="right" style="white-space:nowrap;">${showOrderLabel ? `ORDER # ${escapeHtml(orderLabel)}` : ''}</td>
                </tr>
                <tr>
                  <td class="section" colspan="2">
                    <p class="title">Click the link below for your custom order!</p>
                    <a href="${escapeHtml(params.ctaUrl)}" class="button" style="display:inline-block; padding:12px 20px; background:${baseColor}; color:#ffffff !important; text-decoration:none !important; border-radius:9999px; font-size:14px; font-weight:600;">Pay Now</a>
                  </td>
                </tr>
                <tr>
                  <td class="section" colspan="2">
                    <p class="subhead">Order summary</p>
                  </td>
                </tr>
                <tr class="item-row">
                  <td class="item-info">
                    <span class="item-media">${imageCell}</span>
                    <span class="item-text">
                      <span class="item-name">${escapeHtml(itemLabel)}</span>
                      ${note ? `<span class="item-desc">${escapeHtml(note)}</span>` : ''}
                    </span>
                  </td>
                  <td class="item-price" align="right">${formatMoney(subtotalCents)}</td>
                </tr>
                <tr class="totals-start">
                  <td class="totals-label" align="right">Subtotal</td>
                  <td class="totals-value" align="right">${formatMoney(subtotalCents)}</td>
                </tr>
                <tr>
                  <td class="totals-label" align="right">Shipping</td>
                  <td class="totals-value" align="right">${formatShippingMoney(shippingCents)}</td>
                </tr>
                <tr>
                  <td class="totals-label" align="right">Tax</td>
                  <td class="totals-value" align="right">Calculated at checkout</td>
                </tr>
                <tr class="total-row">
                  <td align="right">Total</td>
                  <td align="right">${formatMoney(totalCents)}</td>
                </tr>
                <tr>
                  <td class="footer" colspan="2">If you have any questions, reply to this email.</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderCustomOrderPaymentLinkEmailText(
  params: CustomOrderPaymentLinkEmailParams
): string {
  const totals = resolveEmailMoneyTotals({
    order: {
      amount_cents: params.amountCents,
      shipping_cents: params.shippingCents ?? null,
    },
    shippingCentsFromContext: params.shippingCents ?? null,
  });
  const resolvedSubtotal =
    Number.isFinite(params.subtotalCents as number) ? Number(params.subtotalCents) : totals.itemsSubtotalCents;
  const resolvedShipping =
    Number.isFinite(params.shippingCents as number) ? Number(params.shippingCents) : totals.shippingCents;
  const resolvedTotal =
    Number.isFinite(params.totalCents as number)
      ? Number(params.totalCents)
      : Number.isFinite(resolvedSubtotal as number)
      ? Number(resolvedSubtotal) + Number(resolvedShipping)
      : totals.totalCents;
  const shippingCents = resolvedShipping;
  const subtotalCents = resolvedSubtotal;
  const totalCents = resolvedTotal;
  const lines = [
    `${params.brandName || 'Dover Designs'} Custom Order Payment`,
    params.orderLabel ? `Order: ${params.orderLabel}` : null,
    params.description ? `Details: ${params.description}` : null,
    `Subtotal: ${formatMoney(subtotalCents)}`,
    `Shipping: ${formatShippingMoney(shippingCents)}`,
    'Tax: Calculated at checkout',
    `Total: ${formatMoney(totalCents)}`,
    '',
    `Pay Now: ${params.ctaUrl}`,
  ].filter(Boolean) as string[];

  return lines.join('\n');
}

export function formatMoney(cents: number | null | undefined): string {
  const value = Number.isFinite(cents as number) ? Number(cents) / 100 : 0;
  return `$${value.toFixed(2)}`;
}

export function formatShippingMoney(cents: number | null | undefined): string {
  const value = Number.isFinite(cents as number) ? Number(cents) : 0;
  if (value <= 0) return 'FREE';
  return formatMoney(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
