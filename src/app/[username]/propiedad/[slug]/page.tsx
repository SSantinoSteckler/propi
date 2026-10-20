import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPortfolio } from "@/lib/public-data";
import { publicMetadata, webOrigin } from "@/lib/seo";
import { PropertyView } from "@/screens/Public";
import JsonLd from "@/components/JsonLd";
type Props = { params: Promise<{ username: string; slug: string }> };
async function listing(params: Props["params"]) {
  const { username, slug } = await params;
  const data = await getPublicPortfolio(username);
  const property = data?.properties.find((p) => p.slug === slug);
  return { data, property };
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { data, property: p } = await listing(params);
  if (!data || !p)
    return publicMetadata({
      title: "Propiedad no disponible | Propi",
      noindex: true,
    });
  const a = data.profile;
  return publicMetadata({
    title: `${p.title} | ${a.first_name} ${a.last_name}`,
    description: p.description,
    path: `/${a.username}/propiedad/${p.slug}`,
    image: p.images.length
      ? `/api/og?username=${encodeURIComponent(a.username)}&slug=${encodeURIComponent(p.slug)}`
      : undefined,
  });
}
export default async function Page({ params }: Props) {
  const { data, property: p } = await listing(params);
  if (!data || !p) notFound();
  const url = `${webOrigin()}/${data.profile.username}/propiedad/${p.slug}`;
  return (
    <>
      <JsonLd
        value={{
          "@context": "https://schema.org",
          "@type": "RealEstateListing",
          name: p.title,
          description: p.description,
          url,
          datePosted: p.created_at,
          offers: {
            "@type": "Offer",
            price: p.price,
            priceCurrency: p.currency,
            url,
          },
          spatialCoverage: {
            "@type": "Place",
            name: [p.neighborhood, p.city, p.province]
              .filter(Boolean)
              .join(", "),
          },
        }}
      />
      <PropertyView p={p} profile={data.profile} demo={false} preview={false} />
    </>
  );
}
