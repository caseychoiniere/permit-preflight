import { withWorkflow } from "workflow/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // The backend (src/) uses explicit `.js` extensions in import specifiers, required for
    // Node's native ESM resolution (tsconfig's "moduleResolution": "Bundler") - webpack's default
    // resolver doesn't remap those to the on-disk `.ts`/`.tsx` files the way tsc's own bundler
    // resolution does, so it needs to be told explicitly.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
  // NFR-U2B-4/NFR Design Pattern 8: neither the completed-report page nor the guest checkout-
  // status page should ever leak via the Referer header to a link a customer clicks from either
  // page. Corrected 2026-08-25: both routes lost their dynamic URL segments (the bearer
  // capabilities they carry moved to a URL fragment + HttpOnly cookie and a plain HttpOnly cookie,
  // respectively - see app/report/page.tsx and app/api/checkout/route.ts) - the matchers below are
  // now plain paths, not wildcards.
  async headers() {
    return [
      { source: "/report", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/checkout/status", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

// Unit 2B: enables the "use workflow"/"use step" directives (src/workflows/) - required by the
// Workflow SDK regardless of which routes actually start a workflow.
export default withWorkflow(nextConfig);
