/**
 * Unit 6 email templates - login-link and claim-link. Calls the EXISTING sendEmail unchanged
 * (email-delivery/resend-client.ts) - no adapter modification. Preserves the same SENT
 * (provider-accepted) != recipient-inbox-delivered distinction Unit 2B's own guest report-access
 * delivery already established (NFR-U6-42).
 *
 * Corrected per Functional Design/NFR Design review: the raw token is embedded in a URL FRAGMENT
 * (`#token=...`), never a query string or path segment - the browser never sends a fragment as
 * part of any HTTP request, matching app/report/page.tsx's own already-working precedent exactly.
 */

import type { ResendClient, SendEmailResult } from "./resend-client.js";
import { resolveAppBaseUrl } from "../shared/app-url.js";

export async function sendLoginLinkEmail(resendClient: ResendClient, email: string, rawToken: string): Promise<SendEmailResult> {
  const url = `${resolveAppBaseUrl()}/account/verify#token=${encodeURIComponent(rawToken)}`;
  return resendClient.sendEmail({
    to: email,
    subject: "Sign in to Permit Preflight",
    html: `<p>Click the link below to sign in.</p><p><a href="${url}">Sign in to Permit Preflight</a></p><p>This link expires in 15 minutes and can only be used once.</p>`,
    text: `Sign in to Permit Preflight: ${url}\n\nThis link expires in 15 minutes and can only be used once.`,
  });
}

export async function sendClaimLinkEmail(resendClient: ResendClient, email: string, rawToken: string): Promise<SendEmailResult> {
  const url = `${resolveAppBaseUrl()}/account/claim/verify#token=${encodeURIComponent(rawToken)}`;
  return resendClient.sendEmail({
    to: email,
    subject: "Confirm your Permit Preflight purchase",
    html: `<p>Click the link below to add this purchase to your account.</p><p><a href="${url}">Confirm purchase</a></p><p>This link expires in 15 minutes and can only be used once. Open it in the same browser/account where you started the request.</p>`,
    text: `Confirm your Permit Preflight purchase: ${url}\n\nThis link expires in 15 minutes and can only be used once. Open it in the same browser/account where you started the request.`,
  });
}
