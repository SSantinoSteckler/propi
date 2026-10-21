import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import Providers from "./providers";
import { publicMetadata, webOrigin } from "../lib/seo";
import "../styles.css";
export const metadata: Metadata = {
  metadataBase: new URL(webOrigin()),
  ...publicMetadata({
    title: "Propi — Todas tus propiedades. Un solo link.",
    description:
      "Creá tu portfolio inmobiliario profesional. Mostrá tus propiedades y conectá con clientes.",
    image: "/og.png",
  }),
};
export async function generateViewport(): Promise<Viewport> {
  const dark = (await cookies()).get("propi-theme")?.value === "dark";
  return { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: dark ? "#191b1e" : "#faf8f4" };
}
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await headers();
  const theme = (await cookies()).get("propi-theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang="es-AR" data-theme={theme}>
      <head>
        <link rel="icon" href="/favicon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;450;500;550;600;650;700;750;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers initialTheme={theme}>{children}</Providers>
      </body>
    </html>
  );
}
