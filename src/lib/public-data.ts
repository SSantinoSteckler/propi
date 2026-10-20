import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type {
  Property,
  PublicPortfolio,
  PublicCollection,
} from "../types/domain";
export function publicDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
export async function signed(path: string | null | undefined) {
  if (!path) return "";
  const client = publicDb();
  if (!client) throw new Error("Supabase no está configurado.");
  const { data, error } = await client.storage
    .from("media")
    .createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}
async function images(p: Property): Promise<Property> {
  return {
    ...p,
    images: await Promise.all(
      (p.images || [])
        .sort((a, b) => a.position - b.position)
        .map(async (image) => ({ ...image, url: await signed(image.path) })),
    ),
  };
}
export const getPublicPortfolio = cache(
  async (username: string): Promise<PublicPortfolio | null> => {
    const client = publicDb();
    if (!client) throw new Error("Falta configurar Supabase.");
    const { data, error } = await client.rpc("get_portfolio", {
      p_username: username,
    });
    if (error) throw error;
    if (!data) return null;
    const value = data as PublicPortfolio;
    return {
      ...value,
      properties: await Promise.all(value.properties.map(images)),
      avatar_url: (await signed(value.profile.avatar_path)) || undefined,
      cover_url: (await signed(value.profile.cover_path)) || undefined,
    };
  },
);
export const getPublicCollection = cache(
  async (token: string): Promise<PublicCollection | null> => {
    const client = publicDb();
    if (!client) throw new Error("Falta configurar Supabase.");
    const { data, error } = await client.rpc("get_collection", {
      p_token: token,
    });
    if (error) throw error;
    if (!data) return null;
    const value = data as PublicCollection;
    return {
      ...value,
      properties: await Promise.all(value.properties.map(images)),
    };
  },
);
