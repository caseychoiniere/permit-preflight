"use client";

/**
 * completeClaimByEmail (workflow 3, Path A completion) - CORRECTED (NFR Design review): requires
 * both the token AND an active AccountSession whose account matches the token's own bound
 * account. This page does NOT silently complete a claim while unauthenticated or authenticated as
 * a different account - a single generic failure message covers every case (unknown/expired/
 * consumed token, no session, or a session belonging to a different account), per workflow 3's
 * no-oracle principle. Accepted MVP limitation: no cross-device claim-transfer/session-handoff
 * infrastructure is built in Unit 6.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const TOKEN_HASH_PREFIX = "#token=";

export default function AccountClaimVerifyPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"LOADING" | "FAILED">("LOADING");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const hash = window.location.hash;
      if (!hash.startsWith(TOKEN_HASH_PREFIX)) {
        if (!cancelled) setStatus("FAILED");
        return;
      }
      const token = decodeURIComponent(hash.slice(TOKEN_HASH_PREFIX.length));
      window.history.replaceState(null, "", "/account/claim/verify");

      const res = await fetch("/api/account/verify-claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (cancelled) return;
      if (!res.ok) {
        setStatus("FAILED");
        return;
      }
      router.push("/account");
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (status === "LOADING") return <p>Confirming your purchase...</p>;
  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 24 }}>
      <p>Open this verification link in the browser/account where you started the claim, or sign in and request a new verification email.</p>
      <a href="/account/login">Sign in</a>
    </main>
  );
}
