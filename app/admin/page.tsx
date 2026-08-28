/**
 * Admin/Support Service landing page (Unit 3) - a coordination/read layer over components that
 * already own the underlying state (Order & Payment, Regulatory Rule Governance, Data Source
 * Registry, Report Generation Job) - never duplicating it. Desktop-focused (NFR-U3-7), no
 * dedicated mobile design, but resilient - no fixed desktop-only widths.
 */

export default function AdminHomePage() {
  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h1>Permit Preflight - Admin</h1>
      <p style={{ color: "#555" }}>Internal support tools. Every action taken here is attributed and audited.</p>
      <ul style={{ lineHeight: 2 }}>
        <li>
          <a href="/admin/orders">Orders</a> - search by customer email, view order/report detail, initiate a refund
        </li>
        <li>
          <a href="/admin/rules">Regulatory Rules</a> - version/lifecycle history, disable/re-enable
        </li>
        <li>
          <a href="/admin/data-sources">Data Sources</a> - observed/override/effective health, set/clear an override
        </li>
        <li>
          <a href="/admin/failed-jobs">Failed Report Jobs</a> - read-only
        </li>
      </ul>
    </div>
  );
}
