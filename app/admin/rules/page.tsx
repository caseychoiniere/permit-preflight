"use client";

/** AdminRuleList (ADM-2, frontend-components.md). */

import { useEffect, useState } from "react";
import type { RegulatoryRule } from "../../../src/regulatory-rule-governance/types.js";

export default function AdminRulesPage() {
  const [rules, setRules] = useState<RegulatoryRule[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/rules")
      .then((res) => res.json())
      .then((data: { rules: RegulatoryRule[] }) => setRules(data.rules));
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <p>
        <a href="/admin">&larr; Admin home</a>
      </p>
      <h1>Regulatory Rules</h1>
      {!rules && <p>Loading...</p>}
      {rules && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                <th style={{ padding: 8 }}>Subject</th>
                <th style={{ padding: 8 }}>Project Type</th>
                <th style={{ padding: 8 }}>Zone</th>
                <th style={{ padding: 8 }}>Lifecycle State</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>
                    <a href={`/admin/rules/${rule.id}`}>{rule.subject}</a>
                  </td>
                  <td style={{ padding: 8 }}>{rule.applicableProjectType}</td>
                  <td style={{ padding: 8 }}>{rule.applicableZone}</td>
                  <td style={{ padding: 8 }}>{rule.lifecycleState}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
