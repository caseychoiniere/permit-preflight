"use client";

/**
 * Account home - report history (workflow 4a) + claim a purchase (workflow 3, both paths) +
 * delete account (workflow 5) + logout, on one page (deliberately not three separate routes, to
 * keep the surface minimal per requirements.md §2.4). Not built here: profile/avatar editing,
 * password-reset UI, org/team switcher, notification preferences, saved-search UI, save/resume UI
 * (frontend-components.md's own explicit avoid-list).
 */

import { useEffect, useState } from "react";
import { Container } from "../components/ui/Container.js";
import { Card } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";

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

  if (reports === "LOADING")
    return (
      <Container>
        <p className="text-sm text-slate-500">Loading...</p>
      </Container>
    );
  if (reports === "SIGNED_OUT") {
    return (
      <Container className="max-w-md">
        <Card>
          <p className="text-sm text-slate-600">You&apos;re not signed in.</p>
          <a href="/account/login" className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500">
            Sign in
          </a>
        </Card>
      </Container>
    );
  }

  return (
    <Container>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Your account</h1>
        <Button variant="secondary" onClick={handleLogout}>
          Log out
        </Button>
      </div>

      <h2 className="mb-3 text-base font-semibold text-slate-900">Your reports</h2>
      {reports.length === 0 ? (
        <p className="mb-8 text-sm text-slate-500">No reports linked to this account yet.</p>
      ) : (
        <div className="mb-8 flex flex-col gap-3">
          {reports.map((r) => (
            <Card key={r.orderId}>
              <a href={`/account/reports/${r.orderId}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
                View report
              </a>
              <p className="mt-1 text-sm text-slate-500">
                Linked {new Date(r.linkedAt).toLocaleDateString()} via {r.linkMethod} - order status: {r.orderState}
              </p>
            </Card>
          ))}
        </div>
      )}

      <Card className="mb-8">
        <h2 className="text-base font-semibold text-slate-900">Claim a purchase</h2>
        {claimMessage && <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{claimMessage}</p>}
        <form onSubmit={handleClaimByEmail} className="mt-4">
          <label className="block text-sm font-medium text-slate-700">
            Order reference
            <input
              value={claimOrderId}
              onChange={(e) => setClaimOrderId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          <Button type="submit" variant="primary" className="mt-3">
            Send verification email
          </Button>
        </form>
        <form onSubmit={handleClaimByToken} className="mt-6 border-t border-slate-100 pt-4">
          <label className="block text-sm font-medium text-slate-700">
            Or paste your report access link or token
            <input
              value={claimToken}
              onChange={(e) => setClaimToken(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          <Button type="submit" variant="primary" className="mt-3">
            Claim with token
          </Button>
        </form>
      </Card>

      <Card className="border-red-200">
        <h2 className="text-base font-semibold text-red-700">Delete account</h2>
        {!confirmingDelete ? (
          <Button variant="danger" className="mt-3" onClick={() => setConfirmingDelete(true)}>
            Delete account
          </Button>
        ) : (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-900">
              This deletes your account, sessions, and outstanding sign-in/claim links immediately. Your prior orders and reports are
              <strong> retained</strong> and remain unaffected - only the account relationship to them is removed.
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="danger" onClick={handleDelete}>
                Confirm permanent deletion
              </Button>
              <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>
    </Container>
  );
}
