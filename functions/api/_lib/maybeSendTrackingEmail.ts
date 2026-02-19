import type { EmailEnv } from '../../_lib/email';
import { sendTrackingUpdateEmail } from './emails/trackingUpdateEmail';
import type { D1Database } from './shippingLabels';
import { getTrackingEmailContext } from './trackingEmailContext';

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

type ShipmentSignalsRow = {
  tracking_number: string | null;
  tracking_email_sent_at: string | null;
  customer_email: string | null;
};

const resolveCustomerEmailColumnSql = async (db: D1Database): Promise<string> => {
  const columns = await db.prepare(`PRAGMA table_info(orders);`).all<{ name: string }>();
  const columnNames = new Set((columns.results || []).map((column) => column.name));
  if (columnNames.has('customer_email')) return 'o.customer_email';
  if (columnNames.has('customer_email1')) return 'o.customer_email1';
  return 'NULL';
};

const readShipmentSignals = async (
  db: D1Database,
  orderId: string,
  shipmentId: string
): Promise<ShipmentSignalsRow | null> => {
  const customerEmailSql = await resolveCustomerEmailColumnSql(db);
  return db
    .prepare(
      `SELECT
         os.tracking_number,
         os.tracking_email_sent_at,
         ${customerEmailSql} AS customer_email
       FROM order_shipments os
       LEFT JOIN orders o ON o.id = os.order_id
       WHERE os.order_id = ? AND os.id = ?
       LIMIT 1;`
    )
    .bind(orderId, shipmentId)
    .first<ShipmentSignalsRow>();
};

const clearTrackingEmailClaim = async (db: D1Database, orderId: string, shipmentId: string, claimedAt: string) => {
  await db
    .prepare(
      `UPDATE order_shipments
       SET tracking_email_sent_at = NULL
       WHERE order_id = ? AND id = ? AND tracking_email_sent_at = ?;`
    )
    .bind(orderId, shipmentId, claimedAt)
    .run();
};

const claimTrackingEmailSend = async (
  db: D1Database,
  orderId: string,
  shipmentId: string,
  claimedAt: string
): Promise<boolean> => {
  const claim = await db
    .prepare(
      `UPDATE order_shipments
       SET tracking_email_sent_at = ?
       WHERE id = ? AND order_id = ? AND tracking_email_sent_at IS NULL;`
    )
    .bind(claimedAt, shipmentId, orderId)
    .run();

  const changes = Number(claim.meta?.changes ?? 0);
  if (Number.isFinite(changes) && changes > 0) return true;
  if (Number.isFinite(changes) && changes === 0) return false;

  const row = await db
    .prepare(
      `SELECT tracking_email_sent_at
       FROM order_shipments
       WHERE id = ? AND order_id = ?
       LIMIT 1;`
    )
    .bind(shipmentId, orderId)
    .first<{ tracking_email_sent_at: string | null }>();
  return trimOrNull(row?.tracking_email_sent_at) === claimedAt;
};

export const maybeSendTrackingEmail = async (params: {
  env: EmailEnv & { DB: D1Database };
  db: D1Database;
  orderId: string;
  shipmentId: string;
  previousTrackingNumber: string | null | undefined;
  newTrackingNumber: string | null | undefined;
}): Promise<{ sent: boolean; skippedReason?: string }> => {
  const previousTracking = trimOrNull(params.previousTrackingNumber);
  if (previousTracking) {
    return { sent: false, skippedReason: 'previous_tracking_exists' };
  }

  const newTracking = trimOrNull(params.newTrackingNumber);
  if (!newTracking) {
    return { sent: false, skippedReason: 'tracking_missing' };
  }

  const signals = await readShipmentSignals(params.db, params.orderId, params.shipmentId);
  if (!signals) {
    return { sent: false, skippedReason: 'shipment_not_found' };
  }
  if (trimOrNull(signals.tracking_email_sent_at)) {
    return { sent: false, skippedReason: 'already_sent' };
  }
  if (!trimOrNull(signals.customer_email)) {
    return { sent: false, skippedReason: 'missing_customer_email' };
  }
  if (!trimOrNull(signals.tracking_number)) {
    return { sent: false, skippedReason: 'tracking_missing_after_persist' };
  }

  const claimedAt = new Date().toISOString();
  const claimed = await claimTrackingEmailSend(params.db, params.orderId, params.shipmentId, claimedAt);
  if (!claimed) {
    return { sent: false, skippedReason: 'already_claimed' };
  }

  const context = await getTrackingEmailContext(params.db, params.orderId, params.shipmentId);
  if (!context) {
    await clearTrackingEmailClaim(params.db, params.orderId, params.shipmentId, claimedAt);
    return { sent: false, skippedReason: 'missing_email_context' };
  }

  const emailResult = await sendTrackingUpdateEmail(params.env, context);
  if (!emailResult.ok) {
    await clearTrackingEmailClaim(params.db, params.orderId, params.shipmentId, claimedAt);
    console.error('[tracking-email] send failed', {
      orderId: params.orderId,
      shipmentId: params.shipmentId,
    });
    return { sent: false, skippedReason: 'email_send_failed' };
  }

  console.log('[tracking-email] sent', {
    orderId: params.orderId,
    shipmentId: params.shipmentId,
  });
  return { sent: true };
};
