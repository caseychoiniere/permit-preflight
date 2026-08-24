/**
 * Railway's deployment health check (Infrastructure Design). Verifies the process is ready to
 * serve requests only - deliberately NOT a deep dependency-health check, so a transient King
 * County/Anthropic outage never fails deployment health.
 */
export async function GET() {
  return Response.json({ status: "ok" });
}
