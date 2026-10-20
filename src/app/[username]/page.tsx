import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPortfolio } from "@/lib/public-data";
import { publicMetadata, webOrigin } from "@/lib/seo";
import { PortfolioView } from "@/screens/Public";
import JsonLd from "@/components/JsonLd";
type Props = { params: Promise<{ username: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const data = await getPublicPortfolio(username);
  if (!data)
    return publicMetadata({
      title: "Portfolio no disponible | Propi",
      noindex: true,
    });
  const p = data.profile;
  return publicMetadata({
    title: `${p.first_name} ${p.last_name} | Portfolio inmobiliario`,
    description: p.bio,
    path: `/${p.username}`,
    image: p.avatar_path
      ? `/api/og?username=${encodeURIComponent(p.username)}`
      : undefined,
  });
}
export default async function Page({ params }: Props) {
  const { username } = await params;
  const data = await getPublicPortfolio(username);
  if (!data) notFound();
  const p = data.profile;
  return (
    <>
      <JsonLd
        value={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          url: `${webOrigin()}/${p.username}`,
          mainEntity: {
            "@type": "Person",
            name: `${p.first_name} ${p.last_name}`,
            description: p.bio,
          },
        }}
      />
      <PortfolioView data={data} demo={false} />
    </>
  );
}
