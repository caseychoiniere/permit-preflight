"use client";

/** AdminRuleDetail + RuleLifecycleActionForm (ADM-2/ADM-7, frontend-components.md). Renders
 * Disable OR Re-Enable, never both - the Re-Enable form carries a static reminder that this never
 * edits content. */

import { use, useState } from "react";
import type { RegulatoryRule } from "../../../../src/regulatory-rule-governance/types.js";
import { Container } from "../../../components/ui/Container.js";
import { Card } from "../../../components/ui/Card.js";
import { Button } from "../../../components/ui/Button.js";
import { Badge, type BadgeTone } from "../../../components/ui/Badge.js";

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

export default function AdminRuleDetailPage({ params }: { params: Promise<{ ruleId: string }> }) {
  const { ruleId } = use(params);
  const [rule, setRule] = useState<RegulatoryRule | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const res = await fetch(`/api/admin/rules/${ruleId}`);
    if (res.ok) {
      const data = (await res.json()) as { rule: RegulatoryRule };
      setRule(data.rule);
    }
    setLoaded(true);
  }

  if (!loaded) {
    void load();
    return (
      <Container>
        <p className="text-sm text-slate-500">Loading...</p>
      </Container>
    );
  }
  if (!rule) {
    return (
      <Container>
        <p className="text-sm text-slate-600">Rule not found.</p>
      </Container>
    );
  }

  const action = rule.lifecycleState === "ACTIVE" ? "disable" : rule.lifecycleState === "DISABLED" ? "reenable" : null;

  async function submit() {
    if (!action) return;
    setError(null);
    setStatus(null);
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/rules/${ruleId}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = (await res.json()) as { rule?: RegulatoryRule; error?: string };
      if (!res.ok) {
        setError(body.error ?? `Request failed (${res.status}).`);
        return;
      }
      if (body.rule) setRule(body.rule);
      setStatus(action === "disable" ? "Rule disabled." : "Rule re-enabled.");
      setReason("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Container>
      <a href="/admin/rules" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
        &larr; Rule list
      </a>
      <h1 className="mt-3 text-xl font-semibold text-slate-900">{rule.subject}</h1>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-slate-500">Lifecycle state:</span>
          <Badge tone={LIFECYCLE_TONE[rule.lifecycleState] ?? "neutral"}>{rule.lifecycleState}</Badge>
          {rule.lifecycleState === "DISABLED" && <span className="text-slate-500">operator-toggled off, reversible, content unchanged (ADM-7).</span>}
          {rule.lifecycleState === "SUPERSEDED" && <span className="text-slate-500">permanently replaced by a newer version; not an operator toggle.</span>}
        </div>
        <p className="mt-3 text-sm text-slate-700">
          <strong className="font-medium text-slate-500">Applicable:</strong> {rule.applicableProjectType} / {rule.applicableZone}
        </p>
        <p className="mt-1 text-sm text-slate-700">
          <strong className="font-medium text-slate-500">Tier:</strong> {rule.tier ?? "—"}
        </p>
      </Card>

      <h2 className="mb-3 mt-6 text-base font-semibold text-slate-900">Citation</h2>
      <Card>
        <p className="text-sm text-slate-700">
          <strong className="font-medium text-slate-500">SMC sections:</strong> {rule.citation.smcSections.join(", ") || "—"}
        </p>
        <p className="mt-1 text-sm text-slate-700">
          <strong className="font-medium text-slate-500">Ordinance number:</strong> {rule.citation.ordinanceNumber ?? "—"}
        </p>
        <p className="mt-1 text-sm text-slate-700">
          <strong className="font-medium text-slate-500">Effective date:</strong> {rule.citation.effectiveDate ?? "—"}
          {rule.citation.effectiveDateBasis ? ` (${rule.citation.effectiveDateBasis})` : ""}
        </p>
      </Card>

      <h2 className="mb-3 mt-6 text-base font-semibold text-slate-900">Approval Provenance</h2>
      <Card>
        {rule.approvalRecord ? (
          <p className="text-sm text-slate-700">
            Approved by <strong>{rule.approvalRecord.founderIdentity}</strong> at {rule.approvalRecord.approvedAt}
          </p>
        ) : (
          <p className="text-sm text-slate-500">
            Not recorded - this rule predates the approval-provenance field. Not inferred from verification history, updatedAt, or the
            current lifecycle state, since those are different facts.
          </p>
        )}
      </Card>

      <h2 className="mb-3 mt-6 text-base font-semibold text-slate-900">Verification History</h2>
      {rule.verificationHistory.length === 0 && <p className="text-sm text-slate-500">None recorded.</p>}
      {rule.verificationHistory.length > 0 && (
        <ul className="flex flex-col gap-3">
          {rule.verificationHistory.map((v, i) => (
            <li key={i}>
              <Card>
                <p className="text-sm text-slate-700">
                  <strong>{v.tier}</strong> - founder <strong>{v.founderIdentity}</strong> at {v.founderVerifiedAt}
                </p>
                {v.escalatedProfessional && (
                  <div className="mt-2 border-l-2 border-slate-200 pl-3 text-sm text-slate-600">
                    Tier-2 professional review: <strong>{v.escalatedProfessional.identity}</strong> ({v.escalatedProfessional.professionType}) at{" "}
                    {v.escalatedProfessional.reviewedAt}
                    <br />
                    Opinion: {v.escalatedProfessional.opinion}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 mt-6 text-base font-semibold text-slate-900">Version Chain</h2>
      {!rule.supersedesRuleId && !rule.supersededByRuleId && <p className="text-sm text-slate-500">No other versions - this is the only version of this rule.</p>}
      {rule.supersedesRuleId && (
        <p className="text-sm text-slate-700">
          Supersedes (older version){" "}
          <a href={`/admin/rules/${rule.supersedesRuleId}`} className="font-medium text-indigo-600 hover:text-indigo-500">
            {rule.supersedesRuleId}
          </a>
        </p>
      )}
      {rule.supersededByRuleId && (
        <p className="text-sm text-slate-700">
          Superseded by (newer version){" "}
          <a href={`/admin/rules/${rule.supersededByRuleId}`} className="font-medium text-indigo-600 hover:text-indigo-500">
            {rule.supersededByRuleId}
          </a>
        </p>
      )}

      {!action && <p className="mt-6 text-sm text-slate-500">No disable/re-enable action applies to a rule in state {rule.lifecycleState}.</p>}
      {action === "reenable" && (
        <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Re-enabling reactivates this exact rule version unchanged. If the underlying problem requires changing any regulatory logic,
          applicability, threshold, or citation content, do NOT re-enable here - a corrected version must go through the full governance
          pipeline instead.
        </p>
      )}
      {action && (
        <Card className="mt-4 max-w-md">
          <label className="block text-sm font-medium text-slate-700">
            Reason (required)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          <Button variant={action === "disable" ? "danger" : "primary"} className="mt-3" onClick={submit} disabled={submitting}>
            {submitting ? "Submitting..." : action === "disable" ? "Disable Rule" : "Re-Enable Rule"}
          </Button>
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {status && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{status}</p>}
        </Card>
      )}
    </Container>
  );
}
