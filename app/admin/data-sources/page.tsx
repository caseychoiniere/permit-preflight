"use client";

/** AdminDataSourceList + DataSourceOverrideForm (ADM-3/ADM-8, frontend-components.md). Shows
 * observed/override/effective state distinctly; clearing an override is shown as taking effect
 * immediately - it is not a separate, delayed operation. */

import { useEffect, useState } from "react";
import type { SourceHealthSnapshot } from "../../../src/data-source-registry/types.js";

interface AdminSourceView extends SourceHealthSnapshot {
  expectedRefreshCadence?: string;
  description?: string;
}

export default function AdminDataSourcesPage() {
  const [sources, setSources] = useState<AdminSourceView[] | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, string>>({});

  async function load() {
    const res = await fetch("/api/admin/data-sources");
    const data = (await res.json()) as { sources: AdminSourceView[] };
    setSources(data.sources);
  }

  useEffect(() => {
    void load();
  }, []);

  async function markUnhealthy(sourceId: string) {
    const reason = reasons[sourceId]?.trim();
    if (!reason) {
      setStatus((s) => ({ ...s, [sourceId]: "A reason is required." }));
      return;
    }
    const res = await fetch(`/api/admin/data-sources/${sourceId}/override`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: "UNHEALTHY", reason }),
    });
    setStatus((s) => ({ ...s, [sourceId]: res.ok ? "Marked unhealthy." : "Request failed." }));
    if (res.ok) await load();
  }

  async function clearOverride(sourceId: string) {
    const reason = reasons[sourceId]?.trim();
    if (!reason) {
      setStatus((s) => ({ ...s, [sourceId]: "A reason is required." }));
      return;
    }
    const res = await fetch(`/api/admin/data-sources/${sourceId}/override/clear`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setStatus((s) => ({ ...s, [sourceId]: res.ok ? "Override cleared - now reflects the current observed value immediately." : "Request failed." }));
    if (res.ok) await load();
  }

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <p>
        <a href="/admin">&larr; Admin home</a>
      </p>
      <h1>Data Sources</h1>
      {!sources && <p>Loading...</p>}
      {sources && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                <th style={{ padding: 8 }}>Source</th>
                <th style={{ padding: 8 }}>Expected Cadence</th>
                <th style={{ padding: 8 }}>Observed (automated)</th>
                <th style={{ padding: 8 }}>Override</th>
                <th style={{ padding: 8 }}>Effective</th>
                <th style={{ padding: 8 }}>Last Success</th>
                <th style={{ padding: 8 }}>Last Failure</th>
                <th style={{ padding: 8 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.sourceId} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 8 }} title={source.description}>
                    {source.sourceId}
                  </td>
                  <td style={{ padding: 8 }}>{source.expectedRefreshCadence ?? "—"}</td>
                  <td style={{ padding: 8 }}>{source.observedHealthState}</td>
                  <td style={{ padding: 8 }}>{source.manualOverrideState ?? "none"}</td>
                  <td style={{ padding: 8, fontWeight: "bold" }}>{source.effectiveHealthState}</td>
                  <td style={{ padding: 8 }}>{source.lastSuccessfulRetrieval ?? "—"}</td>
                  <td style={{ padding: 8 }}>
                    {source.lastFailureAt ?? "—"}
                    {source.lastFailureReason ? ` (${source.lastFailureReason})` : ""}
                  </td>
                  <td style={{ padding: 8, minWidth: 260 }}>
                    <input
                      type="text"
                      placeholder="reason (required)"
                      value={reasons[source.sourceId] ?? ""}
                      onChange={(e) => setReasons((r) => ({ ...r, [source.sourceId]: e.target.value }))}
                      style={{ width: "100%", padding: 4, marginBottom: 4 }}
                    />
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => markUnhealthy(source.sourceId)}>Mark Unhealthy</button>
                      {source.manualOverrideState && <button onClick={() => clearOverride(source.sourceId)}>Clear Override</button>}
                    </div>
                    {status[source.sourceId] && <p style={{ fontSize: 12, color: "#555" }}>{status[source.sourceId]}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
