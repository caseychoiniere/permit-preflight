"use client";

/**
 * Account home - report history (workflow 4a) + claim a purchase (workflow 3, both paths) +
 * delete account (workflow 5) + logout, on one page (deliberately not three separate routes, to
 * keep the surface minimal per requirements.md §2.4). Not built here: profile/avatar editing,
 * password-reset UI, org/team switcher, notification preferences, saved-search UI, save/resume UI
 * (frontend-components.md's own explicit avoid-list).
 */

import { useEffect, useState } from "react";

interface ReportHistoryEntry {
  orderId: string;
  linkedAt: string;
  linkMethod: string;
  orderState: string;
}

export default function AccountPage() {
  const [reports, setReports] = useState<ReportHistoryEntry[] | "LOADING" | "SIGNED_OUT">("LOADING");
  const [claimOrderId, setClaimOrderId] = useState("");
  const [claimToken, setClaimToken] = useState("");
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function loadReports() {
    const res = await fetch("/api/account/reports", { cache: "no-store" });
    if (res.status === 401) {
      setReports("SIGNED_OUT");
      return;
    }
    const body = (await res.json()) as { reports: ReportHistoryEntry[] };
    setReports(body.reports);
  }

  useEffect(() => {
    void loadReports();
  }, []);

  async function handleClaimByEmail(e: React.FormEvent) {
    e.preventDefault();
    setClaimMessage(null);
    const res = await fetch("/api/account/claim/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: claimOrderId }),
    });
    if (res.status === 404) {
      setClaimMessage("We couldn't find that order. Double-check the order reference and try again.");
      return;
    }
    setClaimMessage("Check your email for a verification link to complete the claim.");
  }

  async function handleClaimByToken(e: React.FormEvent) {
    e.preventDefault();
    setClaimMessage(null);
    const res = await fetch("/api/account/claim/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: claimToken }),
    });
    if (res.status === 409) {
      setClaimMessage("That report access link is already linked to another account. Contact support if this seems wrong.");
      return;
    }
    if (!res.ok) {
      setClaimMessage("That report access link isn't valid or doesn't correspond to a purchase.");
      return;
    }
    setClaimMessage("Purchase added to your account.");
    setClaimToken("");
    await loadReports();
  }

  async function handleLogout() {
    await fetch("/api/account/logout", { method: "POST" });
    window.location.href = "/";
  }

  async function handleDelete() {
    await fetch("/api/account/delete", { method: "POST" });
    window.location.href = "/account/deleted";
  }

  if (reports === "LOADING") return <p>Loading...</p>;
  if (reports === "SIGNED_OUT") {
    return (
      <main style={{ maxWidth: 480, margin: "0 auto", padding: 24 }}>
        <p>You&apos;re not signed in.</p>
        <a href="/account/login">Sign in</a>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1>Your account</h1>
      <button onClick={handleLogout}>Log out</button>

      <h2>Your reports</h2>
      {reports.length === 0 ? (
        <p>No reports linked to this account yet.</p>
      ) : (
        reports.map((r) => (
          <div key={r.orderId} style={{ padding: 8, marginBottom: 8, border: "1px solid #ddd" }}>
            <a href={`/account/reports/${r.orderId}`}>View report</a>
            <p>
              Linked {new Date(r.linkedAt).toLocaleDateString()} via {r.linkMethod} - order status: {r.orderState}
            </p>
          </div>
        ))
      )}

      <h2>Claim a purchase</h2>
      {claimMessage && <p>{claimMessage}</p>}
      <form onSubmit={handleClaimByEmail} style={{ marginBottom: 16 }}>
        <label>
          Order reference
          <br />
          <input value={claimOrderId} onChange={(e) => setClaimOrderId(e.target.value)} style={{ width: "100%", padding: 8 }} />
        </label>
        <br />
        <button type="submit">Send verification email</button>
      </form>
      <form onSubmit={handleClaimByToken}>
        <label>
          Or paste your report access link or token
          <br />
          <input value={claimToken} onChange={(e) => setClaimToken(e.target.value)} style={{ width: "100%", padding: 8 }} />
        </label>
        <br />
        <button type="submit">Claim with token</button>
      </form>

      <h2 style={{ color: "#a00" }}>Delete account</h2>
      {!confirmingDelete ? (
        <button onClick={() => setConfirmingDelete(true)}>Delete account</button>
      ) : (
        <div style={{ border: "1px solid #a00", padding: 12 }}>
          <p>
            This deletes your account, sessions, and outstanding sign-in/claim links immediately. Your prior orders and reports are
            <strong> retained</strong> and remain unaffected - only the account relationship to them is removed.
          </p>
          <button onClick={handleDelete}>Confirm permanent deletion</button>
          <button onClick={() => setConfirmingDelete(false)}>Cancel</button>
        </div>
      )}
    </main>
  );
}
