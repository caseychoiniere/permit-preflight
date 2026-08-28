"use client";

/**
 * requestLoginLink (workflow 1) - single email input, always renders the same "check your email"
 * confirmation state regardless of whether an Account already exists for the address (BR-U6-1,
 * NFR-U6-8). No password field, no OAuth buttons, no "forgot password" link - none exist. Guest
 * checkout (app/configure/page.tsx) is entirely unchanged and does not link here or require it.
 */

import { useState } from "react";

export default function AccountLoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/account/request-login-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setSubmitting(false);
      setSent(true); // Always shown, regardless of the response - no account-enumeration signal.
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 24 }}>
      <h1>Sign in</h1>
      {sent ? (
        <p>If that address has an account (or doesn&apos;t yet), check your email for a sign-in link.</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            Email address
            <br />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", padding: 8 }} />
          </label>
          <br />
          <br />
          <button type="submit" disabled={submitting}>
            Send sign-in link
          </button>
        </form>
      )}
    </main>
  );
}
