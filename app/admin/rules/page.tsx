"use client";

/** AdminRuleList (ADM-2, frontend-components.md). */

import { useEffect, useState } from "react";
import type { RegulatoryRule } from "../../../src/regulatory-rule-governance/types.js";
import { WideContainer } from "../../components/ui/Container.js";
import { Badge, type BadgeTone } from "../../components/ui/Badge.js";

const LIFECYCLE_TONE: Record<string, BadgeTone> = {
  RESEARCHED: "neutral",
  DRAFTED: "neutral",
  TRIAGED: "info",
  SOURCE_VERIFIED: "info",
  TESTED: "info",
  APPROVED: "info",
  ACTIVE: "success",
  SUPERSEDED: "neutral",
  DISABLED: "danger",
};

export default function AdminRulesPage() {
  const [rules, setRules] = useState<RegulatoryRule[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/rules")
      .then((res) => res.json())
      .then((data: { rules: RegulatoryRule[] }) => setRules(data.rules));
  }, []);

  return (
    <WideContainer>
      <a href="/admin" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
        &larr; Admin home
      </a>
      <h1 className="mt-3 text-xl font-semibold text-slate-900">Regulatory Rules</h1>
      {!rules && <p className="mt-4 text-sm text-slate-500">Loading...</p>}
      {rules && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Project Type</th>
                <th className="px-4 py-3">Zone</th>
                <th className="px-4 py-3">Lifecycle State</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <a href={`/admin/rules/${rule.id}`} className="font-medium text-indigo-600 hover:text-indigo-500">
                      {rule.subject}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{rule.applicableProjectType}</td>
                  <td className="px-4 py-3 text-slate-700">{rule.applicableZone}</td>
                  <td className="px-4 py-3">
                    <Badge tone={LIFECYCLE_TONE[rule.lifecycleState] ?? "neutral"}>{rule.lifecycleState}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WideContainer>
  );
}
