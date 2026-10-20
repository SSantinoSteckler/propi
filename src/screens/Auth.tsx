"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Logo, Button } from "../components/ui";
import { configured, db } from "../lib/supabase";
import { authSchema } from "../lib/validation";
import { errorMessage, siteUrl } from "../lib/utils";
import { signInWithGoogle } from "../features/auth/google";
import { ThemeToggle } from "../features/theme/ThemeProvider";
export default function Auth({
  mode,
}: {
  mode: "login" | "registro" | "recuperar" | "actualizar-clave";
}) {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState(false);
  const signup = mode === "registro";
  const recovery = mode === "recuperar";
  const update = mode === "actualizar-clave";
  const schema = recovery
    ? z.object({
        email: z.string().email("Ingresá un email válido."),
        password: z.string().optional(),
      })
    : update
      ? z.object({
          email: z.string().optional(),
          password: authSchema.shape.password,
        })
      : authSchema;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email?: string; password?: string }>({
    resolver: zodResolver(schema),
  });
  async function google() {
    setGoogleBusy(true);
    setGoogleError(false);
    try {
      await signInWithGoogle(db().auth);
    } catch {
      setGoogleError(true);
      setGoogleBusy(false);
    }
  }
  async function submit(values: { email?: string; password?: string }) {
    try {
      const client = db();
      if (recovery) {
        const { error } = await client.auth.resetPasswordForEmail(
          values.email!,
          { redirectTo: `${siteUrl()}/actualizar-clave` },
        );
        if (error) throw error;
        setSent(true);
        return;
      }
      if (update) {
        const { error } = await client.auth.updateUser({
          password: values.password,
        });
        if (error) throw error;
        toast.success("Contraseña actualizada.");
        router.push("/dashboard");
        return;
      }
      const credentials = { email: values.email!, password: values.password! };
      const { data, error } = signup
        ? await client.auth.signUp({
            ...credentials,
            options: { emailRedirectTo: `${siteUrl()}/onboarding` },
          })
        : await client.auth.signInWithPassword(credentials);
      if (error) throw error;
      if (signup && !data.session) {
        setSent(true);
        return;
      }
      router.push(signup ? "/onboarding" : "/dashboard");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  return (
    <div className="auth-layout">
      <div className="auth-main">
        <div className="auth-brand-row">
        <Logo />
        <ThemeToggle />
        </div>
        <div className="auth-form">
          <Link className="back-link" href="/">
            <ArrowLeft size={15} />
            Volver al inicio
          </Link>
          <span className="eyebrow">
            {recovery || update ? "RECUPERACIÓN DE ACCESO" : signup ? "PRIMER PASO: TU CUENTA" : "DE VUELTA EN TU ESCRITORIO"}
          </span>
          <h1>
            {recovery
              ? "Recuperá tu acceso"
              : update
                ? "Una nueva contraseña"
                : signup
                  ? "Tu portfolio empieza acá."
                  : "Qué bueno verte."}
          </h1>
          <p>
            {recovery
              ? "Te enviaremos un enlace para elegir una nueva contraseña."
              : update
                ? "Elegí una contraseña de al menos 8 caracteres."
                : signup
                  ? "Tu nombre, tus propiedades y un enlace para compartirlas."
                  : "Ingresá para actualizar tu catálogo y preparar tu próxima selección."}
          </p>
          {!configured && (
            <div className="notice">
              Falta configurar Supabase. El registro y el acceso se habilitan al
              completar las variables de entorno del README.
            </div>
          )}
          {sent ? (
            <div className="success-panel">
              <Check size={28} />
              <h3>Revisá tu correo</h3>
              <p>
                {recovery
                  ? "Si existe una cuenta asociada, vas a recibir las instrucciones."
                  : "Te enviamos un enlace para confirmar tu email y continuar con tu perfil."}
              </p>
              <Link href="/login">Volver a ingresar</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(submit)} noValidate>
              {!recovery && !update && (
                <>
                  <Button
                    type="button"
                    className="google-button"
                    busy={googleBusy}
                    disabled={!configured || isSubmitting}
                    onClick={google}
                  >
                    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                      <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.9 6-15.1Z" />
                      <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.2c-1.8 1.2-4.1 2-6.8 2-5.3 0-9.8-3.6-11.4-8.4H5.7v5.4A20.4 20.4 0 0 0 24 44Z" />
                      <path fill="#FBBC05" d="M12.6 27.5a12.2 12.2 0 0 1 0-7V15H5.7a20.1 20.1 0 0 0 0 18l6.9-5.5Z" />
                      <path fill="#EA4335" d="M24 12.1c3 0 5.6 1 7.7 3l5.8-5.8A19.4 19.4 0 0 0 24 4 20.4 20.4 0 0 0 5.7 15l6.9 5.5C14.2 15.7 18.7 12.1 24 12.1Z" />
                    </svg>
                    {googleBusy ? "Conectando con Google…" : "Continuar con Google"}
                  </Button>
                  {googleError && (
                    <p className="field-error" role="alert">
                      No pudimos conectar con Google. Intentá nuevamente o ingresá con email.
                    </p>
                  )}
                  <div className="auth-divider"><span>o con tu email</span></div>
                </>
              )}
              {!update && (
                <label>
                  Email
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="vos@ejemplo.com"
                    {...register("email")}
                  />
                  {errors.email && (
                    <small className="field-error">
                      {errors.email.message}
                    </small>
                  )}
                </label>
              )}
              {!recovery && (
                <label>
                  Contraseña
                  <input
                    type="password"
                    autoComplete={
                      signup || update ? "new-password" : "current-password"
                    }
                    placeholder="Al menos 8 caracteres"
                    {...register("password")}
                  />
                  {errors.password && (
                    <small className="field-error">
                      {errors.password.message}
                    </small>
                  )}
                </label>
              )}
              {signup && (
                <p className="form-note">
                  Al crear tu cuenta aceptás los{" "}
                  <Link href="/terminos">Términos</Link> y la{" "}
                  <Link href="/privacidad">Política de privacidad</Link>.
                </p>
              )}
              <Button type="submit" busy={isSubmitting} disabled={!configured || googleBusy}>
                {recovery
                  ? "Enviar enlace"
                  : update
                    ? "Guardar contraseña"
                    : signup
                      ? "Crear mi cuenta"
                      : "Ingresar"}
                <ArrowRight size={17} />
              </Button>
              {mode === "login" && (
                <Link className="form-link" href="/recuperar">
                  Olvidé mi contraseña
                </Link>
              )}
            </form>
          )}
          {!recovery && !update && (
            <p className="auth-switch">
              {signup ? "¿Ya tenés cuenta?" : "¿Todavía no tenés cuenta?"}{" "}
              <Link href={signup ? "/login" : "/registro"}>
                {signup ? "Ingresá" : "Creá tu portfolio gratis"}
              </Link>
            </p>
          )}
        </div>
        <small>Un espacio propio. Muchas posibilidades.</small>
      </div>
      <aside className="auth-aside">
        <div>
          <span className="eyebrow">HECHO PARA TU FORMA DE TRABAJAR</span>
          <h2>
            Tu experiencia.
            <br />
            Tus propiedades.
            <br />
            <em>Tu propio lugar.</em>
          </h2>
          <p>
            Conectá todo lo que ofrecés en una presencia digital que hable de
            vos.
          </p>
          <div className="auth-benefits">
            <span>
              <Check />
              Un link para compartir
            </span>
            <span>
              <Check />
              Tu catálogo siempre actualizado
            </span>
            <span>
              <ShieldCheck />
              Tus datos bajo tu control
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}
