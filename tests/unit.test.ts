import { test, expect } from "@playwright/test";
import {
  authSchema,
  profileSchema,
  propertySchema,
  reviewSchema,
  usernameSchema,
  reserved,
} from "../src/lib/validation";
import { price, slugify, whatsapp } from "../src/lib/utils";
import { publicMetadata, serializeJsonLd } from "../src/lib/seo";
test.describe("identidad y validación", () => {
  test("genera slugs legibles sin acentos ni caracteres de ruta", () => {
    expect(slugify("PH en Núñez / terraza")).toBe("ph-en-nunez-terraza");
  });
  test("rechaza nombres de ruta reservados y slugs inválidos", () => {
    for (const value of [...reserved, "A B", "../admin", "ab", "a--b"])
      expect(usernameSchema.safeParse(value).success).toBe(false);
    expect(usernameSchema.parse("martina-gonzalez")).toBe("martina-gonzalez");
  });
  test("valida credenciales", () => {
    expect(
      authSchema.safeParse({ email: "no-email", password: "123" }).success,
    ).toBe(false);
    expect(
      authSchema.safeParse({
        email: "agente@example.com",
        password: "UnaClaveSegura9",
      }).success,
    ).toBe(true);
  });
  test("requiere consentimiento explícito y rechaza el honeypot", () => {
    const v = {
      display_name: "Cliente",
      rating: 5,
      body: "Mi experiencia comercial fue positiva.",
      privacy: true,
      honeypot: "",
    };
    expect(reviewSchema.safeParse(v).success).toBe(true);
    expect(reviewSchema.safeParse({ ...v, privacy: false }).success).toBe(
      false,
    );
    expect(reviewSchema.safeParse({ ...v, honeypot: "spam" }).success).toBe(
      false,
    );
    expect(reviewSchema.safeParse({ ...v, rating: 6 }).success).toBe(false);
  });
  test("rechaza enlaces de perfil ejecutables", () => {
    expect(
      profileSchema.shape.website.safeParse("javascript:alert(1)").success,
    ).toBe(false);
    expect(
      profileSchema.shape.instagram.safeParse("mal/../../user").success,
    ).toBe(false);
  });
  test("no permite superficies incoherentes", () => {
    const data = {
      title: "Casa de ejemplo",
      description: "Descripción suficientemente extensa para la propiedad.",
      type: "casa",
      operation: "venta",
      price: 180000,
      currency: "USD",
      province: "Buenos Aires",
      city: "CABA",
      neighborhood: "",
      address: "Calle privada 123",
      show_address: false,
      total_area: 100,
      covered_area: 120,
      rooms: 3,
      bedrooms: 2,
      bathrooms: 1,
      garages: 0,
      age: null,
      status: "borrador",
    };
    expect(propertySchema.safeParse(data).success).toBe(false);
    expect(
      propertySchema.safeParse({ ...data, covered_area: 80 }).success,
    ).toBe(true);
  });
});
test.describe("presentación pública segura", () => {
  test("formatea precios argentinos y enlaces de contacto", () => {
    expect(price(185000)).toBe("USD 185.000");
    expect(whatsapp("+54 9 11 1234-5678", "Hola Martina")).toBe(
      "https://wa.me/5491112345678?text=Hola%20Martina",
    );
  });
  test("escapa JSON-LD y genera metadatos nativos de Next", () => {
    expect(
      serializeJsonLd({ name: "</script><script>alert(1)</script>" }),
    ).not.toContain("<");
    const head = publicMetadata({
      title: "Portfolio de prueba",
      description: "Descripción",
      path: "/agente-prueba",
      noindex: true,
    });
    expect(head.robots).toEqual({ index: false, follow: false });
    expect(head.openGraph).toMatchObject({
      title: "Portfolio de prueba",
      locale: "es_AR",
    });
    expect(head.alternates?.canonical).toMatch(/\/agente-prueba$/);
  });
});
