# Unit 6: Deployment Architecture (Optional Accounts)

**Delta-only** — extends Unit 2B's own running-system diagram with the one new layer (the Vercel
Firewall rule) and the new account-auth data flow through entirely existing infrastructure.

## The Running System (updated)

```
                Browser
                   |
                   | HTTPS
                   v
          Vercel Firewall (edge, platform-level)
          -------------------------------------------------------
          Rate-limiting rule scoped to /api/account/request-login-link,
          /api/account/claim/*, /api/account/verify-* -- NEW, Unit 6
          (every other route, incl. Unit 2B/3's own endpoints, unaffected)
          -------------------------------------------------------
                   |
                   v
          Vercel — Next.js application (Functions, on demand)
          -------------------------------------------------------
          Existing: order-payment / checkout-fulfillment, PostGIS adapter,
          Property Intelligence, Report Explanation, email-delivery adapter,
          admin-auth (Basic Auth + CSRF), structured logger
          -------------------------------------------------------
          NEW (Unit 6): src/account-auth/ (Account/MagicLinkToken/
          AccountSession/AccountOrderLink logic, 5 workflows)
          NEW (Unit 6): src/shared/same-origin.ts (extracted CSRF core,
          called by BOTH admin-auth/csrf.ts and account-auth's own CSRF check)
          NEW (Unit 6): accountAuthLocalLimiter (in-process, Layer 2
          defense-in-depth, src/shared/rate-limiter-instance.ts)
          -------------------------------------------------------
             |          |            |            |          |
             |          |            |            |          +--> Anthropic
             |          |            |            +--> Resend (existing adapter,
             |          |            |                2 NEW templates: login-link,
             |          |            |                claim-link)
             |          |            +--> Stripe (unchanged - Unit 6 never writes
             |          |                  to Order/OrderState)
             |          +--> King County / Legistar (unchanged)
             +--> Neon PostgreSQL + PostGIS (neon-http default; a per-request
                  neon-serverless Pool for BR-U2B-15's fulfillment transaction
                  AND, NEW, Unit 6's verifyLoginLink/completeClaimByEmail
                  transactions)
                  NEW tables: accounts, magic_link_tokens, account_sessions,
                  account_order_links (+ account_order_links(account_id) index)

          Vercel Workflows / Vercel Cron (unchanged, untouched by Unit 6)
          -------------------------------------------------------
          reportGenerationWorkflow, processRefundWorkflow, reconciliation cron
          -------------------------------------------------------
          Unit 6 adds no new Workflow or Cron job -- account-auth operations
          are synchronous request/response, not durable multi-step processes.

Browser:
  |
  +------> Stripe-hosted Checkout page (unchanged, unaffected by Unit 6)
  |
  +------> MapTiler vector tiles (unchanged, unaffected by Unit 6)
```

## What's New vs. What's Reused

**New** (this unit): the Vercel Firewall rule (platform configuration, not code); the
`src/account-auth/` module; the `src/shared/same-origin.ts` extraction (a refactor of existing
admin CSRF logic, not new infrastructure); one new local rate-limiter instance; 4 new database
tables + 1 new index; 2 new Resend email templates; 1 new cookie (`ACCOUNT_SESSION_COOKIE`,
delivered through the existing cookie mechanism).

**Reused, unmodified**: the Vercel project/environments/CI/deployment pipeline; the Neon database
and its connection strategy; the Resend provider and adapter; every Unit 2B/3 domain flow (payment,
refund, admin operations, report generation); the Vercel Workflows/Cron execution model (Unit 6
introduces no workflow — every account-auth operation completes within a single request/response
cycle, unlike report generation's durable multi-stage pipeline).

**Not introduced**: a new compute service, a new database, a new message queue, a new CDN/edge
product beyond the Firewall rule already covered above, a new identity provider, or a second
deployment environment/target.
