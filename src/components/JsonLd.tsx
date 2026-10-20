import { headers } from "next/headers";
import { serializeJsonLd } from "../lib/seo";
export default async function JsonLd({ value }: { value: unknown }) {
  const nonce = (await headers()).get("x-nonce") || undefined;
  return (
    <script
      nonce={nonce}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(value) }}
    />
  );
}
