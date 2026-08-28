"use client";

/**
 * verifyLoginLink (workflow 2) - the raw token is NEVER in the URL query string or path (NFR-U6-5).
 * The emailed link carries it in the URL FRAGMENT (#token=...), which the browser never sends to
 * any server. On load: read location.hash, immediately history.replaceState to strip it from the
 * visible URL/history, then POST {token} to the verification endpoint. Mirrors app/report/page.tsx's
 * own already-working fragment-to-POST exchange exactly.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const TOKEN_HASH_PREFIX = "#token=";

export default function AccountVerifyPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"LOADING" | "INVALID">("LOADING");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const hash = window.location.hash;
      if (!hash.startsWith(TOKEN_HASH_PREFIX)) {
        if (!cancelled) setStatus("INVALID");
        return;
      }
      const token = decodeURIComponent(hash.slice(TOKEN_HASH_PREFIX.length));
      window.history.replaceState(null, "", "/account/verify");

      const res = await fetch("/api/account/verify-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (cancelled) return;
      if (!res.ok) {
        setStatus("INVALID");
        return;
      }
      router.push("/account");
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (status === "LOADING") return <p>Signing you in...</p>;
  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 24 }}>
      <p>This link is invalid or has expired.</p>
      <a href="/account/login">Request a new sign-in link</a>
    </main>
  );
}
