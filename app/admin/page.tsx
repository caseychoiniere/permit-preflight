/**
 * Admin/Support Service landing page (Unit 3) - a coordination/read layer over components that
 * already own the underlying state (Order & Payment, Regulatory Rule Governance, Data Source
 * Registry, Report Generation Job) - never duplicating it. Desktop-focused (NFR-U3-7), no
 * dedicated mobile design, but resilient - no fixed desktop-only widths.
 */

import { WideContainer } from "../components/ui/Container.js";
import { Card } from "../components/ui/Card.js";

const LINKS = [
  { href: "/admin/orders", title: "Orders", description: "Search by customer email, view order/report detail, initiate a refund" },
  { href: "/admin/rules", title: "Regulatory Rules", description: "Version/lifecycle history, disable/re-enable" },
  { href: "/admin/data-sources", title: "Data Sources", description: "Observed/override/effective health, set/clear an override" },
  { href: "/admin/failed-jobs", title: "Failed Report Jobs", description: "Read-only" },
];

export default function AdminHomePage() {
  return (
    <WideContainer>
      <h1 className="text-xl font-semibold text-slate-900">Admin</h1>
      <p className="mt-1 text-sm text-slate-500">Internal support tools. Every action taken here is attributed and audited.</p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} className="block">
            <Card className="h-full transition-shadow hover:shadow-md">
              <h2 className="text-sm font-semibold text-indigo-600">{link.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{link.description}</p>
            </Card>
          </a>
        ))}
      </div>
    </WideContainer>
  );
}
