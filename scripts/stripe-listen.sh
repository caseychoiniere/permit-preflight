#!/usr/bin/env bash
# Forwards Stripe test-mode webhooks to the local dev server, after checking that the CLI's signing secret is the one the app is configured with.
# Without this running, a paid Checkout Session never reaches /api/webhooks/stripe locally (the app now recovers by asking Stripe itself, but the webhook is the normal path).
# Usage: npm run stripe:listen            (PORT=3001 npm run stripe:listen for another port)
set -euo pipefail
cd "$(dirname "$0")/.."

env_value() { grep -E "^$1=" .env.local | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
export STRIPE_API_KEY="$(env_value STRIPE_SECRET_KEY)"
[ -n "$STRIPE_API_KEY" ] || { echo "STRIPE_SECRET_KEY is not set in .env.local" >&2; exit 1; }
case "$STRIPE_API_KEY" in sk_test_*|rk_test_*) ;; *) echo "Refusing to listen with a non-test Stripe key." >&2; exit 1 ;; esac

cli_secret="$(stripe listen --print-secret)"
app_secret="$(env_value STRIPE_WEBHOOK_SECRET)"
if [ "$cli_secret" != "$app_secret" ]; then
  echo "STRIPE_WEBHOOK_SECRET in .env.local does not match this Stripe CLI listener's signing secret." >&2
  echo "Update it to the value printed by:  STRIPE_API_KEY=<test key> stripe listen --print-secret   then restart the dev server." >&2
  exit 1
fi
echo "Signing secret matches .env.local. Forwarding to http://localhost:${PORT:-3000}/api/webhooks/stripe"
exec stripe listen --forward-to "localhost:${PORT:-3000}/api/webhooks/stripe"
