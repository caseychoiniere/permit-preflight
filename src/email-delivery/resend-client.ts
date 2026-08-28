/**
 * Email Delivery - a single adapter function wrapping the Resend SDK (Unit 2B, BR-U2B-10). No
 * general notification framework - this exists solely to send the one guest report-access email.
 * Mirrors order-payment/stripe-client.ts's shape: env-only credential, structurally distinct
 * instance, throws at construction time if the key is missing.
 */

import { Resend } from "resend";

export interface ResendClientOptions {
  /** Defaults to process.env.RESEND_API_KEY. Only pass explicitly from a test harness. */
  apiKey?: string;
  /** Defaults to process.env.EMAIL_FROM_ADDRESS. */
  fromAddress?: string;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendEmailResult = { outcome: "SENT"; id: string } | { outcome: "FAILED"; reason: string };

const DEFAULT_FROM_ADDRESS = "Permit Preflight <reports@permitpreflight.example>";

/** Constructs a real Resend-backed client. Throws immediately if no API key is available. */
export function createResendClient(options: ResendClientOptions = {}) {
  const apiKey = options.apiKey ?? process.env["RESEND_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is not set. The Resend-backed client requires a real key at construction " +
        "time - it never falls back to a fabricated response. Set it in .env (see .env.example) or " +
        "pass { apiKey } explicitly. Deterministic tests never construct this client."
    );
  }
  const resend = new Resend(apiKey);
  const from = options.fromAddress ?? process.env["EMAIL_FROM_ADDRESS"] ?? DEFAULT_FROM_ADDRESS;

  return {
    /** Sends one transactional email; returns an accept/fail result rather than throwing, so a
     * delivery failure can be recorded as `deliveryStatus: EMAIL_FAILED` (BR-U2B-10) instead of
     * crashing the caller. `EMAIL_SENT` means Resend accepted the send - never a guarantee of
     * end-recipient delivery. */
    async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
      const { data, error } = await resend.emails.send({ from, to: params.to, subject: params.subject, html: params.html, text: params.text });
      if (error || !data) return { outcome: "FAILED", reason: error?.message ?? "Resend returned no data." };
      return { outcome: "SENT", id: data.id };
    },
  };
}

export type ResendClient = ReturnType<typeof createResendClient>;
