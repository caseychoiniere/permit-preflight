"use client";

/**
 * AdminOrderSearch (ADM-5, frontend-components.md). Exact-match search only - by order ID,
 * customer email, or report/artifact ID (corrected 2026-08-25). POSTs to
 * /api/admin/orders/search with a JSON body so the searched email never appears in the browser
 * URL, a request path, or a query string - the URL for this page always stays /admin/orders.
 */

import { useState } from "react";
import type { AdminOrderView } from "../../../src/order-payment/admin-view.js";

type SearchKind = "orderId" | "email" | "reportId";

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
    <div style={{ padding: 24, maxWidth: 960 }}>
      <p>
        <a href="/admin">&larr; Admin home</a>
      </p>
      <h1>Order Search</h1>
      <p style={{ color: "#555" }}>Exact match only - order ID, customer email, or report/artifact ID. No partial/wildcard search.</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <select value={kind} onChange={(e) => setKind(e.target.value as SearchKind)} style={{ padding: 8 }}>
          <option value="email">Customer email</option>
          <option value="orderId">Order ID</option>
          <option value="reportId">Report/Artifact ID</option>
        </select>
        <input
          type={kind === "email" ? "email" : "text"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          style={{ flex: 1, padding: 8 }}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <button onClick={search} disabled={loading || !value.trim()}>
          {loading ? "Searching..." : "Search"}
        </button>
      </div>
      {error && <p style={{ color: "#a00" }}>{error}</p>}
      {orders && orders.length === 0 && <p>No matching orders found.</p>}
      {orders && orders.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                <th style={{ padding: 8 }}>Order ID</th>
                <th style={{ padding: 8 }}>State</th>
                <th style={{ padding: 8 }}>Price</th>
                <th style={{ padding: 8 }}>Paid At</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>
                    <a href={`/admin/orders/${order.id}`}>{order.id}</a>
                  </td>
                  <td style={{ padding: 8 }}>{order.state}</td>
                  <td style={{ padding: 8 }}>
                    {(order.priceCents / 100).toFixed(2)} {order.currency.toUpperCase()}
                  </td>
                  <td style={{ padding: 8 }}>{order.paidAt ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
