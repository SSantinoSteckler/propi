import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicCollection } from "@/lib/public-data";
import { publicMetadata } from "@/lib/seo";
import { CollectionView } from "@/screens/Public";
type Props = { params: Promise<{ token: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const data = await getPublicCollection(token);
  return publicMetadata({
    title: data
      ? `${data.collection.name} | Propi`
      : "Colección no disponible | Propi",
    description: data?.collection.description,
    noindex: true,
  });
}
export default async function Page({ params }: Props) {
  const { token } = await params;
  const data = await getPublicCollection(token);
  if (!data) notFound();
  return <CollectionView data={data} />;
}
