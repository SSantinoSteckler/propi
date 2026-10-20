export type PropertyStatus =
  "borrador" | "disponible" | "reservada" | "vendida" | "alquilada" | "pausada";
export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  bio: string;
  city: string;
  province: string;
  whatsapp: string;
  agency: string;
  professional_mode: "independiente" | "corredor" | "colaborador";
  license: string;
  jurisdiction: string;
  responsible_broker: string;
  instagram: string;
  website: string;
  color: string;
  avatar_path: string | null;
  cover_path: string | null;
  published: boolean;
  show_closed: boolean;
  onboarding_step: number;
  created_at: string;
};
export type Property = {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  description: string;
  type:
    "departamento" | "casa" | "PH" | "terreno" | "local" | "oficina" | "otro";
  operation: "venta" | "alquiler";
  price: number;
  currency: "USD" | "ARS";
  province: string;
  city: string;
  neighborhood: string;
  address?: string;
  show_address: boolean;
  total_area: number;
  covered_area: number;
  rooms: number;
  bedrooms: number;
  bathrooms: number;
  garages: number;
  age: number | null;
  status: PropertyStatus;
  archived: boolean;
  created_at: string;
  images: PropertyImage[];
};
export type PropertyImage = {
  id: string;
  property_id: string;
  owner_id: string;
  path: string;
  alt: string;
  position: number;
  url?: string;
};
export type Collection = {
  id: string;
  owner_id: string;
  token: string;
  name: string;
  description: string;
  active: boolean;
  created_at: string;
  property_ids?: string[];
};
export type Review = {
  id: string;
  owner_id: string;
  display_name: string;
  rating: number;
  body: string;
  response: string | null;
  status: string;
  verified: boolean;
  created_at: string;
};
export type PublicPortfolio = {
  profile: Profile;
  properties: Property[];
  reviews: Review[];
  avatar_url?: string;
  cover_url?: string;
  demo?: boolean;
};
export type PublicCollection = {
  collection: Collection;
  profile: Profile;
  properties: Property[];
};
export type AnalyticsEvent = {
  kind: string;
  property_id: string | null;
  created_at: string;
};
