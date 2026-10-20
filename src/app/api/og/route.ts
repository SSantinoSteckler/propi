import { publicDb, signed } from "@/lib/public-data";
import type { PublicPortfolio } from "@/types/domain";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const client = publicDb();
    if (!client) return new Response(null, { status: 503 });
    const { data, error } = await client.rpc("get_portfolio", {
      p_username: params.get("username") || "",
    });
    if (error || !data) return new Response(null, { status: 404 });
    const value = data as PublicPortfolio;
    const slug = params.get("slug");
    const path = slug
      ? value.properties.find((p) => p.slug === slug)?.images[0]?.path
      : value.profile.avatar_path;
    const url = await signed(path);
    if (!url) return new Response(null, { status: 404 });
    const upstream = await fetch(url, { cache: "no-store" });
    if (!upstream.ok) return new Response(null, { status: 404 });
    return new Response(await upstream.arrayBuffer(), {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
