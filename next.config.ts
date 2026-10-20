import type { NextConfig } from "next";
const config: NextConfig = {
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
