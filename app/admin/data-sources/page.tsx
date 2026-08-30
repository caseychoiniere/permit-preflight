"use client";

/** AdminDataSourceList + DataSourceOverrideForm (ADM-3/ADM-8, frontend-components.md). Shows
 * observed/override/effective state distinctly; clearing an override is shown as taking effect
 * immediately - it is not a separate, delayed operation. */

import { useEffect, useState } from "react";
import type { SourceHealthSnapshot } from "../../../src/data-source-registry/types.js";
import { WideContainer } from "../../components/ui/Container.js";
import { Button } from "../../components/ui/Button.js";
import { Badge, type BadgeTone } from "../../components/ui/Badge.js";

interface AdminSourceView extends SourceHealthSnapshot {
  expectedRefreshCadence?: string;
  description?: string;
}

const HEALTH_TONE: Record<string, BadgeTone> = {
  HEALTHY: "success",
  UNHEALTHY: "danger",
  UNKNOWN: "neutral",
};

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
    <WideContainer>
      <a href="/admin" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
        &larr; Admin home
      </a>
      <h1 className="mt-3 text-xl font-semibold text-slate-900">Data Sources</h1>
      {!sources && <p className="mt-4 text-sm text-slate-500">Loading...</p>}
      {sources && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Expected Cadence</th>
                <th className="px-4 py-3">Observed</th>
                <th className="px-4 py-3">Override</th>
                <th className="px-4 py-3">Effective</th>
                <th className="px-4 py-3">Last Success</th>
                <th className="px-4 py-3">Last Failure</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.sourceId} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="px-4 py-3 font-medium text-slate-900" title={source.description}>
                    {source.sourceId}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{source.expectedRefreshCadence ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={HEALTH_TONE[source.observedHealthState] ?? "neutral"}>{source.observedHealthState}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{source.manualOverrideState ?? "none"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={HEALTH_TONE[source.effectiveHealthState] ?? "neutral"}>{source.effectiveHealthState}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{source.lastSuccessfulRetrieval ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {source.lastFailureAt ?? "—"}
                    {source.lastFailureReason ? ` (${source.lastFailureReason})` : ""}
                  </td>
                  <td className="min-w-[260px] px-4 py-3">
                    <input
                      type="text"
                      placeholder="reason (required)"
                      value={reasons[source.sourceId] ?? ""}
                      onChange={(e) => setReasons((r) => ({ ...r, [source.sourceId]: e.target.value }))}
                      className="mb-2 block w-full rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="danger" onClick={() => markUnhealthy(source.sourceId)}>
                        Mark Unhealthy
                      </Button>
                      {source.manualOverrideState && (
                        <Button variant="secondary" onClick={() => clearOverride(source.sourceId)}>
                          Clear Override
                        </Button>
                      )}
                    </div>
                    {status[source.sourceId] && <p className="mt-1 text-xs text-slate-500">{status[source.sourceId]}</p>}
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
