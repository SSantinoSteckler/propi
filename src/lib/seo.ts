import type { Metadata } from "next";
import { SITE_URL } from "./config";
export function webOrigin() {
  return SITE_URL;
}
export function publicMetadata({
  title,
  description = "",
  path,
  image,
  noindex = false,
}: {
  title: string;
  description?: string;
  path?: string;
  image?: string;
  noindex?: boolean;
}): Metadata {
  const url = path ? `${webOrigin()}${path}` : undefined;
  const images = image ? [{ url: new URL(image, webOrigin()).toString() }] : [];
  return {
    title,
    description: description.slice(0, 180),
    alternates: url ? { canonical: url } : undefined,
    robots: { index: !noindex, follow: !noindex },
    openGraph: {
      type: "website",
      locale: "es_AR",
      siteName: "Propi",
      title,
      description: description.slice(0, 180),
      url,
      images,
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title,
      description: description.slice(0, 180),
      images: images.map((i) => i.url),
    },
  };
}
export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
