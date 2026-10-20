"use client";
import { Button } from "../components/ui";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="container section">
      <h1>No pudimos cargar este espacio.</h1>
      <p>
        Intentá nuevamente. Si el problema continúa, el operador debe revisar la
        configuración del servicio.
      </p>
      <Button onClick={reset}>Volver a intentar</Button>
    </main>
  );
}
