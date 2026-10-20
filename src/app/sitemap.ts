import type { MetadataRoute } from "next";
import { publicDb } from "@/lib/public-data";
import { webOrigin } from "@/lib/seo";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const client = publicDb();
  if (!client) return [{ url: webOrigin() + "/" }];
  const { data, error } = await client.rpc("public_sitemap");
  if (error) throw error;
  return ["/", ...(data as { path: string }[]).map((x) => x.path)].map(
    (path) => ({ url: webOrigin() + path }),
  );
}
