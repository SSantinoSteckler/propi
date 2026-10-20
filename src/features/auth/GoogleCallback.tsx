"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Logo } from "../../components/ui";
import { db } from "../../lib/supabase";
import { googleDestination } from "./google";

export default function GoogleCallback() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function finish() {
      try {
        const query = new URLSearchParams(window.location.search);
        const hash = new URLSearchParams(window.location.hash.slice(1));
        if (query.has("error") || hash.has("error")) {
          throw new Error("OAuth cancelado o rechazado");
        }
        const client = db();
        // El mismo cliente que inicia OAuth procesa los tokens y persiste la sesión.
        const { data, error } = await client.auth.getSession();
        // Quitar los parámetros del proveedor una vez procesado el retorno.
        window.history.replaceState(null, "", window.location.pathname);
        if (error || !data.session) throw error || new Error("Sin sesión");
        const { data: profile, error: profileError } = await client
          .from("profiles")
          .select("username, onboarding_step")
          .eq("id", data.session.user.id)
          .single();
        if (profileError || !profile) {
          throw profileError || new Error("Perfil no disponible");
        }
        if (active) router.replace(googleDestination(profile));
      } catch {
        // No reflejar mensajes ni parámetros externos del proveedor en la pantalla.
        window.history.replaceState(null, "", window.location.pathname);
        if (active) setFailed(true);
      }
    }
    void finish();
    return () => { active = false; };
  }, [router]);

  return (
    <main className="page auth-callback">
      <Logo />
      <div className="success-panel" role={failed ? "alert" : "status"}>
        {failed ? (
          <>
            <h1>No pudimos completar el ingreso</h1>
            <p>El acceso pudo haberse cancelado o el enlace venció. Intentá nuevamente.</p>
            <Link className="btn" href="/login">Volver a ingresar</Link>
          </>
        ) : (
          <>
            <Loader2 className="spin" aria-hidden="true" size={28} />
            <h1>Preparando tu espacio</h1>
            <p>Estamos completando tu ingreso con Google…</p>
          </>
        )}
      </div>
    </main>
  );
}
