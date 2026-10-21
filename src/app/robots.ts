import type { MetadataRoute } from "next";
import { webOrigin } from "@/lib/seo";
import { isNetlifyPreview } from "@/lib/deployment";
export default function robots(): MetadataRoute.Robots {
  if (isNetlifyPreview()) return { rules: { userAgent: "*", disallow: "/" } };
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
