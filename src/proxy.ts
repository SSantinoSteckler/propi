import { NextResponse, type NextRequest } from "next/server";
import { isNetlifyPreview } from "./lib/deployment";
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const development = process.env.NODE_ENV !== "production";
  let supabase = "";
  try {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (raw) supabase = new URL(raw).origin;
  } catch {
    /* Invalid configuration is handled by the application. */
  }
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://images.pexels.com ${supabase}`,
    "media-src 'self' https://videos.pexels.com",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${supabase}${development ? " ws://localhost:3100" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  if (
    isNetlifyPreview() || /^\/(dashboard|onboarding|login|registro|recuperar|actualizar-clave|r|c|ejemplo|ejemplo-coleccion)(\/|$)/.test(
      request.nextUrl.pathname,
    )
  )
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.svg|og.png|og.svg|robots.txt|sitemap.xml).*)",
  ],
};
