import { isHostedDeployment } from "../deployment";

export type WebhookStage = "validation" | "dependencies" | "scope" | "database_client" | "rate_limit" | "event_store" | "event_processing";

const codes = new Set([
  "BILLING_NOT_CONFIGURED", "INVALID_TEST_CONFIGURATION", "INVALID_SELLER",
  "DATABASE_UNAVAILABLE", "PROVIDER_UNAVAILABLE", "PROVIDER_TIMEOUT",
  "AWAITING_CORRELATION", "SYNC_BATCH_LIMIT", "TEMPORARY_ERROR",
  "RATE_LIMIT", "IN_PROGRESS", "BILLING_SCOPE_MISMATCH", "TEST_USER_ONLY",
]);

// Local test diagnostics only. Never serialize a request, exception, or raw body.
export async function logWebhookFailure(
  response: Response,
  stage: WebhookStage,
  env: Record<string, string | undefined> = process.env,
  write: (line: string) => void = console.warn,
) {
  if (env.NODE_ENV !== "development" || env.MERCADOPAGO_ENVIRONMENT !== "test" || isHostedDeployment(env) || response.status < 400) return;
  try {
    const body = await response.clone().json();
    let code = codes.has(body?.code) ? body.code : "UNCLASSIFIED_ERROR";
    if (stage === "validation") {
      if (response.status === 503 && body?.message === "Servicio no configurado.") code = "WEBHOOK_SECRET_MISSING";
      else if (response.status === 401) code = "INVALID_SIGNATURE";
      else if (response.status === 400) code = "INVALID_PAYLOAD";
      else if (response.status === 413) code = "PAYLOAD_TOO_LARGE";
    }
    write(JSON.stringify({ stage, code }));
  } catch { /* Diagnostics must never affect delivery or the HTTP response. */ }
}
