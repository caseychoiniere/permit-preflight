"use client";

/** AdminRuleDetail + RuleLifecycleActionForm (ADM-2/ADM-7, frontend-components.md). Renders
 * Disable OR Re-Enable, never both - the Re-Enable form carries a static reminder that this never
 * edits content. */

import { use, useState } from "react";
import type { RegulatoryRule } from "../../../../src/regulatory-rule-governance/types.js";

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
    return <div style={{ padding: 24 }}>Loading...</div>;
  }
  if (!rule) {
    return (
      <div style={{ padding: 24 }}>
        <p>Rule not found.</p>
      </div>
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
    <div style={{ padding: 24, maxWidth: 720 }}>
      <p>
        <a href="/admin/rules">&larr; Rule list</a>
      </p>
      <h1>{rule.subject}</h1>
      <p>
        <strong>Lifecycle state:</strong> {rule.lifecycleState}
        {rule.lifecycleState === "DISABLED" && " - operator-toggled off, reversible, content unchanged (ADM-7)."}
        {rule.lifecycleState === "SUPERSEDED" && " - permanently replaced by a newer version; not an operator toggle."}
      </p>
      <p>
        <strong>Applicable:</strong> {rule.applicableProjectType} / {rule.applicableZone}
      </p>
      <p>
        <strong>Tier:</strong> {rule.tier ?? "—"}
      </p>

      <h2>Citation</h2>
      <p>
        <strong>SMC sections:</strong> {rule.citation.smcSections.join(", ") || "—"}
      </p>
      <p>
        <strong>Ordinance number:</strong> {rule.citation.ordinanceNumber ?? "—"}
      </p>
      <p>
        <strong>Effective date:</strong> {rule.citation.effectiveDate ?? "—"}
        {rule.citation.effectiveDateBasis ? ` (${rule.citation.effectiveDateBasis})` : ""}
      </p>

      <h2>Approval Provenance</h2>
      {rule.approvalRecord ? (
        <p>
          Approved by <strong>{rule.approvalRecord.founderIdentity}</strong> at {rule.approvalRecord.approvedAt}
        </p>
      ) : (
        <p style={{ color: "#555" }}>
          Not recorded - this rule predates the approval-provenance field. Not inferred from verification history, updatedAt, or the
          current lifecycle state, since those are different facts.
        </p>
      )}

      <h2>Verification History</h2>
      {rule.verificationHistory.length === 0 && <p>None recorded.</p>}
      {rule.verificationHistory.length > 0 && (
        <ul>
          {rule.verificationHistory.map((v, i) => (
            <li key={i} style={{ marginBottom: 8 }}>
              <strong>{v.tier}</strong> - founder <strong>{v.founderIdentity}</strong> at {v.founderVerifiedAt}
              {v.escalatedProfessional && (
                <div style={{ marginLeft: 16 }}>
                  Tier-2 professional review: <strong>{v.escalatedProfessional.identity}</strong> ({v.escalatedProfessional.professionType}) at{" "}
                  {v.escalatedProfessional.reviewedAt}
                  <br />
                  Opinion: {v.escalatedProfessional.opinion}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2>Version Chain</h2>
      {!rule.supersedesRuleId && !rule.supersededByRuleId && <p>No other versions - this is the only version of this rule.</p>}
      {rule.supersedesRuleId && (
        <p>
          Supersedes (older version) <a href={`/admin/rules/${rule.supersedesRuleId}`}>{rule.supersedesRuleId}</a>
        </p>
      )}
      {rule.supersededByRuleId && (
        <p>
          Superseded by (newer version) <a href={`/admin/rules/${rule.supersededByRuleId}`}>{rule.supersededByRuleId}</a>
        </p>
      )}

      {!action && <p style={{ color: "#555" }}>No disable/re-enable action applies to a rule in state {rule.lifecycleState}.</p>}
      {action === "reenable" && (
        <p style={{ color: "#a60", border: "1px solid #a60", padding: 8 }}>
          Re-enabling reactivates this exact rule version unchanged. If the underlying problem requires changing any regulatory logic,
          applicability, threshold, or citation content, do NOT re-enable here - a corrected version must go through the full governance
          pipeline instead.
        </p>
      )}
      {action && (
        <div style={{ maxWidth: 480 }}>
          <label style={{ display: "block", marginBottom: 8 }}>
            Reason (required)
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }} />
          </label>
          <button onClick={submit} disabled={submitting}>
            {submitting ? "Submitting..." : action === "disable" ? "Disable Rule" : "Re-Enable Rule"}
          </button>
          {error && <p style={{ color: "#a00" }}>{error}</p>}
          {status && <p style={{ color: "#070" }}>{status}</p>}
        </div>
      )}
    </div>
  );
}
