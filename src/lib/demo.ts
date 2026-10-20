import type { Profile, Property, PublicPortfolio } from "../types/domain";
export const photos = [
  "photo-1600210492486-724fe5c67fb0",
  "photo-1600607687920-4e2a09cf159d",
  "photo-1600047509807-ba8f99d2cdde",
  "photo-1600566753086-00f18fb6b3ea",
  "photo-1600585154340-be6161a56a0c",
  "photo-1600607687939-ce8a6c25118c",
  "photo-1600566753190-17f0baa2a6c3",
  "photo-1600210491892-03d54c0aaf87",
];
export const photo = (id: string, w = 1000) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;
export const demoProfile: Profile = {
  id: "demo-agent-1",
  first_name: "Martina",
  last_name: "González",
  username: "martina-gonzalez",
  bio: "Cada propiedad tiene una historia. Te acompaño a encontrar el lugar donde empieza la tuya, con atención cercana y en cada detalle.",
  city: "Buenos Aires",
  province: "CABA",
  whatsapp: "",
  agency: "Estudio inmobiliario · Ejemplo",
  professional_mode: "independiente",
  license: "",
  jurisdiction: "",
  responsible_broker: "",
  instagram: "",
  website: "",
  color: "#24594c",
  avatar_path: null,
  cover_path: null,
  published: true,
  show_closed: true,
  onboarding_step: 4,
  created_at: "2026-10-01T12:00:00Z",
};
const titles = [
  "Luz, diseño y un balcón para disfrutar",
  "Tu próximo capítulo, con jardín propio",
  "Espacios que invitan a quedarse",
  "Un PH con el encanto de siempre",
  "Una casa para vivir sin apuro",
  "Tu espacio de trabajo en la ciudad",
  "Un departamento lleno de posibilidades",
  "Una nueva historia en Belgrano",
];
export const demoProperties: Property[] = titles.map((title, i) => ({
  id: `demo-property-${i + 1}`,
  owner_id: i < 4 ? "demo-agent-1" : "demo-agent-2",
  slug: [
    "departamento-palermo",
    "casa-nordelta",
    "departamento-recoleta",
    "ph-colegiales",
    "casa-tigre",
    "oficina-centro",
    "departamento-villa-crespo",
    "departamento-belgrano",
  ][i],
  title,
  description:
    "PROPIEDAD FICTICIA DE DEMOSTRACIÓN. Un espacio luminoso, con ambientes amplios y detalles de diseño. Las fotografías son ilustrativas y no representan un inmueble ofrecido en comercialización.",
  type:
    i === 1 || i === 4
      ? "casa"
      : i === 3
        ? "PH"
        : i === 5
          ? "oficina"
          : "departamento",
  operation: i % 3 === 2 ? "alquiler" : "venta",
  price: [185000, 320000, 850000, 148000, 260000, 650000, 125000, 210000][i],
  currency: i % 3 === 2 ? "ARS" : "USD",
  province: "Buenos Aires",
  city: i === 1 ? "Tigre" : "CABA",
  neighborhood: [
    "Palermo",
    "Nordelta",
    "Recoleta",
    "Colegiales",
    "Tigre",
    "Centro",
    "Villa Crespo",
    "Belgrano",
  ][i],
  address: "",
  show_address: false,
  total_area: [78, 180, 95, 65, 210, 60, 52, 84][i],
  covered_area: 60,
  rooms: (i % 3) + 2,
  bedrooms: (i % 2) + 1,
  bathrooms: 1,
  garages: i % 2,
  age: null,
  status: i === 7 ? "vendida" : "disponible",
  archived: false,
  created_at: "2026-10-01T12:00:00Z",
  images: [
    {
      id: `demo-image-${i}`,
      property_id: `demo-property-${i + 1}`,
      owner_id: "demo-agent-1",
      path: "",
      position: 0,
      alt: "Fotografía ilustrativa de un interior; propiedad ficticia",
      url: photo(photos[i]),
    },
  ],
}));
export const demoPortfolio: PublicPortfolio = {
  profile: demoProfile,
  properties: demoProperties.slice(0, 4),
  reviews: [
    {
      id: "demo-review",
      owner_id: "demo-agent-1",
      display_name: "Cliente de ejemplo",
      rating: 5,
      body: "Este texto demuestra cómo se verá una reseña. No es un testimonio de un cliente real.",
      response: null,
      status: "published",
      verified: false,
      created_at: "2026-10-01T12:00:00Z",
    },
  ],
  demo: true,
  avatar_url: photo("photo-1580489944761-15a19d654956", 160),
};
