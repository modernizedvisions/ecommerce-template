type D1PreparedStatement = {
  first<T>(): Promise<T | null>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  DB: D1Database;
};

type InvoiceRow = {
  id: string;
  customer_email?: string | null;
  customer_name?: string | null;
  amount_cents: number;
  currency: string;
  description: string;
  status: string;
  created_at?: string | null;
  sent_at?: string | null;
  paid_at?: string | null;
};

export async function onRequestGet(context: { env: Env; params: Record<string, string> }): Promise<Response> {
  const { id } = context.params || {};
  if (!id) return jsonResponse({ error: 'Invoice ID required' }, 400);

  try {
    const invoice = await fetchInvoice(context.env.DB, id);
    if (!invoice) {
      return jsonResponse({ error: 'Invoice not found' }, 404);
    }

    return jsonResponse({
      id: invoice.id,
      customer_name: invoice.customer_name || '',
      amount_cents: invoice.amount_cents,
      currency: invoice.currency,
      description: invoice.description,
      status: invoice.status,
      created_at: invoice.created_at || null,
      sent_at: invoice.sent_at || null,
      paid_at: invoice.paid_at || null,
    });
  } catch (err) {
    console.error('[custom-invoices/:id] error', err);
    return jsonResponse({ error: 'Server error' }, 500);
  }
}

async function fetchInvoice(db: D1Database, id: string): Promise<InvoiceRow | null> {
  const row = await db
    .prepare(
      `SELECT id, customer_email, customer_name, amount_cents, currency, description, status,
              created_at, sent_at, paid_at
       FROM custom_invoices
       WHERE id = ?`
    )
    .bind(id)
    .first<InvoiceRow>();
  return row || null;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

