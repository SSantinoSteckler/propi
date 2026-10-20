import { CollectionView } from "@/screens/Public";
import { demoProfile, demoProperties } from "@/lib/demo";
import type { PublicCollection } from "@/types/domain";
export const metadata = {
  title: "Colección de ejemplo | Propi",
  robots: { index: false, follow: false },
};
export default function Page() {
  const data = {
    collection: {
      name: "Tu próximo lugar en la ciudad",
      description:
        "Una selección ficticia de demostración. Sin datos de clientes reales.",
      created_at: "2026-10-01T12:00:00Z",
      token: "demo",
    },
    profile: demoProfile,
    properties: demoProperties.slice(0, 2),
  } as PublicCollection;
  return <CollectionView data={data} demo />;
}
