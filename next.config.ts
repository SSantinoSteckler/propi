import type { NextConfig } from "next";
function localTunnelOrigins() {
  if (process.env.MERCADOPAGO_ENVIRONMENT !== "test") return [];
  try { return [new URL(process.env.NEXT_PUBLIC_SITE_URL || "").hostname]; } catch { return []; }
}
const config: NextConfig = {
  // Public build metadata only: never put credentials in next.config env.
  env: {
    PROPI_HOSTING_PLATFORM: process.env.NETLIFY === "true" ? "netlify" : process.env.VERCEL ? "vercel" : "local",
    PROPI_DEPLOY_CONTEXT: process.env.NETLIFY === "true" ? process.env.CONTEXT || "unknown" : process.env.VERCEL_ENV || "local",
  },
  allowedDevOrigins: localTunnelOrigins(),
  poweredByHeader: false,
  htmlLimitedBots: /.*/,
  images: {
    dangerouslyAllowSVG: false,
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};
export default config;
