import { db } from "../lib/supabase";
import { slugify } from "../lib/utils";
import type {
  Profile,
  Property,
  PropertyImage,
  PublicPortfolio,
  PublicCollection,
  Collection,
  Review,
  AnalyticsEvent,
} from "../types/domain";
async function unwrap<T>(
  query: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw error;
  return data as T;
}
export const getProfile = () =>
  unwrap<Profile>(db().from("profiles").select("*").single());
export const saveProfile = (data: Partial<Profile>) =>
  unwrap<Profile>(
    db().from("profiles").update(data).eq("id", data.id!).select().single(),
  );
export const getPlan = () =>
  unwrap<{ plan: "free" | "pro" }>(
    db().rpc("get_user_entitlements"),
  );
export async function signImage(path: string) {
  const { data, error } = await db()
    .storage.from("media")
    .createSignedUrl(path, 600);
  if (error) return "";
  return data.signedUrl;
}
export async function withImages<T extends { images: PropertyImage[] }>(
  p: T,
): Promise<T> {
  return {
    ...p,
    images: await Promise.all(
      (p.images || [])
        .sort((a, b) => a.position - b.position)
        .map(async (i) => ({ ...i, url: await signImage(i.path) })),
    ),
  };
}
export async function getProperties() {
  const rows = await unwrap<Property[]>(
    db()
      .from("properties")
      .select("*,images:property_images(*)")
      .order("created_at", { ascending: false }),
  );
  return Promise.all(rows.map(withImages));
}
export async function getProperty(id: string) {
  const p = await unwrap<Property>(
    db()
      .from("properties")
      .select("*,images:property_images(*)")
      .eq("id", id)
      .single(),
  );
  return withImages(p);
}
export async function saveProperty(data: Partial<Property>, id?: string) {
  const { images, ...row } = data;
  void images;
  return unwrap<Property>(
    id
      ? db().from("properties").update(row).eq("id", id).select().single()
      : db()
          .from("properties")
          .insert({
            ...row,
            slug: `${slugify(data.title || "propiedad").slice(0, 70)}-${crypto.randomUUID().slice(0, 8)}`,
          })
          .select()
          .single(),
  );
}
export async function deleteProperty(id: string) {
  const images = await unwrap<{ path: string }[]>(
    db().from("property_images").select("path").eq("property_id", id),
  );
  await unwrap(
    db().from("properties").delete().eq("id", id).select("id").single(),
  );
  if (images.length) {
    const { error } = await db()
      .storage.from("media")
      .remove(images.map((i) => i.path));
    if (error)
      throw new Error(
        "La propiedad se eliminó, pero quedó pendiente borrar sus archivos. El operador debe revisar la limpieza de Storage.",
      );
  }
}
export async function duplicateProperty(p: Property) {
  const { id, images, created_at, owner_id, slug, ...row } = p;
  void id;
  void images;
  void created_at;
  void owner_id;
  void slug;
  return saveProperty({
    ...row,
    title: `${p.title.slice(0, 140)} (copia)`,
    status: "borrador",
    archived: false,
  });
}
export async function publicPortfolio(username: string) {
  const value = await unwrap<PublicPortfolio | null>(
    db().rpc("get_portfolio", { p_username: username }),
  );
  if (!value) return null;
  value.properties = await Promise.all(value.properties.map(withImages));
  value.avatar_url = value.profile.avatar_path
    ? await signImage(value.profile.avatar_path)
    : undefined;
  value.cover_url = value.profile.cover_path
    ? await signImage(value.profile.cover_path)
    : undefined;
  return value;
}
export async function publicCollection(token: string) {
  const value = await unwrap<PublicCollection | null>(
    db().rpc("get_collection", { p_token: token }),
  );
  if (!value) return null;
  value.properties = await Promise.all(value.properties.map(withImages));
  return value;
}
export const getCollections = () =>
  unwrap<Collection[]>(
    db()
      .from("collections")
      .select("*")
      .order("created_at", { ascending: false }),
  );
export async function getCollection(id: string) {
  const c = await unwrap<Collection>(
    db().from("collections").select("*").eq("id", id).single(),
  );
  const rows = await unwrap<{ property_id: string }[]>(
    db()
      .from("collection_properties")
      .select("property_id")
      .eq("collection_id", id)
      .order("position"),
  );
  return { ...c, property_ids: rows.map((r) => r.property_id) };
}
export const saveCollection = (
  id: string | null,
  name: string,
  description: string,
  ids: string[],
  active: boolean,
) =>
  unwrap<string>(
    db().rpc("save_collection", {
      p_id: id,
      p_name: name,
      p_description: description,
      p_properties: ids,
      p_active: active,
    }),
  );
export const deleteCollection = (id: string) =>
  unwrap(db().from("collections").delete().eq("id", id));
export const getReviews = () =>
  unwrap<Review[]>(
    db().from("reviews").select("*").order("created_at", { ascending: false }),
  );
export const respondReview = (id: string, response: string) =>
  unwrap(db().from("reviews").update({ response }).eq("id", id));
export const reportReview = (review_id: string, reason: string) =>
  unwrap(db().from("review_reports").insert({ review_id, reason }));
export const createReviewRequest = () =>
  unwrap<string>(db().rpc("create_review_request"));
export const getEvents = () =>
  unwrap<AnalyticsEvent[]>(
    db()
      .from("analytics_events")
      .select("kind,property_id,created_at")
      .order("created_at", { ascending: false })
      .limit(10000),
  );
export function track(
  username: string,
  kind: string,
  propertySlug?: string,
  collectionToken?: string,
) {
  if (!username) return;
  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, kind, propertySlug, collectionToken }),
    keepalive: true,
  }).catch(() => {});
}
export async function uploadImage(file: File, owner: string, folder: string) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 8 * 1024 * 1024
  )
    throw new Error("Elegí una imagen JPG, PNG o WebP de hasta 8 MB.");
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("No se pudo procesar la imagen.")),
      "image/webp",
      0.83,
    ),
  );
  const path = `${owner}/${folder}/${crypto.randomUUID()}.webp`;
  const { error } = await db()
    .storage.from("media")
    .upload(path, blob, { contentType: "image/webp", upsert: false });
  if (error) throw error;
  return path;
}
export const addPropertyImage = (
  row: Omit<PropertyImage, "id" | "url" | "owner_id">,
) => unwrap(db().from("property_images").insert(row));
export const updatePropertyImage = (id: string, data: Partial<PropertyImage>) =>
  unwrap(db().from("property_images").update(data).eq("id", id));
export async function removePropertyImage(image: PropertyImage) {
  await unwrap(db().from("property_images").delete().eq("id", image.id));
  const { error } = await db().storage.from("media").remove([image.path]);
  if (error)
    throw new Error(
      "La foto se retiró de la propiedad, pero quedó pendiente borrar el archivo de Storage.",
    );
}
