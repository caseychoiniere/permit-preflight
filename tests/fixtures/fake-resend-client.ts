/**
 * A fake Resend client matching AiCompletionClient's existing fake-adapter-for-tests pattern
 * (rule-research-assistant) - used for deterministic and DB-integration tests that must never
 * make a real email send.
 */

import type { ResendClient, SendEmailParams, SendEmailResult } from "../../src/email-delivery/resend-client.js";

export interface FakeResendClientOptions {
  /** When set, every send fails with this reason instead of succeeding. */
  failWithReason?: string;
}

export function createFakeResendClient(options: FakeResendClientOptions = {}): ResendClient & { sentEmails: SendEmailParams[] } {
  const sentEmails: SendEmailParams[] = [];
  return {
    sentEmails,
    async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
      sentEmails.push(params);
      if (options.failWithReason) return { outcome: "FAILED", reason: options.failWithReason };
      return { outcome: "SENT", id: `fake-email-${sentEmails.length}` };
    },
  };
}
