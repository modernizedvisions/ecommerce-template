import { sendEmail, type EmailEnv } from '../../../_lib/email';
import type { TrackingEmailContext } from '../trackingEmailContext';

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const resolveSiteUrl = (env: EmailEnv): string | null => {
  const raw = trimOrNull(env.PUBLIC_SITE_URL) || trimOrNull(env.VITE_PUBLIC_SITE_URL) || null;
  return raw ? raw.replace(/\/+$/, '') : null;
};

export const buildTrackingUpdateEmailHtml = (
  context: TrackingEmailContext,
  options?: { siteUrl?: string | null }
): string => {
  const greeting = context.customerName ? `Hi ${escapeHtml(context.customerName)},` : 'Hi,';
  const carrierService = [context.carrier, context.service].filter(Boolean).join(' - ');
  const siteUrl = trimOrNull(options?.siteUrl) || null;
  const items =
    context.items.length > 0
      ? `
      <div style="margin:12px 0 0;">
        <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#6b7280; margin-bottom:6px;">Items</div>
        <ul style="margin:0; padding-left:18px; color:#1f2937; font-size:14px; line-height:1.5;">
          ${context.items
            .slice(0, 6)
            .map((item) => `<li>${escapeHtml(item.name)}${item.quantity > 1 ? ` x${item.quantity}` : ''}</li>`)
            .join('')}
        </ul>
      </div>`
      : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Inter,Arial,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:22px;">
      <h1 style="margin:0 0 10px;font-size:20px;line-height:1.3;color:#111827;">Your order is on the way</h1>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;">${greeting}</p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;">Your order is being processed and is on its way.</p>
      <div style="margin:14px 0;padding:12px 14px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;">
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;margin-bottom:6px;">Order</div>
        <div style="font-size:14px;font-weight:600;color:#111827;">${escapeHtml(context.orderLabel)}</div>
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;margin:10px 0 6px;">Tracking Number</div>
        <div style="font-size:16px;font-weight:700;color:#111827;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(
          context.trackingNumber
        )}</div>
        ${
          carrierService
            ? `<div style="margin-top:10px;font-size:14px;color:#374151;">Carrier/Service: ${escapeHtml(carrierService)}</div>`
            : ''
        }
      </div>
      ${items}
      ${
        context.labelUrl
          ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.6;">Label: <a href="${escapeHtml(
              context.labelUrl
            )}" style="color:#0f172a;">View label</a></p>`
          : ''
      }
      ${
        siteUrl
          ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.6;">Store: <a href="${escapeHtml(
              siteUrl
            )}" style="color:#0f172a;">${escapeHtml(siteUrl)}</a></p>`
          : ''
      }
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Any questions? Reply to this email.</p>
    </div>
  </body>
</html>`;
};

export const buildTrackingUpdateEmailText = (
  context: TrackingEmailContext,
  options?: { siteUrl?: string | null }
): string => {
  const greeting = context.customerName ? `Hi ${context.customerName},` : 'Hi,';
  const carrierService = [context.carrier, context.service].filter(Boolean).join(' - ');
  const lines: string[] = [
    greeting,
    '',
    'Your order is being processed and is on its way.',
    `Order: ${context.orderLabel}`,
    `Tracking Number: ${context.trackingNumber}`,
  ];

  if (carrierService) lines.push(`Carrier/Service: ${carrierService}`);
  if (context.items.length > 0) {
    lines.push('', 'Items:');
    context.items.slice(0, 6).forEach((item) => {
      lines.push(`- ${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ''}`);
    });
  }
  if (context.labelUrl) lines.push(`Label: ${context.labelUrl}`);
  const siteUrl = trimOrNull(options?.siteUrl) || null;
  if (siteUrl) lines.push(`Store: ${siteUrl}`);
  lines.push('', 'Any questions? Reply to this email.');
  return lines.join('\n');
};

export const sendTrackingUpdateEmail = async (
  env: EmailEnv,
  context: TrackingEmailContext
): Promise<{ ok: true; id: string } | { ok: false; error: string }> => {
  const siteUrl = resolveSiteUrl(env);
  const subject = `Your order is on the way - tracking for ${context.orderLabel}`;
  const html = buildTrackingUpdateEmailHtml(context, { siteUrl });
  const text = buildTrackingUpdateEmailText(context, { siteUrl });

  return sendEmail(
    {
      to: context.toEmail,
      subject,
      html,
      text,
    },
    env
  );
};
