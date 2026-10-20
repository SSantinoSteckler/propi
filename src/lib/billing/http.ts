import { z } from "zod";
import { SITE_URL } from "../config";
import { BillingError } from "./domain";

export const json = (body: unknown, status = 200) => Response.json(body, { status,
  headers: { "Cache-Control": "no-store", "Vary": "Authorization", "X-Content-Type-Options": "nosniff" } });
async function body(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new BillingError("INVALID_REQUEST", 400);
  if (Number(request.headers.get("content-length") || 0) > 2048) throw new BillingError("INVALID_REQUEST", 413);
  const text = await request.text();
  if (Buffer.byteLength(text) > 2048) throw new BillingError("INVALID_REQUEST", 413);
  try { return JSON.parse(text); } catch { throw new BillingError("INVALID_REQUEST", 400); }
}
const messages: Record<string,string> = {
  TEST_USER_ONLY: "Esta prueba está habilitada únicamente para la cuenta ficticia designada.",
  BILLING_SCOPE_MISMATCH: "Esta cuenta no corresponde al entorno de facturación configurado.",
  UNAUTHENTICATED: "Ingresá a tu cuenta para continuar.", FORBIDDEN: "No pudimos validar el origen de la solicitud.",
  BILLING_NOT_CONFIGURED: "La contratación todavía no está habilitada.", INVALID_REQUEST: "Revisá los datos enviados.",
  RATE_LIMIT: "Hiciste varias solicitudes. Esperá un momento y volvé a intentar.",
  IN_PROGRESS: "Ya estamos procesando una solicitud. Esperá unos segundos.", ALREADY_PREMIUM: "Tu cuenta ya tiene Premium.",
  EXISTING_SUBSCRIPTION: "Ya tenés una suscripción. Revisá su estado antes de contratar nuevamente.",
  AWAITING_RECONCILIATION: "Estamos verificando una solicitud anterior para evitar un cobro duplicado.",
  NO_SUBSCRIPTION: "No encontramos una suscripción para cancelar.",
};
export const subscribeSchema = z.object({ payer_email: z.string().trim().email().max(254) }).strict();
export const cancelSchema = z.object({ confirm: z.literal(true) }).strict();
export function billingFailure(error: unknown) {
  const code = error instanceof BillingError ? error.code : "TEMPORARY_ERROR";
  return json({ code, message: messages[code] || "No pudimos completar la operación. Intentá nuevamente más tarde." }, error instanceof BillingError ? error.status : 503);
}
export async function billingRequest(request: Request, operation: "subscribe" | "status" | "cancel") {
  try {
    if (operation !== "status" && request.headers.get("origin") !== SITE_URL) throw new BillingError("FORBIDDEN", 403);
    const authorization = request.headers.get("authorization");
    if (!authorization || authorization.length > 8192 || !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)) throw new BillingError("UNAUTHENTICATED", 401);
    // Import only after basic checks. No authentication-system migration needed.
    const { authenticate } = await import("../supabase/server");
    const user = await authenticate(authorization.slice(7));
    const runtime = await import("./runtime");
    if (operation === "subscribe") {
      const parsed = subscribeSchema.safeParse(await body(request));
      if (!parsed.success) throw new BillingError("INVALID_REQUEST", 400);
      return json(await runtime.subscribe(user.id, parsed.data.payer_email));
    }
    if (operation === "cancel") {
      if (!cancelSchema.safeParse(await body(request)).success) throw new BillingError("INVALID_REQUEST", 400);
      return json(await runtime.cancel(user.id));
    }
    return json(await runtime.status(user.id, new URL(request.url).searchParams.get("refresh") === "1"));
  } catch (error) { return billingFailure(error); }
}
