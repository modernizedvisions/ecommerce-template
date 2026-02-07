import React from 'react';
import { AdminSectionHeader } from './AdminSectionHeader';
import type { AdminOrder } from '../../lib/db/orders';
import { formatEasternDateTime } from '../../lib/dates';

export interface AdminOrdersTabProps {
  searchQuery: string;
  filteredOrders: AdminOrder[];
  onSearchChange: (value: string) => void;
  onSelectOrder: (order: AdminOrder) => void;
  loading?: boolean;
  error?: string | null;
}

export function AdminOrdersTab({ searchQuery, filteredOrders, onSearchChange, onSelectOrder, loading, error }: AdminOrdersTabProps) {
  return (
    <div className="lux-card p-6">
      <AdminSectionHeader
        title="Orders"
        subtitle="View and manage storefront orders."
      />
      <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by order ID, customer, or product..."
          className="lux-input sm:max-w-md text-sm"
        />
      </div>
      {loading ? (
        <div className="p-8 text-center text-charcoal/70">Loading orders...</div>
      ) : error ? (
        <div className="p-8 text-center text-rose-700">
          Failed to load orders{error ? `: ${error}` : ''}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="p-8 text-center text-charcoal/60">
          <div>No orders found</div>
        </div>
      ) : (
        <>
          <div className="sm:hidden">
            <table className="min-w-full divide-y divide-driftwood/50">
              <thead className="bg-linen/70">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Customer</th>
                  <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Total</th>
                  <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white/80 divide-y divide-driftwood/40">
                {filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-4 py-4 text-sm text-charcoal whitespace-normal break-words leading-tight">
                      <div className="flex items-center gap-2">
                        <span>{order.shippingName || order.customerName || 'Customer'}</span>
                        {order.isSeen === false && (
                          <span className="inline-flex h-2 w-2 rounded-ui bg-soft-gold ring-1 ring-deep-ocean/20" aria-label="Unseen order" />
                        )}
                      </div>
                      <div className="text-xs text-charcoal/60">{order.customerEmail || 'No email'}</div>
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap text-sm text-charcoal">
                      ${(((order.amountTotalCents ?? order.totalCents) || 0) / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelectOrder(order)}
                        className="lux-button--ghost px-3 py-1 text-[10px]"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hidden sm:block">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-driftwood/50">
                <thead className="bg-linen/70">
                  <tr>
                    <th className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Order ID</th>
                    <th className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Date / Time</th>
                    <th className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Customer</th>
                    <th className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Items</th>
                    <th className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Total</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white/80 divide-y divide-driftwood/40">
                {filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-charcoal font-mono">
                      {order.displayOrderId || order.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-charcoal">
                      {formatEasternDateTime(order.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-sm text-charcoal">
                      <div className="flex items-center gap-2">
                        <span>{order.shippingName || order.customerName || 'Customer'}</span>
                        {order.isSeen === false && (
                          <span className="inline-flex h-2 w-2 rounded-ui bg-soft-gold ring-1 ring-deep-ocean/20" aria-label="Unseen order" />
                        )}
                      </div>
                      <div className="text-charcoal/60">{order.customerEmail || 'No email'}</div>
                    </td>
                      <td className="px-6 py-4 text-sm text-charcoal">{order.items?.length || 0} items</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-charcoal">
                        ${(((order.amountTotalCents ?? order.totalCents) || 0) / 100).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onSelectOrder(order)}
                          className="lux-button--ghost px-3 py-1 text-[10px]"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
