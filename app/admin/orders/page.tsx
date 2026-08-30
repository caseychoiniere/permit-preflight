"use client";

/**
 * AdminOrderSearch (ADM-5, frontend-components.md). Exact-match search only - by order ID,
 * customer email, or report/artifact ID (corrected 2026-08-25). POSTs to
 * /api/admin/orders/search with a JSON body so the searched email never appears in the browser
 * URL, a request path, or a query string - the URL for this page always stays /admin/orders.
 */

import { useState } from "react";
import type { AdminOrderView } from "../../../src/order-payment/admin-view.js";
import { WideContainer } from "../../components/ui/Container.js";
import { Card } from "../../components/ui/Card.js";
import { Button } from "../../components/ui/Button.js";
import { Badge, type BadgeTone } from "../../components/ui/Badge.js";

type SearchKind = "orderId" | "email" | "reportId";

const ORDER_STATE_TONE: Record<string, BadgeTone> = {
  PENDING: "info",
  PAID: "success",
  REFUND_PENDING: "warning",
  REFUNDED: "neutral",
  REFUND_FAILED: "danger",
  EXPIRED: "neutral",
};

export default function AdminOrdersPage() {
  const [kind, setKind] = useState<SearchKind>("email");
  const [value, setValue] = useState("");
  const [orders, setOrders] = useState<AdminOrderView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function search() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/orders/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, value }),
      });
      if (!res.ok) {
        setError(`Search failed (${res.status}).`);
        setOrders(null);
        return;
      }
      const data = (await res.json()) as { orders: AdminOrderView[] };
      setOrders(data.orders);
    } finally {
      setLoading(false);
    }
  }

  const placeholder = kind === "email" ? "customer@example.com" : kind === "orderId" ? "order UUID" : "report/artifact UUID";

  return (
    <WideContainer>
      <a href="/admin" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
        &larr; Admin home
      </a>
      <h1 className="mt-3 text-xl font-semibold text-slate-900">Order Search</h1>
      <p className="mt-1 text-sm text-slate-500">Exact match only - order ID, customer email, or report/artifact ID. No partial/wildcard search.</p>

      <Card className="mt-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as SearchKind)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="email">Customer email</option>
            <option value="orderId">Order ID</option>
            <option value="reportId">Report/Artifact ID</option>
          </select>
          <input
            type={kind === "email" ? "email" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => e.key === "Enter" && search()}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <Button variant="primary" onClick={search} disabled={loading || !value.trim()}>
            {loading ? "Searching..." : "Search"}
          </Button>
        </div>
      </Card>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {orders && orders.length === 0 && <p className="mt-4 text-sm text-slate-500">No matching orders found.</p>}
      {orders && orders.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Order ID</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Paid At</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <a href={`/admin/orders/${order.id}`} className="font-medium text-indigo-600 hover:text-indigo-500">
                      {order.id}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={ORDER_STATE_TONE[order.state] ?? "neutral"}>{order.state}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {(order.priceCents / 100).toFixed(2)} {order.currency.toUpperCase()}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{order.paidAt ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WideContainer>
  );
}
