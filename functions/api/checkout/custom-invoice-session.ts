import { createCheckoutSession, retrieveCheckoutSession } from '../../_lib/stripeClient';

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  DB: D1Database;
  STRIPE_SECRET_KEY?: string;
  PUBLIC_SITE_URL?: string;
};

type InvoiceRow = {
  id: string;
  customer_email: string;
  customer_name?: string | null;
  amount_cents: number;
  currency: string;
  description: string;
  status: string;
  stripe_checkout_session_id?: string | null;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;
  const stripeSecret = env.STRIPE_SECRET_KEY;
  if (!stripeSecret) return json({ error: 'Stripe not configured' }, 500);

  let body: { invoiceId?: string } | null = null;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const invoiceId = body?.invoiceId?.trim();
  if (!invoiceId) return json({ error: 'invoiceId is required' }, 400);

  try {
    const invoice = await fetchInvoice(env.DB, invoiceId);
    if (!invoice) return json({ error: 'Invoice not found' }, 404);
    if (invoice.status === 'paid' || invoice.status === 'expired') {
      return json({ error: `Invoice is ${invoice.status}` }, 409);
    }

    // Reuse session if it exists
    if (invoice.stripe_checkout_session_id) {
      const existing = await retrieveCheckoutSession(stripeSecret, invoice.stripe_checkout_session_id);
      if (existing?.client_secret) {
        return json({ clientSecret: existing.client_secret, sessionId: existing.id });
      }
    }

    const baseUrl = (env.PUBLIC_SITE_URL || '').replace(/\/+$/, '');
    if (!baseUrl) return json({ error: 'Server configuration error: missing PUBLIC_SITE_URL' }, 500);

    // NOTE: Custom invoices are treated as non-taxable; Stripe Tax not enabled here.
    const session = await createCheckoutSession(stripeSecret, {
      ui_mode: 'embedded',
      mode: 'payment',
      customer_email: invoice.customer_email,
      line_items: [
        {
          price_data: {
            currency: invoice.currency || 'usd',
            unit_amount: invoice.amount_cents,
            product_data: {
              name: 'Custom Invoice',
              description: invoice.description,
            },
          },
          quantity: 1,
        },
      ],
      return_url: `${baseUrl}/invoice/${invoice.id}?result={CHECKOUT_SESSION_ID}`,
      metadata: {
        invoiceId: invoice.id,
        type: 'custom_invoice',
      },
    });

    if (!session.client_secret) {
      return json({ error: 'Stripe did not return a client_secret' }, 500);
    }

    // Persist session id
    await env.DB.prepare(`UPDATE custom_invoices SET stripe_checkout_session_id = ? WHERE id = ?;`)
      .bind(session.id, invoice.id)
      .run();

    return json({ clientSecret: session.client_secret, sessionId: session.id });
  } catch (err) {
    console.error('[custom-invoice-session] error', err);
    return json({ error: 'Failed to create custom invoice session' }, 500);
  }
};

async function fetchInvoice(db: D1Database, id: string): Promise<InvoiceRow | null> {
  const row = await db
    .prepare(
      `SELECT id, customer_email, customer_name, amount_cents, currency, description, status, stripe_checkout_session_id
       FROM custom_invoices
       WHERE id = ?`
    )
    .bind(id)
    .first<InvoiceRow>();
  return row || null;
}

