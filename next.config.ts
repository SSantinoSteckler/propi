import type { NextConfig } from "next";
function localTunnelOrigins() {
  if (process.env.MERCADOPAGO_ENVIRONMENT !== "test") return [];
  try { return [new URL(process.env.NEXT_PUBLIC_SITE_URL || "").hostname]; } catch { return []; }
}
const config: NextConfig = {
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
