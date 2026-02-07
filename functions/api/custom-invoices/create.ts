import { sendEmail } from '../../_lib/email';

type D1PreparedStatement = {
  run(): Promise<{ success: boolean; error?: string }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  DB: D1Database;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_OWNER_TO?: string;
  PUBLIC_SITE_URL?: string;
};

type CreateInvoiceRequest = {
  customer_email?: string;
  customer_name?: string;
  amount_cents?: number;
  amount_dollars?: number;
  currency?: string;
  description?: string;
};

export async function onRequestPost(context: { env: Env; request: Request }): Promise<Response> {
  try {
    const body = (await context.request.json().catch(() => null)) as CreateInvoiceRequest | null;
    if (!body) return jsonResponse({ error: 'Invalid JSON body' }, 400);

    const customerEmail = (body.customer_email || '').trim();
    const customerName = (body.customer_name || '').trim() || null;
    const description = (body.description || '').trim();
    const currency = (body.currency || 'usd').toLowerCase();

    if (!customerEmail || !description) {
      return jsonResponse({ error: 'customer_email and description are required.' }, 400);
    }

    let amountCents: number | null = null;
    if (typeof body.amount_cents === 'number' && isFinite(body.amount_cents)) {
      amountCents = Math.round(body.amount_cents);
    } else if (typeof body.amount_dollars === 'number' && isFinite(body.amount_dollars)) {
      amountCents = Math.round(body.amount_dollars * 100);
    }

    if (!amountCents || amountCents <= 0) {
      return jsonResponse({ error: 'A positive amount is required (amount_cents or amount_dollars).' }, 400);
    }

    await ensureInvoiceSchema(context.env.DB);

    const invoiceId = crypto.randomUUID();
    const now = new Date().toISOString();
    const invoiceUrl = buildInvoiceUrl(context.env.PUBLIC_SITE_URL, invoiceId);

    const insert = context.env.DB.prepare(
      `INSERT INTO custom_invoices (
        id, customer_email, customer_name, amount_cents, currency, description,
        status, stripe_checkout_session_id, stripe_payment_intent_id,
        created_at, sent_at, paid_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'sent', NULL, NULL, ?, ?, NULL);`
    ).bind(
      invoiceId,
      customerEmail,
      customerName,
      amountCents,
      currency,
      description,
      now,
      now
    );

    const result = await insert.run();
    if (!result.success) {
      console.error('[custom-invoices] Failed to insert invoice', result.error);
      return jsonResponse({ error: 'Failed to create invoice' }, 500);
    }

    const emailResult = await sendInvoiceEmail({
      env: context.env,
      to: customerEmail,
      customerName,
      description,
      amountCents,
      currency,
      invoiceUrl,
    });

    if (!emailResult.ok) {
      console.error('[custom-invoices] Failed to send invoice email', emailResult.error);
      return jsonResponse({ error: 'Invoice created but email failed to send.' }, 500);
    }

    return jsonResponse(
      {
        invoiceId,
        status: 'sent',
        invoiceUrl,
      },
      201
    );
  } catch (err) {
    console.error('[custom-invoices] Error creating invoice', err);
    return jsonResponse({ error: 'Server error creating invoice' }, 500);
  }
}

async function ensureInvoiceSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS custom_invoices (
    id TEXT PRIMARY KEY,
    customer_email TEXT NOT NULL,
    customer_name TEXT,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    stripe_checkout_session_id TEXT,
    stripe_payment_intent_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at TEXT,
    paid_at TEXT
  );`).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_custom_invoices_customer_email ON custom_invoices(customer_email);`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_custom_invoices_status ON custom_invoices(status);`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_custom_invoices_created_at ON custom_invoices(created_at);`).run();
}

function buildInvoiceUrl(siteUrl: string | undefined, invoiceId: string): string {
  if (siteUrl) return `${siteUrl.replace(/\/+$/, '')}/invoice/${invoiceId}`;
  return `/invoice/${invoiceId}`;
}

async function sendInvoiceEmail(args: {
  env: Env;
  to: string;
  customerName: string | null;
  description: string;
  amountCents: number;
  currency: string;
  invoiceUrl: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const amountFormatted = formatAmount(args.amountCents, args.currency);
  const subject = `Invoice from Dover Designs - ${amountFormatted}`;

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; color: #0f172a; padding: 12px; line-height: 1.5;">
      <h2 style="margin: 0 0 12px; font-size: 18px; font-weight: 700;">Your custom order invoice</h2>
      <p style="margin: 0 0 8px;">${args.customerName ? `Hi ${escapeHtml(args.customerName)},` : 'Hi,'}</p>
      <p style="margin: 0 0 12px;">${escapeHtml(args.description)}</p>
      <p style="margin: 0 0 16px; font-weight: 600;">Amount due: ${amountFormatted}</p>
      <p style="margin: 0 0 16px;">
        <a href="${args.invoiceUrl}" style="display:inline-block; background:#0f172a; color:#fff; padding:10px 16px; border-radius:999px; text-decoration:none; font-weight:600;">
          Pay Invoice
        </a>
      </p>
      <p style="margin: 0; font-size: 12px; color: #475569;">If the button doesn't work, copy and paste this link:<br/>
        <a href="${args.invoiceUrl}" style="color:#0f172a;">${args.invoiceUrl}</a>
      </p>
    </div>
  `;

  return sendEmail(
    {
      to: args.to,
      subject,
      html,
      text: `Your custom order invoice\n\nDescription: ${args.description}\nAmount: ${amountFormatted}\nPay here: ${args.invoiceUrl}`,
    },
    args.env
  );
}

function formatAmount(amountCents: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amountCents / 100);
  } catch {
    return `$${(amountCents / 100).toFixed(2)} ${currency}`;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return map[char] || char;
  });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
