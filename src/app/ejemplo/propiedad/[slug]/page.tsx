import { notFound } from "next/navigation";
import { PropertyView } from "@/screens/Public";
import { demoProfile, demoProperties } from "@/lib/demo";
export const metadata = {
  title: "Propiedad ficticia de ejemplo | Propi",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const property = demoProperties.find((p) => p.slug === slug);
  if (!property) notFound();
  return (
    <PropertyView p={property} profile={demoProfile} demo preview={false} />
  );
}
