import type Stripe from 'stripe';

type EmailAmount = {
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
};

type EmailItem = {
  name: string;
  quantity: number;
  amountCents: number;
  imageUrl?: string | null;
  description?: string | null;
  optionGroupLabel?: string | null;
  optionValue?: string | null;
};

type EmailAddress = Stripe.Address | Stripe.ShippingAddress | null;

type BaseEmailModel = {
  title: string;
  orderLabel: string;
  customerName?: string | null;
  customerEmail?: string | null;
  shippingAddress?: EmailAddress;
  items: EmailItem[];
  amounts: EmailAmount;
  createdAtIso?: string;
  adminUrl?: string | null;
  description?: string | null;
  note?: string | null;
};

export function renderOwnerNewOrderEmail(model: BaseEmailModel) {
  const subject = `New Order - Dover Designs (${model.orderLabel})`;
  return buildEmail({ ...model, title: 'New Order Received', subject });
}

export function renderOwnerCustomOrderPaidEmail(model: BaseEmailModel) {
  const subject = `Custom Order Paid - Dover Designs (${model.orderLabel})`;
  return buildEmail({ ...model, title: 'Custom Order Paid', subject });
}

export function renderOwnerInvoicePaidEmail(model: BaseEmailModel & { invoiceId: string }) {
  const subject = `Invoice Paid - Dover Designs (${model.invoiceId || model.orderLabel})`;
  return buildEmail({
    ...model,
    title: 'Invoice Paid',
    subject,
    note: model.invoiceId ? `Invoice ID: ${model.invoiceId}` : model.note,
  });
}

