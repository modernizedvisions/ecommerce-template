import { resolveFromEmail, sendEmail, type EmailEnv } from '../../_lib/email';
import { renderOwnerNewSaleEmailHtml, renderOwnerNewSaleEmailText } from '../../_lib/ownerNewSaleEmail';

type TestBody = {
  to?: string;
};

// TODO: Add auth before enabling this endpoint in production.
export async function onRequestPost(context: { request: Request; env: EmailEnv }): Promise<Response> {
  const { request, env } = context;
  const body = (await request.json().catch(() => null)) as TestBody | null;
  const ownerTo = env.RESEND_OWNER_TO || env.EMAIL_OWNER_TO || null;
  const to = body?.to?.trim() || ownerTo || '';

  if (!to) {
    return json({ error: 'Missing to' }, 400);
  }

  const hasKey = !!env.RESEND_API_KEY;
  const from = resolveFromEmail(env);
  if (!hasKey || !from) {
    return json(
      {
        error: 'Email not configured',
        detail: !hasKey ? 'Missing RESEND_API_KEY' : 'Missing sender email',
      },
      500
    );
  }

  const adminUrl = (env.PUBLIC_SITE_URL || env.VITE_PUBLIC_SITE_URL || '').replace(/\/+$/, '') + '/admin';
  const html = renderOwnerNewSaleEmailHtml({
    orderNumber: '25-123',
    orderDate: new Date().toISOString(),
    orderTypeLabel: 'Shop Order',
    statusLabel: 'PAID',
    customerName: 'Sample Customer',
    customerEmail: 'customer@example.com',
    shippingAddress: 'Sample Customer\n123 Bay St\nBoston, MA 02110\nUS',
    billingAddress: 'Sample Customer\n123 Bay St\nBoston, MA 02110\nUS',
    paymentMethod: 'Card ending in 4242',
    items: [
      { name: 'Ornament Shell', qtyLabel: 'x1', lineTotal: '$45.00', imageUrl: 'https://placehold.co/56x56' },
      { name: 'Ring Dish', qtyLabel: 'x2', lineTotal: '$64.00', imageUrl: null },
    ],
    subtotal: '$109.00',
    shipping: '$5.00',
    tax: '$8.00',
    total: '$122.00',
    adminUrl,
    stripeUrl: 'https://dashboard.stripe.com/test/payments/pi_sample',
  });
  const text = renderOwnerNewSaleEmailText({
    orderNumber: '25-123',
    orderDate: new Date().toISOString(),
    orderTypeLabel: 'Shop Order',
    statusLabel: 'PAID',
    customerName: 'Sample Customer',
    customerEmail: 'customer@example.com',
    shippingAddress: 'Sample Customer\n123 Bay St\nChesapeake, VA 23320\nUS',
    billingAddress: 'Sample Customer\n123 Bay St\nChesapeake, VA 23320\nUS',
    paymentMethod: 'Card ending in 4242',
    items: [
      { name: 'Ornament Shell', qtyLabel: 'x1', lineTotal: '$45.00', imageUrl: 'https://placehold.co/56x56' },
      { name: 'Ring Dish', qtyLabel: 'x2', lineTotal: '$64.00', imageUrl: null },
    ],
    subtotal: '$109.00',
    shipping: '$5.00',
    tax: '$8.00',
    total: '$122.00',
    adminUrl,
    stripeUrl: 'https://dashboard.stripe.com/test/payments/pi_sample',
  });

  const result = await sendEmail(
    {
      to,
      subject: 'NEW SALE - Dover Designs (TEST)',
      text,
      html,
    },
    env
  );

  if (!result.ok) {
    return json({ error: 'Failed to send email', detail: result.error }, 500);
  }

  return json({ success: true, to, from, resendId: (result as any).id });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
