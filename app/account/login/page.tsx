"use client";

/**
 * requestLoginLink (workflow 1) - single email input, always renders the same "check your email"
 * confirmation state regardless of whether an Account already exists for the address (BR-U6-1,
 * NFR-U6-8). No password field, no OAuth buttons, no "forgot password" link - none exist. Guest
 * checkout (app/configure/page.tsx) is entirely unchanged and does not link here or require it.
 */

import { useState } from "react";
import { Container } from "../../components/ui/Container.js";
import { Card } from "../../components/ui/Card.js";
import { Button } from "../../components/ui/Button.js";

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
    <Container className="max-w-md">
      <Card>
        <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
        {sent ? (
          <p className="mt-3 text-sm text-slate-600">If that address has an account (or doesn&apos;t yet), check your email for a sign-in link.</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4">
            <label className="block text-sm font-medium text-slate-700">
              Email address
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </label>
            <Button type="submit" variant="primary" className="mt-4" disabled={submitting}>
              Send sign-in link
            </Button>
          </form>
        )}
      </Card>
    </Container>
  );
}
