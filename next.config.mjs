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
};

export default nextConfig;
