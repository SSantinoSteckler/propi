import { test, expect } from "@playwright/test";
import { POST } from "../src/app/api/events/route";
import { SITE_URL } from "../src/lib/config";
const envNames = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;
let originalEnv: Record<string, string | undefined>;
test.beforeEach(() => {
  originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  for (const name of envNames) process.env[name] = "";
});
test.afterEach(() => {
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});
function request(
  body: unknown,
  origin = SITE_URL,
  userAgent = "Mozilla/5.0",
) {
  return new Request(`${SITE_URL}/api/events`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "user-agent": userAgent,
    },
    body: JSON.stringify(body),
  });
}
test.describe("Route Handler de analítica", () => {
  test("rechaza orígenes externos", async () => {
    expect(
      (
        await POST(
          request(
            { username: "agente-prueba", kind: "portfolio" },
            "https://externo.example",
          ),
        )
      ).status,
    ).toBe(403);
  });
  test("valida el cuerpo y limita tamaño", async () => {
    expect(
      (await POST(request({ username: "../privado", kind: "inventado" })))
        .status,
    ).toBe(400);
    expect((await POST(request({ body: "x".repeat(3000) }))).status).toBe(413);
  });
  test("descarta bots sin generar eventos", async () => {
    expect(
      (
        await POST(
          request(
            { username: "agente-prueba", kind: "portfolio" },
            undefined,
            "Googlebot",
          ),
        )
      ).status,
    ).toBe(204);
  });
  test("no simula estadísticas si falta configuración de servidor", async () => {
    const result = await POST(
      request({ username: "agente-prueba", kind: "portfolio" }),
    );
    expect(result.status).toBe(503);
    expect(result.headers.get("cache-control")).toBe("no-store");
  });
});
