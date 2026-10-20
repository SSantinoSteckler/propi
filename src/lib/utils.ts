import { SITE_URL } from "./config";

export const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export const price = (value: number, currency = "USD") =>
  `${currency === "USD" ? "USD" : "$"} ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(value)}`;
export const area = (value: number) =>
  `${new Intl.NumberFormat("es-AR").format(value)} m²`;
export const siteUrl = () => SITE_URL;
export const whatsapp = (phone: string, message: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
export async function copyLink(path: string) {
  await navigator.clipboard.writeText(`${siteUrl()}${path}`);
}
export const statusLabel: Record<string, string> = {
  borrador: "Borrador",
  disponible: "Disponible",
  reservada: "Reservada",
  vendida: "Vendida",
  alquilada: "Alquilada",
  pausada: "Pausada",
};
export function errorMessage(error: unknown) {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "No pudimos completar la operación.";
  if (/unique|duplicate/i.test(msg))
    return "Ese nombre de usuario o enlace ya está en uso. Elegí otro.";
  if (/limit|límite/i.test(msg)) return msg;
  if (/Invalid login/i.test(msg)) return "Revisá tu email y contraseña.";
  return msg;
}
