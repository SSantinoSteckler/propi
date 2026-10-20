"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PageHeading } from "../components/ui";
import { getPlan } from "../services/data";
import { useAuth } from "../features/auth/AuthProvider";
export default function Settings() {
  const { session } = useAuth();
  const plan = useQuery({ queryKey: ["plan"], queryFn: getPlan });
  return (
    <>
      <PageHeading
        title="Configuración"
        description="Lo esencial para administrar tu espacio."
      />
      <section className="form-panel">
        <h2>Tu cuenta</h2>
        <label>
          Email
          <input value={session?.user.email || ""} readOnly />
        </label>
        <p className="form-note">
          Este email es privado y no se muestra en tu portfolio.
        </p>
        <Link className="btn btn-outline" href="/recuperar">
          Cambiar contraseña
        </Link>
      </section>
      <section className="form-panel">
        <span className="eyebrow">TU PLAN ACTUAL</span>
        <h2>
          {plan.isLoading
            ? "Cargando…"
            : plan.data?.plan === "pro"
              ? "Pro"
              : "Free"}
        </h2>
        <p>
          {plan.data?.plan === "pro"
            ? "Hasta 1.000 propiedades y colecciones, colores y portada personalizados."
            : "Un portfolio, hasta 5 propiedades publicadas, una colección activa, reseñas y métricas básicas."}
        </p>
        <Link className="btn btn-outline" href="/dashboard/billing">Ver planes y facturación</Link>
      </section>
      <section className="form-panel">
        <h2>Tus datos</h2>
        <p>
          Podés despublicar tu portfolio desde Mi portfolio. Para solicitudes
          sobre datos o moderación, consultá los canales que el operador
          configure antes del lanzamiento.
        </p>
        <Link className="text-link" href="/privacidad">
          Consultar política de privacidad
        </Link>
      </section>
    </>
  );
}
