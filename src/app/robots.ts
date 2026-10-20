import type { MetadataRoute } from "next";
import { webOrigin } from "@/lib/seo";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/onboarding",
        "/login",
        "/registro",
        "/recuperar",
        "/actualizar-clave",
        "/r/",
        "/c/",
        "/api/",
        "/ejemplo",
      ],
    },
    sitemap: webOrigin() + "/sitemap.xml",
  };
}
