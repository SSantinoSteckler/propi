import { z } from "zod";
export const reserved = [
  "dashboard",
  "login",
  "registro",
  "recuperar",
  "actualizar-clave",
  "onboarding",
  "c",
  "r",
  "api",
  "ejemplo",
  "ejemplo-coleccion",
  "privacidad",
  "terminos",
  "assets",
];
export const usernameSchema = z
  .string()
  .min(3, "Usá al menos 3 caracteres.")
  .max(48)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Usá letras minúsculas, números y guiones.",
  )
  .refine((v) => !reserved.includes(v), "Este nombre está reservado.");
export const authSchema = z.object({
  email: z.string().email("Ingresá un email válido."),
  password: z.string().min(8, "Usá al menos 8 caracteres.").max(128),
});
export const profileSchema = z.object({
  first_name: z.string().min(2, "Ingresá tu nombre.").max(80),
  last_name: z.string().min(2, "Ingresá tu apellido.").max(80),
  username: usernameSchema,
  bio: z.string().max(600),
  city: z.string().min(2),
  province: z.string().min(2),
  whatsapp: z
    .string()
    .regex(
      /^\+?[1-9][0-9]{9,14}$/,
      "Usá código de país y número, sin espacios. Ej.: 5491123456789.",
    ),
  agency: z.string().max(120),
  professional_mode: z.enum(["independiente", "corredor", "colaborador"]),
  license: z.string().max(120),
  jurisdiction: z.string().max(160),
  responsible_broker: z.string().max(200),
  instagram: z
    .string()
    .max(80)
    .regex(/^@?[a-zA-Z0-9._]*$/, "Ingresá solo tu usuario de Instagram."),
  website: z.union([z.literal(""), z.string().url().startsWith("https://")]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  show_closed: z.boolean(),
});
export const propertySchema = z
  .object({
    title: z
      .string()
      .min(5, "Usá un título de al menos 5 caracteres.")
      .max(160),
    description: z
      .string()
      .min(20, "Contanos un poco más: mínimo 20 caracteres.")
      .max(8000),
    type: z.enum([
      "departamento",
      "casa",
      "PH",
      "terreno",
      "local",
      "oficina",
      "otro",
    ]),
    operation: z.enum(["venta", "alquiler"]),
    price: z.coerce.number().positive("Ingresá un precio mayor a cero."),
    currency: z.enum(["USD", "ARS"]),
    province: z.string().min(2),
    city: z.string().min(2),
    neighborhood: z.string().max(120),
    address: z.string().max(240),
    show_address: z.boolean(),
    total_area: z.coerce.number().positive(),
    covered_area: z.coerce.number().min(0),
    rooms: z.coerce.number().int().min(0),
    bedrooms: z.coerce.number().int().min(0),
    bathrooms: z.coerce.number().int().min(0),
    garages: z.coerce.number().int().min(0),
    age: z.coerce.number().int().min(0).nullable(),
    status: z.enum([
      "borrador",
      "disponible",
      "reservada",
      "vendida",
      "alquilada",
      "pausada",
    ]),
  })
  .refine((v) => v.covered_area <= v.total_area, {
    path: ["covered_area"],
    message: "No puede superar la superficie total.",
  });
export const reviewSchema = z.object({
  display_name: z.string().min(2).max(80),
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().min(20, "Escribí al menos 20 caracteres.").max(2000),
  privacy: z.literal(true, {
    errorMap: () => ({
      message: "Necesitamos tu consentimiento para publicar la reseña.",
    }),
  }),
  honeypot: z.string().max(0),
});
