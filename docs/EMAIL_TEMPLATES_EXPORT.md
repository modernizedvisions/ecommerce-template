# Email Templates Export (Exact Copy)

## 1) Templates (Exact)
### A) Customer Order Confirmed
Path: `functions/_lib/orderConfirmationEmail.ts`
```ts
export type OrderConfirmationEmailItem = {
  name: string;
  qty?: number | null;
  unitAmount?: number | null;
  lineTotal: number;
  imageUrl?: string | null;
};

export type OrderConfirmationEmailParams = {
  brandName: string;
  orderNumber: string;
  orderDate: string;
  customerName?: string | null;
  customerEmail?: string | null;
  shippingAddress?: string | null;
  billingAddress?: string | null;
  paymentMethod?: string | null;
  items: OrderConfirmationEmailItem[];
  subtotal: number;
  shipping: number;
  total: number;
  primaryCtaUrl: string;
  primaryCtaLabel?: string;
};

export function renderOrderConfirmationEmailHtml(params: OrderConfirmationEmailParams): string {
  const brand = params.brandName || 'Order';
  const orderLabel = params.orderNumber || 'Order';
  const shippingAddress = params.shippingAddress || '';
  const billingAddress = params.billingAddress || '';
  const paymentMethod = params.paymentMethod || 'Card';
  const primaryCtaLabel = params.primaryCtaLabel || 'View Order Details';
  const baseFont = "'Playfair Display', Georgia, 'Times New Roman', serif";
  const baseColor = '#111827';
  const mutedColor = '#6b7280';
  const borderColor = '#e5e7eb';

  const itemRows =
    (params.items || [])
      .map((item) => {
        const qty = item.qty && item.qty > 1 ? `x ${item.qty}` : '';
        const imageMarkup = item.imageUrl
          ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" width="56" height="56" class="item-img" />`
          : '<span class="item-placeholder"></span>';
        return `
      <tr class="item-row">
        <td class="item-info">
          <span class="item-media">${imageMarkup}</span>
          <span class="item-text">
            <span class="item-name">${escapeHtml(item.name)}${qty ? ` <span class="item-qty">${escapeHtml(qty)}</span>` : ''}</span>
          </span>
        </td>
        <td class="item-price" align="right">${formatMoney(item.lineTotal)}</td>
      </tr>
    `;
      })
      .join('') ||
    `
      <tr>
        <td class="item-empty" colspan="2">No items found.</td>
      </tr>
    `;

  const totalsRows = `
      <tr>
        <td class="totals-label" align="right">Subtotal</td>
        <td class="totals-value" align="right">${formatMoney(params.subtotal)}</td>
      </tr>
      <tr>
        <td class="totals-label" align="right">Shipping</td>
        <td class="totals-value" align="right">${formatMoney(params.shipping)}</td>
      </tr>
      <tr class="total-row">
        <td align="right">Total</td>
        <td align="right">${formatMoney(params.total)}</td>
      </tr>
    `;

  const shippingLines = formatAddressLines(shippingAddress);
  const billingLines = formatAddressLines(billingAddress);
  const shippingBlock = shippingLines.length
    ? renderAddressLines(shippingLines)
    : 'Not provided';
  const billingBlock = billingLines.length
    ? renderAddressLines(billingLines)
    : shippingLines.length
    ? 'Same as shipping'
    : 'Not provided';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin:0; padding:0; background:#ffffff; }
    table { border-collapse:collapse; }
    img { border:0; line-height:100%; }
    body, table, td, a, p, div, span { font-family:${baseFont}; }
    .container { width:100%; background:#ffffff; }
    .inner { width:600px; max-width:600px; }
    .pad { padding:32px 16px; }
    .section { padding-bottom:24px; }
    .brand { font-size:20px; font-weight:600; color:${baseColor}; }
    .order-label { font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:${mutedColor}; white-space:nowrap; }
    .title { font-size:28px; font-weight:600; color:${baseColor}; margin:0 0 6px; }
    .button { display:inline-block; padding:12px 20px; background:${baseColor}; color:#ffffff; text-decoration:none; border-radius:9999px; font-size:14px; font-weight:600; }
    .subhead { font-size:14px; letter-spacing:0.12em; text-transform:uppercase; color:${mutedColor}; margin:0 0 8px; }
    .item-row td { padding:12px 0; border-bottom:1px solid #ededed; vertical-align:top; }
    .item-info { width:100%; }
    .item-media { display:inline-block; width:56px; height:56px; vertical-align:top; }
    .item-text { display:inline-block; vertical-align:top; margin-left:12px; max-width:420px; }
    .item-img { width:56px; height:56px; border:1px solid ${borderColor}; object-fit:cover; display:block; }
    .item-placeholder { width:56px; height:56px; border:1px solid ${borderColor}; background:#f3f4f6; display:block; }
    .item-name { font-size:16px; font-weight:600; color:${baseColor}; }
    .item-qty { font-size:13px; font-weight:500; color:${mutedColor}; }
    .item-price { font-size:15px; font-weight:600; color:${baseColor}; white-space:nowrap; }
    .item-empty { padding:12px 0; font-size:14px; color:${mutedColor}; }
    .totals-label { padding:4px 0; font-size:14px; color:${mutedColor}; }
    .totals-value { padding:4px 0; font-size:14px; color:${baseColor}; font-weight:600; }
    .total-row td { padding-top:10px; font-size:16px; font-weight:700; color:${baseColor}; }
    .info-title { font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:${mutedColor}; margin:0 0 6px; white-space:nowrap; }
    .info { font-size:14px; color:${baseColor}; line-height:1.5; margin:0; }
    .footer { padding-top:16px; font-size:12px; color:${mutedColor}; }
  </style>
</head>
<body>
  <table role="presentation" class="container" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" class="pad">
        <table role="presentation" class="inner" width="600" cellspacing="0" cellpadding="0">
          <tr>
            <td class="section brand">${escapeHtml(brand)}</td>
            <td class="section order-label" align="right" style="white-space:nowrap;">ORDER # ${escapeHtml(orderLabel)}</td>
          </tr>
          <tr>
            <td class="section" colspan="2">
              <p class="title">Thank you for your purchase!</p>
              <a href="${escapeHtml(params.primaryCtaUrl)}" class="button" style="display:inline-block; padding:12px 20px; background:${baseColor}; color:#ffffff !important; text-decoration:none !important; border-radius:9999px; font-size:14px; font-weight:600;">${escapeHtml(primaryCtaLabel)}</a>
            </td>
          </tr>
          <tr>
            <td class="section" colspan="2">
              <p class="subhead">Order summary</p>
            </td>
          </tr>
          ${itemRows}
          ${totalsRows}
          <tr>
            <td class="section" colspan="2" style="padding-top:12px;">
              <p class="subhead">Customer information</p>
            </td>
          </tr>
          <tr>
            <td class="section" style="width:50%; vertical-align:top; padding-right:16px;">
              <p class="info-title" style="white-space:nowrap;">Shipping address</p>
              <p class="info">${shippingBlock}</p>
            </td>
            <td class="section" style="width:50%; vertical-align:top; padding-left:16px;">
              <p class="info-title" style="white-space:nowrap;">Billing address</p>
              <p class="info">${billingBlock}</p>
            </td>
          </tr>
          <tr>
            <td class="section" colspan="2">
              <p class="info-title">Payment method</p>
              <p class="info">${escapeHtml(paymentMethod)}</p>
            </td>
          </tr>
          <tr>
            <td class="footer" colspan="2">If you have any questions, reply to this email.</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderOrderConfirmationEmailText(params: OrderConfirmationEmailParams): string {
  const primaryCtaLabel = params.primaryCtaLabel || 'Visit Store';
  const lines = [
    `${params.brandName || 'Order'} - Order Confirmed`,
    `Order: ${params.orderNumber || ''}`.trim(),
    `Placed: ${params.orderDate || ''}`.trim(),
    `Customer: ${params.customerName || 'Customer'}`,
    params.customerEmail ? `Email: ${params.customerEmail}` : null,
    params.shippingAddress ? `Shipping: ${params.shippingAddress}` : 'Shipping: Not provided',
    params.billingAddress ? `Billing: ${params.billingAddress}` : 'Billing: Same as shipping',
    params.paymentMethod ? `Payment: ${params.paymentMethod}` : 'Payment: Card',
    '',
    'Items:',
    ...(params.items || []).map((item) => {
      const qty = item.qty && item.qty > 1 ? ` x${item.qty}` : '';
      return `- ${item.name}${qty}: ${formatMoney(item.lineTotal)}`;
    }),
    '',
    `Subtotal: ${formatMoney(params.subtotal)}`,
    `Shipping: ${formatMoney(params.shipping)}`,
    `Total: ${formatMoney(params.total)}`,
    '',
    `${primaryCtaLabel}: ${params.primaryCtaUrl}`,
    'If you have any questions, reply to this email.',
  ].filter(Boolean) as string[];

  return lines.join('\n');
}

export function formatMoney(cents: number | null | undefined): string {
  const value = Number.isFinite(cents as number) ? Number(cents) / 100 : 0;
  return `$${value.toFixed(2)}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAddressLines(value: string) {
  if (!value) return [];
  return value
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function renderAddressLines(lines: string[]) {
  return lines.map((line) => escapeHtml(line)).join('<br/>');
}

```

### B) Owner New Sale
Path: `functions/_lib/ownerNewSaleEmail.ts`
```ts
export type OwnerNewSaleItem = {
  name: string;
  qtyLabel?: string | null;
  lineTotal: string;
  imageUrl?: string | null;
};

export type OwnerNewSaleParams = {
  orderNumber: string;
  orderDate: string;
  orderTypeLabel: string;
  statusLabel: string;
  customerName: string;
  customerEmail: string;
  shippingAddress?: string | null;
  billingAddress?: string | null;
  paymentMethod?: string | null;
  items: OwnerNewSaleItem[];
  subtotal: string;
  shipping: string;
  total: string;
  adminUrl: string;
  stripeUrl?: string | null;
};

export function renderOwnerNewSaleEmailHtml(params: OwnerNewSaleParams): string {
  const brand = 'The Chesapeake Shell';
  const orderLabel = params.orderNumber || 'Order';
  const baseFont = "'Playfair Display', Georgia, 'Times New Roman', serif";
  const baseColor = '#111827';
  const mutedColor = '#6b7280';
  const borderColor = '#e5e7eb';
  const primaryCtaLabel = 'View in Admin';

  const itemRows =
    (params.items || [])
      .map((item) => {
        const qty = item.qtyLabel ? item.qtyLabel.trim() : '';
        const imageMarkup = item.imageUrl
          ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" width="56" height="56" class="item-img" />`
          : '<span class="item-placeholder"></span>';
        return `
      <tr class="item-row">
        <td class="item-info">
          <span class="item-media">${imageMarkup}</span>
          <span class="item-text">
            <span class="item-name">${escapeHtml(item.name)}${qty ? ` <span class="item-qty">${escapeHtml(qty)}</span>` : ''}</span>
          </span>
        </td>
        <td class="item-price" align="right">${escapeHtml(item.lineTotal)}</td>
      </tr>
    `;
      })
      .join('') ||
    `
      <tr>
        <td class="item-empty" colspan="2">No items found.</td>
      </tr>
    `;

  const totalsRows = `
      <tr>
        <td class="totals-label" align="right">Subtotal</td>
        <td class="totals-value" align="right">${escapeHtml(params.subtotal)}</td>
      </tr>
      <tr>
        <td class="totals-label" align="right">Shipping</td>
        <td class="totals-value" align="right">${escapeHtml(params.shipping)}</td>
      </tr>
      <tr class="total-row">
        <td align="right">Total</td>
        <td align="right">${escapeHtml(params.total)}</td>
      </tr>
    `;

  const shippingLines = formatAddressLines(params.shippingAddress || '');
  const billingLines = formatAddressLines(params.billingAddress || '');
  const shippingBlock = shippingLines.length
    ? renderAddressLines(shippingLines)
    : 'Not provided';
  const billingBlock = billingLines.length
    ? renderAddressLines(billingLines)
    : shippingLines.length
    ? 'Same as shipping'
    : 'Not provided';
  const paymentMethod = params.paymentMethod || 'Not provided';

  const stripeButton = params.stripeUrl
    ? `
        <td width="12">&nbsp;</td>
        <td bgcolor="${baseColor}" style="border-radius:9999px;">
          <a href="${escapeHtml(params.stripeUrl)}" style="display:inline-block; padding:12px 20px; font-family:${baseFont}; font-size:14px; font-weight:600; color:#ffffff !important; text-decoration:none !important; border-radius:9999px;">
            Open in Stripe
          </a>
        </td>`
    : '';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin:0; padding:0; background:#ffffff; }
    table { border-collapse:collapse; }
    img { border:0; line-height:100%; }
    body, table, td, a, p, div, span { font-family:${baseFont}; }
    .container { width:100%; background:#ffffff; }
    .inner { width:600px; max-width:600px; }
    .pad { padding:32px 16px; }
    .section { padding-bottom:24px; }
    .brand { font-size:20px; font-weight:600; color:${baseColor}; }
    .order-label { font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:${mutedColor}; white-space:nowrap; }
    .title { font-size:28px; font-weight:600; color:${baseColor}; margin:0 0 6px; }
    .subtitle { font-size:14px; color:${mutedColor}; margin:0; }
    .button { display:inline-block; padding:12px 20px; background:${baseColor}; color:#ffffff; text-decoration:none; border-radius:9999px; font-size:14px; font-weight:600; }
    .subhead { font-size:14px; letter-spacing:0.12em; text-transform:uppercase; color:${mutedColor}; margin:0 0 8px; }
    .item-row td { padding:12px 0; border-bottom:1px solid #ededed; vertical-align:top; }
    .item-info { width:100%; }
    .item-media { display:inline-block; width:56px; height:56px; vertical-align:top; }
    .item-text { display:inline-block; vertical-align:top; margin-left:12px; max-width:420px; }
    .item-img { width:56px; height:56px; border:1px solid ${borderColor}; object-fit:cover; display:block; }
    .item-placeholder { width:56px; height:56px; border:1px solid ${borderColor}; background:#f3f4f6; display:block; }
    .item-name { font-size:16px; font-weight:600; color:${baseColor}; }
    .item-qty { font-size:13px; font-weight:500; color:${mutedColor}; }
    .item-price { font-size:15px; font-weight:600; color:${baseColor}; white-space:nowrap; }
    .item-empty { padding:12px 0; font-size:14px; color:${mutedColor}; }
    .totals-label { padding:4px 0; font-size:14px; color:${mutedColor}; }
    .totals-value { padding:4px 0; font-size:14px; color:${baseColor}; font-weight:600; }
    .total-row td { padding-top:10px; font-size:16px; font-weight:700; color:${baseColor}; }
    .info-title { font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:${mutedColor}; margin:0 0 6px; white-space:nowrap; }
    .info { font-size:14px; color:${baseColor}; line-height:1.5; margin:0; }
    .footer { padding-top:16px; font-size:12px; color:${mutedColor}; }
  </style>
</head>
<body>
  <table role="presentation" class="container" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" class="pad">
        <table role="presentation" class="inner" width="600" cellspacing="0" cellpadding="0">
          <tr>
            <td class="section brand">${escapeHtml(brand)}</td>
            <td class="section order-label" align="right" style="white-space:nowrap;">ORDER # ${escapeHtml(orderLabel)}</td>
          </tr>
          <tr>
            <td class="section" colspan="2">
              <p class="title">New Sale!</p>
              <p class="subtitle">A new order has been placed on The Chesapeake Shell.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:14px;">
                <tr>
                  <td bgcolor="${baseColor}" style="border-radius:9999px;">
                    <a href="${escapeHtml(params.adminUrl)}" style="display:inline-block; padding:12px 20px; font-family:${baseFont}; font-size:14px; font-weight:600; color:#ffffff !important; text-decoration:none !important; border-radius:9999px;">
                      ${escapeHtml(primaryCtaLabel)}
                    </a>
                  </td>
                  ${stripeButton}
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="section" colspan="2">
              <p class="subhead">Order summary</p>
            </td>
          </tr>
          ${itemRows}
          ${totalsRows}
          <tr>
            <td class="section" colspan="2" style="padding-top:12px;">
              <p class="subhead">Customer information</p>
            </td>
          </tr>
          <tr>
            <td class="section" style="width:50%; vertical-align:top; padding-right:16px;">
              <p class="info-title" style="white-space:nowrap;">Shipping address</p>
              <p class="info">${shippingBlock}</p>
            </td>
            <td class="section" style="width:50%; vertical-align:top; padding-left:16px;">
              <p class="info-title" style="white-space:nowrap;">Billing address</p>
              <p class="info">${billingBlock}</p>
            </td>
          </tr>
          <tr>
            <td class="section" colspan="2">
              <p class="info-title">Payment method</p>
              <p class="info">${escapeHtml(paymentMethod)}</p>
            </td>
          </tr>
          <tr>
            <td class="footer" colspan="2">If this was not you, you can safely ignore this email.</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderOwnerNewSaleEmailText(params: OwnerNewSaleParams): string {
  const lines = [
    'NEW SALE - The Chesapeake Shell',
    `Order: ${params.orderNumber}`,
    `Type: ${params.orderTypeLabel}`,
    `Status: ${params.statusLabel}`,
    `Placed: ${params.orderDate}`,
    `Total: ${params.total}`,
    `Customer: ${params.customerName}`,
    params.customerEmail ? `Email: ${params.customerEmail}` : null,
    params.shippingAddress ? `Shipping: ${params.shippingAddress}` : 'Shipping: Not provided',
    params.billingAddress ? `Billing: ${params.billingAddress}` : 'Billing: Same as shipping',
    params.paymentMethod ? `Payment: ${params.paymentMethod}` : 'Payment: Not provided',
    '',
    'Items:',
    ...(params.items || []).map((item) => {
      const qty = item.qtyLabel ? ` (${item.qtyLabel})` : '';
      return `- ${item.name}${qty}: ${item.lineTotal}`;
    }),
    '',
    `Subtotal: ${params.subtotal}`,
    `Shipping: ${params.shipping}`,
    `Total: ${params.total}`,
    '',
    `Admin: ${params.adminUrl}`,
    params.stripeUrl ? `Stripe: ${params.stripeUrl}` : null,
  ].filter(Boolean) as string[];

  return lines.join('\n');
}

export function formatMoney(cents: number | null | undefined): string {
  const value = Number.isFinite(cents as number) ? Number(cents) / 100 : 0;
  return `$${value.toFixed(2)}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAddressLines(value: string) {
  if (!value) return [];
  return value
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function renderAddressLines(lines: string[]) {
  return lines.map((line) => escapeHtml(line)).join('<br/>');
}

```

### C) Custom Order Payment Link
Path: `functions/_lib/customOrderPaymentLinkEmail.ts`
```ts
export type CustomOrderPaymentLinkEmailParams = {
  brandName: string;
  orderLabel?: string | null;
  ctaUrl: string;
  amountCents: number;
  currency?: string | null;
  shippingCents?: number | null;
  thumbnailUrl?: string | null;
  description?: string | null;
};

export function renderCustomOrderPaymentLinkEmailHtml(
  params: CustomOrderPaymentLinkEmailParams
): string {
  const brand = params.brandName || 'Order';
  const orderLabel = params.orderLabel || '';
  const showOrderLabel = !!orderLabel;
  const baseFont = "'Playfair Display', Georgia, 'Times New Roman', serif";
  const baseColor = '#111827';
  const mutedColor = '#6b7280';
  const borderColor = '#e5e7eb';
  const shippingCents =
    Number.isFinite(params.shippingCents as number) && (params.shippingCents as number) >= 0
      ? Number(params.shippingCents)
      : 0;
  const subtotalCents = Number.isFinite(params.amountCents as number) ? Number(params.amountCents) : 0;
  const totalCents = subtotalCents + shippingCents;
  const itemLabel = params.orderLabel ? `Custom Order ${params.orderLabel}` : 'Custom Order';
  const note = (params.description || '').trim();

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin:0; padding:0; background:#ffffff; }
    table { border-collapse:collapse; }
    img { border:0; line-height:100%; }
    body, table, td, a, p, div, span { font-family:${baseFont}; }
    .container { width:100%; background:#ffffff; }
    .inner { width:600px; max-width:600px; }
    .items-table { width:100%; table-layout:fixed; }
    .pad { padding:32px 16px; }
    .section { padding-bottom:24px; }
    .brand { font-size:20px; font-weight:600; color:${baseColor}; }
    .order-label { font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:${mutedColor}; white-space:nowrap; }
    .title { font-size:28px; font-weight:600; color:${baseColor}; margin:0 0 6px; }
    .subtitle { font-size:14px; color:${mutedColor}; margin:8px 0 0; }
    .button { display:inline-block; padding:12px 20px; background:${baseColor}; color:#ffffff; text-decoration:none; border-radius:9999px; font-size:14px; font-weight:600; }
    .subhead { font-size:14px; letter-spacing:0.12em; text-transform:uppercase; color:${mutedColor}; margin:0 0 8px; }
    .item-row td { padding:12px 0; border-bottom:1px solid #ededed; vertical-align:top; }
    .item-text { font-size:16px; font-weight:600; color:${baseColor}; }
    .item-desc { font-size:13px; color:${mutedColor}; margin-top:4px; line-height:1.5; font-weight:400; }
    .item-name { font-size:16px; font-weight:600; color:${baseColor}; }
    .item-desc { font-size:13px; color:${mutedColor}; margin-top:4px; line-height:1.5; font-weight:400; }
    .item-price { font-size:15px; font-weight:600; color:${baseColor}; white-space:nowrap; }
    .totals-label { padding:4px 0; font-size:14px; color:${mutedColor}; }
    .totals-value { padding:4px 0; font-size:14px; color:${baseColor}; font-weight:600; }
    .total-row td { padding-top:10px; font-size:16px; font-weight:700; color:${baseColor}; }
    .footer { padding-top:16px; font-size:12px; color:${mutedColor}; }
  </style>
</head>
<body>
  <table role="presentation" class="container" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" class="pad">
        <table role="presentation" class="inner" width="600" cellspacing="0" cellpadding="0">
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
          <tr>
            <td colspan="2">
              <table role="presentation" class="items-table" cellspacing="0" cellpadding="0">
                <tr class="item-row">
                  <td style="padding:16px 0; vertical-align:top;">
                    <div class="item-name">${escapeHtml(itemLabel)}</div>
                    ${note ? `<div class="item-desc">${escapeHtml(note)}</div>` : ''}
                  </td>
                  <td class="item-price" align="right" style="padding:16px 0; vertical-align:top; white-space:nowrap; width:120px;">
                    ${formatMoney(subtotalCents)}
                  </td>
                </tr>
                <tr>
                  <td class="totals-label" align="right">Subtotal</td>
                  <td class="totals-value" align="right">${formatMoney(subtotalCents)}</td>
                </tr>
                <tr>
                  <td class="totals-label" align="right">Shipping</td>
                  <td class="totals-value" align="right">${formatMoney(shippingCents)}</td>
                </tr>
                <tr class="total-row">
                  <td align="right">Total</td>
                  <td align="right">${formatMoney(totalCents)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="footer" colspan="2">If you have any questions, reply to this email.</td>
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
  const shippingCents =
    Number.isFinite(params.shippingCents as number) && (params.shippingCents as number) >= 0
      ? Number(params.shippingCents)
      : 0;
  const subtotalCents = Number.isFinite(params.amountCents as number) ? Number(params.amountCents) : 0;
  const totalCents = subtotalCents + shippingCents;
  const lines = [
    `${params.brandName || 'The Chesapeake Shell'} Custom Order Payment`,
    params.orderLabel ? `Order: ${params.orderLabel}` : null,
    params.description ? `Details: ${params.description}` : null,
    `Subtotal: ${formatMoney(subtotalCents)}`,
    `Shipping: ${formatMoney(shippingCents)}`,
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

```

### D) Shared helpers used by the above (if any)
No external helper files are imported by the templates above; all helper functions (e.g., `formatMoney`, `escapeHtml`) are defined inline within each template file.

## 2) Where These Templates Are Used (Routing / Wiring)
### functions/api/webhooks/stripe.ts
- Customer Order Confirmed (standard checkout)
```ts
          const html = renderOrderConfirmationEmailHtml({
            brandName: 'The Chesapeake Shell',
            orderNumber: orderLabel,
            orderDate,
            customerName: shippingName || session.customer_details?.name || null,
            customerEmail: customerEmail || undefined,
      shippingAddress: shippingAddressText || undefined,
      billingAddress: billingAddressText || undefined,
      paymentMethod: paymentMethodLabel,
            items: confirmationItems,
            subtotal: totalsForEmail.subtotalCents,
            shipping: totalsForEmail.shippingCents,
            total: totalsForEmail.totalCents,
            primaryCtaUrl: confirmationUrl,
            primaryCtaLabel: 'View Order Details',
          });
          const text = renderOrderConfirmationEmailText({
            brandName: 'The Chesapeake Shell',
            orderNumber: orderLabel,
            orderDate,
            customerName: shippingName || session.customer_details?.name || null,
            customerEmail: customerEmail || undefined,
            shippingAddress: shippingAddressText || undefined,
            billingAddress: billingAddressText || undefined,
            paymentMethod: paymentMethodLabel,
            items: confirmationItems,
            subtotal: totalsForEmail.subtotalCents,
            shipping: totalsForEmail.shippingCents,
            total: totalsForEmail.totalCents,
            primaryCtaUrl: confirmationUrl,
            primaryCtaLabel: 'View Order Details',
          });

        const subject = `The Chesapeake Shell - Order Confirmed (${orderLabel})`;
        if (emailDebug) {
          const preview = (html || '').replace(/\s+/g, ' ').slice(0, 300);
          console.log('[email] customer confirmation prepared', {
            kind: 'shop_customer',
            to: customerEmail,
            subject,
            htmlLen: html?.length ?? 0,
            textLen: text?.length ?? 0,
            preview,
            itemsCount: confirmationItems.length,
            hasInlineImage: hasUnsafeInlineImages(confirmationItems),
          });
        }
        
        const emailResult = await sendEmail(
          {
            to: customerEmail,
            subject,
            html,
            text,
          },
```

- Customer Order Confirmed (custom order checkout)
```ts
          const html = renderOrderConfirmationEmailHtml({
            brandName: 'The Chesapeake Shell',
            orderNumber: orderLabel,
            orderDate,
            customerName: shippingName || session.customer_details?.name || null,
            customerEmail: customerEmail || undefined,
      shippingAddress: shippingAddressText || undefined,
      billingAddress: billingAddressText || undefined,
      paymentMethod: paymentMethodLabel,
            items: confirmationItems,
            subtotal: totalsForEmail.subtotalCents,
            shipping: totalsForEmail.shippingCents,
            total: totalsForEmail.totalCents,
            primaryCtaUrl: confirmationUrl,
            primaryCtaLabel: 'View Order Details',
          });
          const text = renderOrderConfirmationEmailText({
            brandName: 'The Chesapeake Shell',
            orderNumber: orderLabel,
            orderDate,
            customerName: shippingName || session.customer_details?.name || null,
            customerEmail: customerEmail || undefined,
            shippingAddress: shippingAddressText || undefined,
            billingAddress: billingAddressText || undefined,
            paymentMethod: paymentMethodLabel,
            items: confirmationItems,
            subtotal: totalsForEmail.subtotalCents,
            shipping: totalsForEmail.shippingCents,
            total: totalsForEmail.totalCents,
            primaryCtaUrl: confirmationUrl,
            primaryCtaLabel: 'View Order Details',
          });

        const subject = `The Chesapeake Shell - Order Confirmed (${orderLabel})`;
        if (emailDebug) {
          const preview = (html || '').replace(/\s+/g, ' ').slice(0, 300);
          console.log('[email] customer confirmation prepared', {
            kind: 'shop_customer',
            to: customerEmail,
            subject,
            htmlLen: html?.length ?? 0,
            textLen: text?.length ?? 0,
            preview,
            itemsCount: confirmationItems.length,
            hasInlineImage: hasUnsafeInlineImages(confirmationItems),
          });
        }
        
        const emailResult = await sendEmail(
          {
            to: customerEmail,
            subject,
            html,
            text,
          },
```

- Owner NEW SALE (standard checkout)
```ts
          const html = renderOwnerNewSaleEmailHtml({
            orderNumber: orderLabel,
            orderDate,
            orderTypeLabel: 'Shop Order',
            statusLabel: 'PAID',
            customerName: shippingName || session.customer_details?.name || 'Customer',
            customerEmail: customerEmail || '',
            shippingAddress: shippingAddressText || undefined,
            billingAddress: billingAddressText || undefined,
            paymentMethod: paymentMethodLabel,
            items: confirmationItems,
            subtotal: totals.subtotal,
            shipping: totals.shipping,
            total: totals.total,
            adminUrl,
            stripeUrl,
          });
          const text = renderOwnerNewSaleEmailText({
            orderNumber: orderLabel,
            orderDate,
            orderTypeLabel: 'Shop Order',
            statusLabel: 'PAID',
            customerName: shippingName || session.customer_details?.name || 'Customer',
            customerEmail: customerEmail || '',
            shippingAddress: shippingAddressText || undefined,
            billingAddress: billingAddressText || undefined,
            paymentMethod: paymentMethodLabel,
            items: confirmationItems,
            subtotal: totals.subtotal,
            shipping: totals.shipping,
            total: totals.total,
            adminUrl,
            stripeUrl,
          });

          const emailResult = await sendEmail(
            {
              to: ownerTo,
              subject: `NEW SALE - The Chesapeake Shell (${orderLabel})`,
              html,
              text,
            },
            env
          );
          if (!emailResult.ok) {
            console.error('[stripe webhook] owner receipt email failed', emailResult.error);
          }
        } catch (emailError) {
          console.error('[stripe webhook] owner receipt email error', emailError);
        }
      }
        break;
      }
      case 'checkout.session.expired': {
        const sessionId = (event.data.object as { id?: string | null })?.id ?? null;
```

- Owner NEW SALE (custom order checkout)
```ts
          const html = renderOwnerNewSaleEmailHtml({
            orderNumber: orderLabel,
            orderDate,
            orderTypeLabel: 'Shop Order',
            statusLabel: 'PAID',
            customerName: shippingName || session.customer_details?.name || 'Customer',
            customerEmail: customerEmail || '',
            shippingAddress: shippingAddressText || undefined,
            billingAddress: billingAddressText || undefined,
            paymentMethod: paymentMethodLabel,
            items: confirmationItems,
            subtotal: totals.subtotal,
            shipping: totals.shipping,
            total: totals.total,
            adminUrl,
            stripeUrl,
          });
          const text = renderOwnerNewSaleEmailText({
            orderNumber: orderLabel,
            orderDate,
            orderTypeLabel: 'Shop Order',
            statusLabel: 'PAID',
            customerName: shippingName || session.customer_details?.name || 'Customer',
            customerEmail: customerEmail || '',
            shippingAddress: shippingAddressText || undefined,
            billingAddress: billingAddressText || undefined,
            paymentMethod: paymentMethodLabel,
            items: confirmationItems,
            subtotal: totals.subtotal,
            shipping: totals.shipping,
            total: totals.total,
            adminUrl,
            stripeUrl,
          });

          const emailResult = await sendEmail(
            {
              to: ownerTo,
              subject: `NEW SALE - The Chesapeake Shell (${orderLabel})`,
              html,
              text,
            },
            env
          );
          if (!emailResult.ok) {
            console.error('[stripe webhook] owner receipt email failed', emailResult.error);
          }
        } catch (emailError) {
          console.error('[stripe webhook] owner receipt email error', emailError);
        }
      }
        break;
      }
      case 'checkout.session.expired': {
        const sessionId = (event.data.object as { id?: string | null })?.id ?? null;
```

### functions/api/admin/custom-orders/[id]/send-payment-link.ts
- Custom Order Payment Link email
```ts
    const html = renderCustomOrderPaymentLinkEmailHtml({
      brandName: 'The Chesapeake Shell',
      orderLabel: displayId,
      ctaUrl: session.url,
      amountCents: amount,
      currency: 'usd',
      shippingCents,
      thumbnailUrl: null,
      description: order.description || null,
    });
    const text = renderCustomOrderPaymentLinkEmailText({
      brandName: 'The Chesapeake Shell',
      orderLabel: displayId,
      ctaUrl: session.url,
      amountCents: amount,
      currency: 'usd',
      shippingCents,
      thumbnailUrl: null,
      description: order.description || null,
    });

    console.log('[email] custom order send', {
      to: customerEmail,
      subject: 'The Chesapeake Shell Custom Order Payment',
      hasHtml: !!html,
      htmlLen: html.length,
      hasText: !!text,
      textLen: text.length,
    });

    if (!html || html.length < 50) {
      throw new Error('Custom order email HTML missing or too short');
    }

    const emailResult = await sendEmail(
      {
        to: customerEmail,
        subject: 'The Chesapeake Shell Custom Order Payment',
        html,
        text,
      },
      env
    );

    if (!emailResult.ok) {
```

### Other sendEmail call sites (for reference)
- `functions/api/email/test.ts`
- `functions/api/custom-invoices/create.ts`
- `functions/api/messages.ts`
- `functions/api/webhooks/stripe.ts` (multiple customer + owner sends)
- `functions/api/admin/custom-orders/[id]/send-payment-link.ts`

## 3) Required Env Vars / Bindings
- Resend/email keys: `RESEND_API_KEY`, plus sender/recipient: `RESEND_FROM` or `RESEND_FROM_EMAIL`, `EMAIL_FROM`, `RESEND_OWNER_TO` or `EMAIL_OWNER_TO`, and optional `RESEND_REPLY_TO`/`RESEND_REPLY_TO_EMAIL` (`functions/_lib/email.ts`).
- Public URL base: `PUBLIC_SITE_URL` or `VITE_PUBLIC_SITE_URL` for building links in Stripe webhook and custom order payment link (`functions/api/webhooks/stripe.ts`, `functions/api/admin/custom-orders/[id]/send-payment-link.ts`).
- Image base: `PUBLIC_IMAGES_BASE_URL` for email item images (resolved in `functions/api/webhooks/stripe.ts`).
- Stripe secret for Stripe dashboard URLs: `STRIPE_SECRET_KEY` is used in `buildStripeDashboardUrl` in `functions/api/webhooks/stripe.ts`.

## 4) Porting Checklist (Exact Steps)
1. Copy template files into the new repo:
   - `functions/_lib/orderConfirmationEmail.ts`
   - `functions/_lib/ownerNewSaleEmail.ts`
   - `functions/_lib/customOrderPaymentLinkEmail.ts`
2. Copy the sending call sites or adapt them to your routing:
   - Stripe webhook handler (customer + owner)
   - Custom order payment link sender
3. Ensure the email sender helper matches Resend payload shape (`functions/_lib/email.ts`).
4. Set required env vars in Cloudflare Pages/Workers:
   - `RESEND_API_KEY`, `RESEND_FROM` or `RESEND_FROM_EMAIL`, `EMAIL_FROM`
   - `RESEND_OWNER_TO` or `EMAIL_OWNER_TO`
   - `PUBLIC_SITE_URL` or `VITE_PUBLIC_SITE_URL`
   - `PUBLIC_IMAGES_BASE_URL` (if using product images in emails)
   - `STRIPE_SECRET_KEY` (if linking to Stripe dashboard)
5. Validate email rendering:
   - Send a Stripe test checkout and confirm customer + owner emails render correctly.
   - Send a custom order payment link and confirm CTA + order summary.
   - Confirm image URLs resolve and are not data/blob URLs.