function buildEmail(model: BaseEmailModel & { subject: string }) {
  const createdAt = model.createdAtIso ? new Date(model.createdAtIso) : new Date();
  const address = formatAddress(model.shippingAddress);
  const hasAddress = !!address;
  const { subtotalCents, shippingCents, totalCents, currency } = model.amounts;

  const itemRowsHtml = model.items
    .map((item) => {
      const qtyLabel = item.quantity > 1 ? `x${item.quantity}` : '';
      const price = formatAmount(item.amountCents, currency);
      const img = sanitizeUrl(
        item.imageUrl ||
          'https://placehold.co/56x56/edf2f7/475569?text=%20'
      );
      return `
        <tr>
          <td style="padding: 8px 0; vertical-align: top;">
            <div style="display:flex; gap:12px; align-items:center;">
              <img src="${img}" alt="${escapeHtml(item.name)}" width="56" height="56" style="border-radius:12px; object-fit:cover; border:1px solid #e5e7eb;" />
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; color:#0f172a; font-size:14px; line-height:1.4;">
                <div style="font-family: Georgia, 'Times New Roman', serif; font-size:15px; font-weight:600; color:#0f172a;">${escapeHtml(item.name)}</div>
                ${qtyLabel ? `<div style="color:#475569;">Quantity: ${qtyLabel}</div>` : ''}
              </div>
            </div>
          </td>
          <td style="padding: 8px 0; text-align: right; font-family: 'Helvetica Neue', Arial, sans-serif; color:#0f172a; font-size:14px; white-space: nowrap;">${price}</td>
        </tr>
      `;
    })
    .join('');

  const html = `
    <div style="background:#f6f7f9; padding:24px; font-family: 'Helvetica Neue', Arial, sans-serif; color:#0f172a;">
      <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:16px; padding:24px;">
        <h1 style="margin:0 0 12px; font-family: Georgia, 'Times New Roman', serif; font-size:22px; color:#0f172a;">${escapeHtml(model.title)}</h1>
        <p style="margin:0 0 16px; color:#475569; font-size:14px;">${escapeHtml(model.orderLabel)}</p>
        ${model.description ? `<p style="margin:0 0 12px; color:#475569; font-size:14px;">${escapeHtml(model.description)}</p>` : ''}
        ${model.note ? `<p style="margin:0 0 12px; color:#475569; font-size:14px;">${escapeHtml(model.note)}</p>` : ''}

        <div style="margin:16px 0; padding:16px; background:#f8fafc; border:1px solid #e5e7eb; border-radius:12px;">
          <div style="display:flex; justify-content:space-between; font-size:14px; color:#475569; margin-bottom:4px;">
            <span style="color:#0f172a; font-weight:600;">Customer</span>
            <span>${escapeHtml(model.customerName || 'Unknown')}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:14px; color:#475569;">
            <span style="color:#0f172a; font-weight:600;">Email</span>
            <span>${escapeHtml(model.customerEmail || 'Unknown')}</span>
          </div>
          <div style="margin-top:8px; font-size:14px; color:#475569;">
            <div style="color:#0f172a; font-weight:600; margin-bottom:4px;">Shipping</div>
            <div>${hasAddress ? address : 'No shipping address provided.'}</div>
          </div>
          <div style="margin-top:8px; font-size:13px; color:#94a3b8;">${formatDate(createdAt)}</div>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-top:8px;">
          <tbody>
            ${itemRowsHtml || `<tr><td style="padding:8px 0; color:#475569;">No items</td></tr>`}
          </tbody>
        </table>

        <div style="margin-top:16px; border-top:1px solid #e5e7eb; padding-top:12px;">
          <div style="display:flex; justify-content:space-between; font-size:14px; color:#475569; margin-bottom:6px;">
            <span>Subtotal</span><span>${formatAmount(subtotalCents, currency)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:14px; color:#475569; margin-bottom:6px;">
            <span>Shipping</span><span>${formatShippingAmount(shippingCents, currency)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:16px; color:#0f172a; font-weight:700; margin-top:8px;">
            <span>Total</span><span>${formatAmount(totalCents, currency)}</span>
          </div>
        </div>

        ${model.adminUrl ? `
          <div style="margin-top:20px;">
            <a href="${sanitizeUrl(model.adminUrl)}" style="display:inline-block; padding:12px 16px; background:#0f172a; color:#ffffff; text-decoration:none; border-radius:10px; font-weight:600; font-size:14px;">View in Admin</a>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  const textLines = [
    model.title,
    `Order: ${model.orderLabel}`,
    model.description ? `Description: ${model.description}` : null,
    model.note ? `Note: ${model.note}` : null,
    `Customer: ${model.customerName || 'Unknown'} (${model.customerEmail || 'Unknown'})`,
    hasAddress ? `Shipping: ${address}` : 'Shipping: No shipping address provided.',
    'Items:',
    ...model.items.map((item) => {
      const qty = item.quantity > 1 ? ` x${item.quantity}` : '';
      return `- ${item.name}${qty}: ${formatAmount(item.amountCents, currency)}`;
    }),
    `Subtotal: ${formatAmount(subtotalCents, currency)}`,
    `Shipping: ${formatShippingAmount(shippingCents, currency)}`,
    `Total: ${formatAmount(totalCents, currency)}`,
    `Time: ${formatDate(createdAt)}`,
    model.adminUrl ? `Admin: ${model.adminUrl}` : null,
  ].filter(Boolean) as string[];

  return {
    subject: model.subject,
    html,
    text: textLines.join('\n'),
  };
}

function formatAmount(amountCents: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'usd').toUpperCase(),
    }).format((amountCents || 0) / 100);
  } catch {
    return `$${((amountCents || 0) / 100).toFixed(2)} ${currency}`;
  }
}

function formatShippingAmount(amountCents: number, currency: string) {
  if ((amountCents ?? 0) <= 0) return 'FREE';
  return formatAmount(amountCents, currency);
}

function formatAddress(address: EmailAddress) {
  if (!address) return '';
  const parts = [
    address.name,
    address.line1,
    address.line2,
    [address.city, address.state].filter(Boolean).join(', '),
    address.postal_code,
    address.country,
  ]
    .map((p) => (p || '').trim())
    .filter(Boolean);
  return parts.join(', ');
}

function formatDate(date: Date) {
  return date.toISOString();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeUrl(url: string | null | undefined) {
  if (!url) return '';
  if (/^data:image\//i.test(url)) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return '';
}

export type { EmailItem, EmailAmount, EmailAddress, BaseEmailModel };
