export type OrderConfirmationEmailItem = {
  name: string;
  qty?: number | null;
  unitAmount?: number | null;
  lineTotal: number;
  imageUrl?: string | null;
  optionGroupLabel?: string | null;
  optionValue?: string | null;
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
  tax: number;
  discount?: number | null;
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
  const baseFont = "'Inter', 'Helvetica Neue', Arial, sans-serif";
  const serifFont = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
  const baseColor = '#2F4F4F';
  const mutedColor = '#5f6f75';
  const borderColor = '#E6DFD4';

  const itemRows =
    (params.items || [])
      .map((item) => {
        const qty = item.qty && item.qty > 1 ? `x ${item.qty}` : '';
        const optionLine =
          item.optionGroupLabel && item.optionValue
            ? `<span class="item-option">${escapeHtml(item.optionGroupLabel)}: ${escapeHtml(item.optionValue)}</span>`
            : '';
        const imageMarkup = item.imageUrl
          ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" width="56" height="56" class="item-img" />`
          : '<span class="item-placeholder"></span>';
        return `
      <tr class="item-row">
        <td class="item-info">
          <span class="item-media">${imageMarkup}</span>
          <span class="item-text">
            <span class="item-name">${escapeHtml(item.name)}${qty ? ` <span class="item-qty">${escapeHtml(qty)}</span>` : ''}</span>
            ${optionLine}
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

  const discountCents = Number.isFinite(params.discount as number) ? Number(params.discount) : 0;
  const showDiscount = discountCents > 0;
  const totalsRows = `
      <tr>
        <td class="totals-label" align="right">Subtotal</td>
        <td class="totals-value" align="right">${formatMoney(params.subtotal)}</td>
      </tr>
      <tr>
        <td class="totals-label" align="right">Shipping</td>
        <td class="totals-value" align="right">${formatShippingMoney(params.shipping)}</td>
      </tr>
      <tr>
        <td class="totals-label" align="right">Tax</td>
        <td class="totals-value" align="right">${formatMoney(params.tax)}</td>
      </tr>
      ${
        showDiscount
          ? `
      <tr>
        <td class="totals-label" align="right">Discount</td>
        <td class="totals-value" align="right">-${formatMoney(discountCents)}</td>
      </tr>`
          : ''
      }
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
    body { margin:0; padding:0; background:#FBF9F5; }
    table { border-collapse:collapse; }
    img { border:0; line-height:100%; }
    body, table, td, a, p, div, span { font-family:${baseFont}; }
    .container { width:100%; background:#FBF9F5; }
    .inner { width:600px; max-width:600px; background:#ffffff; border-radius:28px; border:1px solid ${borderColor}; overflow:hidden; box-shadow:0 24px 56px rgba(31,41,51,0.12); }
    .pad { padding:32px 22px 36px; }
    .inner-pad { padding:30px 28px 32px; }
    .section { padding-bottom:24px; }
    .brand { font-size:20px; font-weight:600; color:${baseColor}; font-family:${serifFont}; letter-spacing:0.04em; }
    .order-label { font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:${mutedColor}; white-space:nowrap; }
    .title { font-size:28px; font-weight:600; color:${baseColor}; margin:0 0 6px; font-family:${serifFont}; letter-spacing:0.02em; }
    .button { display:inline-block; padding:12px 22px; background:${baseColor}; color:#ffffff; text-decoration:none; border-radius:9999px; font-size:14px; font-weight:600; letter-spacing:0.08em; }
    .subhead { font-size:13px; letter-spacing:0.18em; text-transform:uppercase; color:${mutedColor}; margin:0 0 8px; }
    .item-row td { padding:14px 0; border-bottom:1px solid #ededed; vertical-align:top; }
    .item-info { width:100%; }
    .item-media { display:inline-block; width:56px; height:56px; vertical-align:top; }
    .item-text { display:inline-block; vertical-align:top; margin-left:12px; max-width:420px; }
    .item-img { width:56px; height:56px; border:1px solid ${borderColor}; object-fit:cover; display:block; border-radius:14px; }
    .item-placeholder { width:56px; height:56px; border:1px solid ${borderColor}; background:#f3f4f6; display:block; border-radius:14px; }
    .item-name { font-size:16px; font-weight:600; color:${baseColor}; font-family:${serifFont}; }
    .item-qty { font-size:13px; font-weight:500; color:${mutedColor}; }
    .item-option { display:block; font-size:12px; color:${mutedColor}; margin-top:2px; }
    .item-price { font-size:15px; font-weight:600; color:${baseColor}; white-space:nowrap; }
    .item-empty { padding:12px 0; font-size:14px; color:${mutedColor}; }
    .totals-label { padding:4px 0; font-size:14px; color:${mutedColor}; }
    .totals-value { padding:4px 0; font-size:14px; color:${baseColor}; font-weight:600; }
    .totals-start td { padding-top:16px; border-top:1px solid #ededed; }
    .total-row td { padding-top:10px; font-size:16px; font-weight:700; color:${baseColor}; }
    .info-title { font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:${mutedColor}; margin:0 0 6px; white-space:nowrap; }
    .info { font-size:14px; color:${baseColor}; line-height:1.5; margin:0; }
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
                ${totalsRows.replace('<tr>', '<tr class="totals-start">')}
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
      const option =
        item.optionGroupLabel && item.optionValue
          ? ` (${item.optionGroupLabel}: ${item.optionValue})`
          : '';
      return `- ${item.name}${qty}${option}: ${formatMoney(item.lineTotal)}`;
    }),
    '',
    `Subtotal: ${formatMoney(params.subtotal)}`,
    `Shipping: ${formatShippingMoney(params.shipping)}`,
    `Tax: ${formatMoney(params.tax)}`,
    params.discount && params.discount > 0 ? `Discount: -${formatMoney(params.discount)}` : null,
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
