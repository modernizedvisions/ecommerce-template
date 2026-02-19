import type { D1Database } from './shippingLabels';

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export type TrackingEmailItemSummary = {
  name: string;
  quantity: number;
};

export type TrackingEmailContext = {
  toEmail: string;
  customerName: string | null;
  orderLabel: string;
  trackingNumber: string;
  carrier: string | null;
  service: string | null;
  labelUrl: string | null;
  items: TrackingEmailItemSummary[];
};

type ShipmentEmailRow = {
  customer_email: string | null;
  shipping_name: string | null;
  display_order_id: string | null;
  tracking_number: string | null;
  carrier: string | null;
  service: string | null;
  label_url: string | null;
};

type ItemRow = {
  product_name: string | null;
  product_id: string | null;
  quantity: number | null;
};

const listOrderColumnNames = async (db: D1Database): Promise<Set<string>> => {
  const columns = await db.prepare(`PRAGMA table_info(orders);`).all<{ name: string }>();
  return new Set((columns.results || []).map((column) => column.name));
};

const resolveOrderSelectColumns = (orderColumns: Set<string>) => {
  const displayOrderIdSql = orderColumns.has('display_order_id')
    ? 'o.display_order_id'
    : 'NULL';
  const customerEmailSql = orderColumns.has('customer_email')
    ? 'o.customer_email'
    : orderColumns.has('customer_email1')
    ? 'o.customer_email1'
    : 'NULL';
  const shippingNameSql = orderColumns.has('shipping_name')
    ? 'o.shipping_name'
    : 'NULL';

  return {
    displayOrderIdSql,
    customerEmailSql,
    shippingNameSql,
  };
};

const fetchItemSummaries = async (db: D1Database, orderId: string): Promise<TrackingEmailItemSummary[]> => {
  try {
    const { results } = await db
      .prepare(
        `SELECT
           p.name AS product_name,
           oi.product_id,
           oi.quantity
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = ?
         ORDER BY oi.rowid ASC
         LIMIT 8;`
      )
      .bind(orderId)
      .all<ItemRow>();

    return (results || [])
      .map((row) => {
        const name = trimOrNull(row.product_name) || trimOrNull(row.product_id) || 'Item';
        const quantityRaw = Number(row.quantity);
        const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.floor(quantityRaw) : 1;
        return { name, quantity };
      });
  } catch {
    return [];
  }
};

export const getTrackingEmailContext = async (
  db: D1Database,
  orderId: string,
  shipmentId: string
): Promise<TrackingEmailContext | null> => {
  const orderColumns = await listOrderColumnNames(db);
  const selectColumns = resolveOrderSelectColumns(orderColumns);

  const row = await db
    .prepare(
      `SELECT
         ${selectColumns.customerEmailSql} AS customer_email,
         ${selectColumns.shippingNameSql} AS shipping_name,
         ${selectColumns.displayOrderIdSql} AS display_order_id,
         os.tracking_number,
         os.carrier,
         os.service,
         os.label_url
       FROM order_shipments os
       LEFT JOIN orders o ON o.id = os.order_id
       WHERE os.order_id = ? AND os.id = ?
       LIMIT 1;`
    )
    .bind(orderId, shipmentId)
    .first<ShipmentEmailRow>();

  if (!row) return null;

  const toEmail = trimOrNull(row.customer_email);
  const trackingNumber = trimOrNull(row.tracking_number);
  if (!toEmail || !trackingNumber) return null;

  const items = await fetchItemSummaries(db, orderId);
  const orderLabel = trimOrNull(row.display_order_id) || orderId;

  return {
    toEmail,
    customerName: trimOrNull(row.shipping_name),
    orderLabel,
    trackingNumber,
    carrier: trimOrNull(row.carrier),
    service: trimOrNull(row.service),
    labelUrl: trimOrNull(row.label_url),
    items,
  };
};
