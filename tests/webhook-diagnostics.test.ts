import { test, expect } from "@playwright/test";
import { logWebhookFailure } from "../src/lib/mercadopago/webhook-diagnostics";

const local = { NODE_ENV: "development", MERCADOPAGO_ENVIRONMENT: "test" };

test("diagnóstico local emite solo etapa y código permitido sin consumir la respuesta", async () => {
  const lines: string[] = [];
  const body = { code: "PROVIDER_UNAVAILABLE", message: "secret-token", signature: "private-signature", email: "private@example.invalid" };
  const response = Response.json(body, { status: 503 });
  await logWebhookFailure(response, "event_processing", local, line => { lines.push(line); });
  expect(lines).toEqual([JSON.stringify({ stage: "event_processing", code: "PROVIDER_UNAVAILABLE" })]);
  expect(await response.json()).toEqual(body);
});

test("diagnóstico nunca imprime códigos arbitrarios y distingue firma de secreto faltante", async () => {
  const lines: string[] = [];
  const write = (line: string) => { lines.push(line); };
  await logWebhookFailure(Response.json({ code: "private-token" }, { status: 503 }), "event_store", local, write);
  await logWebhookFailure(Response.json({ message: "Firma inválida." }, { status: 401 }), "validation", local, write);
  await logWebhookFailure(Response.json({ message: "Servicio no configurado." }, { status: 503 }), "validation", local, write);
  expect(lines.map(line => JSON.parse(line).code)).toEqual(["UNCLASSIFIED_ERROR", "INVALID_SIGNATURE", "WEBHOOK_SECRET_MISSING"]);
});

test("diagnóstico deshabilitado en producción y Vercel y fallos del logger no afectan la respuesta", async () => {
  const lines: string[] = [];
  for (const env of [{ ...local, NODE_ENV: "production" }, { ...local, MERCADOPAGO_ENVIRONMENT: "production" }, { ...local, VERCEL: "1" }, { ...local, VERCEL_ENV: "preview" }]) {
    await logWebhookFailure(Response.json({ code: "PROVIDER_UNAVAILABLE" }, { status: 503 }), "event_processing", env, line => { lines.push(line); });
  }
  expect(lines).toEqual([]);
  await logWebhookFailure(Response.json({}, { status: 503 }), "validation", local, () => { throw new Error("logger failure"); });
});
