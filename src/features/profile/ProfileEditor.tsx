"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Copy,
  ExternalLink,
  Globe,
} from "lucide-react";
import type { z } from "zod";
import { profileSchema } from "../../lib/validation";
import { useAuth } from "../auth/AuthProvider";
import {
  getProfile,
  getPlan,
  saveProfile,
  uploadImage,
} from "../../services/data";
import { useProfileAvatar } from "../../hooks/useProfileAvatar";
import { ThemeToggle } from "../theme/ThemeProvider";
import { errorMessage, copyLink, siteUrl } from "../../lib/utils";
import { Button, ErrorBox, Logo, PageHeading } from "../../components/ui";
type Values = z.infer<typeof profileSchema>;
export default function ProfileEditor({
  onboarding = false,
}: {
  onboarding?: boolean;
}) {
  const { session } = useAuth();
  const initializedProfile = useRef<string | null>(null);
  const client = useQueryClient();
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile });
  const plan = useQuery({ queryKey: ["plan"], queryFn: getPlan });
  const [step, setStep] = useState(1);
  const [uploading, setUploading] = useState(false);
  const avatar = useProfileAvatar(profile.data).data || "";
  const {
    register,
    reset,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      color: "#24594c",
      show_closed: false,
      professional_mode: "independiente",
      website: "",
      instagram: "",
      agency: "",
      license: "",
      jurisdiction: "",
      responsible_broker: "",
      bio: "",
    },
  });
  useEffect(() => {
    if (profile.data && initializedProfile.current !== profile.data.id) {
      initializedProfile.current = profile.data.id;
      reset({ ...profile.data, username: profile.data.username || "" });
      setStep(profile.data.onboarding_step);
    }
  }, [profile.data, reset]);
  const mutation = useMutation({
    mutationFn: async (
      values: Partial<Values> & {
        onboarding_step?: number;
        published?: boolean;
        avatar_path?: string;
        cover_path?: string | null;
      },
    ) => saveProfile({ id: session!.user.id, ...values }),
    onSuccess: (savedProfile) => {
      client.setQueryData(["profile"], savedProfile);
      client.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Cambios guardados.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  async function next() {
    let keys: (keyof Values)[] =
      step === 1
        ? ["first_name", "last_name", "bio", "city", "province", "whatsapp"]
        : step === 2
          ? [
              "agency",
              "professional_mode",
              "license",
              "jurisdiction",
              "responsible_broker",
              "instagram",
              "website",
            ]
          : ["username", "color", "show_closed"];
    const values = watch();
    const shape = profileSchema.pick(
      Object.fromEntries(keys.map((k) => [k, true])) as Record<
        keyof Values,
        true
      >,
    );
    const result = shape.safeParse(values);
    if (!result.success) {
      toast.error(result.error.issues[0].message);
      return;
    }
    try {
      await mutation.mutateAsync({
        ...Object.fromEntries(keys.map((k) => [k, values[k]])),
        onboarding_step: Math.min(step + 1, 4),
      });
      setStep(Math.min(step + 1, 4));
    } catch {
      /* mutation handles error */
    }
  }
  async function upload(
    file: File | undefined,
    kind: "avatar_path" | "cover_path",
  ) {
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadImage(file, session!.user.id, "profile");
      await mutation.mutateAsync({ [kind]: path });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }
  const input = (
    name: keyof Values,
    label: string,
    type = "text",
    placeholder = "",
  ) => (
    <label>
      {label}
      <input type={type} placeholder={placeholder} {...register(name)} />
      {errors[name] && (
        <small className="field-error">{errors[name]?.message}</small>
      )}
    </label>
  );
  if (profile.isError) return <ErrorBox error={profile.error} />;
  if (profile.isLoading)
    return <div className="skeleton page">Cargando tu perfil…</div>;
  return (
    <div className={onboarding ? "onboarding container" : "profile-editor"}>
      {onboarding && (
        <>
          <div className="onboarding-nav">
            <Logo />
            <div className="onboarding-actions">
            <ThemeToggle />
            <Link href="/dashboard">Guardar y continuar después</Link>
            </div>
          </div>
          <div className="onboarding-intro">
            <span className="eyebrow">HAGAMOS LUGAR A TU HISTORIA</span>
            <h1>Tu portfolio, paso a paso.</h1>
            <p>Lo esencial para que tus próximos clientes te conozcan.</p>
          </div>
          <div className="stepper">
            {[
              "Sobre vos",
              "Tu profesión",
              "Tu enlace",
              "Primera propiedad",
            ].map((s, i) => (
              <button
                key={s}
                className={
                  step === i + 1 ? "active" : step > i + 1 ? "complete" : ""
                }
                onClick={() => setStep(i + 1)}
              >
                <span>{step > i + 1 ? <Check size={13} /> : i + 1}</span>
                {s}
              </button>
            ))}
          </div>
        </>
      )}
      {!onboarding && (
        <PageHeading
          title="Mi portfolio"
          description="Tu identidad profesional. Siempre actualizada."
          action={
            profile.data?.published ? (
              <Link
                className="btn btn-outline"
                href={`/${profile.data.username}`}
                target="_blank"
              >
                Ver portfolio <ExternalLink size={16} />
              </Link>
            ) : undefined
          }
        />
      )}
      <form
        className="form-panel"
        onSubmit={handleSubmit(async (values) => {
          try {
            await mutation.mutateAsync({
              ...values,
              published: profile.data?.published,
            });
          } catch {}
        })}
        noValidate
      >
        {(!onboarding || step === 1) && (
          <section>
            <h2>Primero, presentate.</h2>
            <p>Estos datos se van a mostrar en tu portfolio público.</p>
            <label className="upload-avatar">
              {avatar ? (
                <img src={avatar} alt="Tu foto profesional" />
              ) : (
                <Camera size={28} />
              )}
              <span>
                {uploading ? "Subiendo…" : "Subir foto profesional"}
                <small>JPG, PNG o WebP · Hasta 8 MB</small>
              </span>
              <input
                disabled={uploading}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => upload(e.target.files?.[0], "avatar_path")}
              />
            </label>
            <div className="form-grid">
              {input("first_name", "Nombre")}
              {input("last_name", "Apellido")}
              {input("city", "Ciudad o localidad")}
              {input("province", "Provincia")}
              {input("whatsapp", "WhatsApp", "tel", "5491123456789")}
            </div>
            <label>
              Tu presentación
              <textarea
                rows={3}
                placeholder="Contá quién sos y cómo acompañás a tus clientes…"
                {...register("bio")}
              />
              {errors.bio && (
                <small className="field-error">{errors.bio.message}</small>
              )}
            </label>
          </section>
        )}
        {(!onboarding || step === 2) && (
          <section>
            <h2>Tu identidad profesional.</h2>
            <p>
              Completá la información que corresponda a tu actividad y
              jurisdicción.
            </p>
            <div className="form-grid">
              {input("agency", "Inmobiliaria (opcional)")}
              <label>
                Modalidad profesional
                <select {...register("professional_mode")}>
                  <option value="independiente">Agente independiente</option>
                  <option value="corredor">
                    Corredor con matrícula propia
                  </option>
                  <option value="colaborador">
                    Colaborador de corredor responsable
                  </option>
                </select>
              </label>
              {input("license", "Matrícula")}
              {input("jurisdiction", "Colegio / jurisdicción")}
              {input("responsible_broker", "Nombre del corredor responsable")}
              {input("instagram", "Instagram", "text", "tu.usuario")}
              {input("website", "Sitio web (opcional)", "url", "https://…")}
            </div>
          </section>
        )}
        {(!onboarding || step === 3) && (
          <section>
            <h2>Un enlace que habla de vos.</h2>
            <p>Elegí cómo te van a encontrar tus clientes.</p>
            {input("username", "Nombre de usuario", "text", "nombre-apellido")}
            <div className="url-preview">
              <Globe size={16} />
              {siteUrl().replace(/^https?:\/\//, "")}/
              {watch("username") || "tu-nombre"}
            </div>
            <div className="form-grid">
              <label>
                Color principal{" "}
                {plan.data?.plan !== "pro" && <small>Disponible en Pro</small>}
                <input
                  type="color"
                  disabled={plan.data?.plan !== "pro"}
                  {...register("color")}
                />
              </label>
              <label>
                Portada personalizada{" "}
                {plan.data?.plan !== "pro" && <small>Disponible en Pro</small>}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={plan.data?.plan !== "pro" || uploading}
                  onChange={(e) => upload(e.target.files?.[0], "cover_path")}
                />
              </label>
            </div>
            <label className="checkbox-label">
              <input type="checkbox" {...register("show_closed")} />
              Mostrar también propiedades vendidas y alquiladas
            </label>
          </section>
        )}
        {onboarding && step === 4 ? (
          <section className="onboarding-done">
            <span className="feature-icon">
              <Check />
            </span>
            <h2>Ahora, tu primera propiedad.</h2>
            <p>
              Tu perfil ya tiene forma. Sumá una propiedad y, cuando esté todo
              listo, publicá tu portfolio desde el panel.
            </p>
            <Link className="btn" href="/dashboard/propiedades/nueva">
              Cargar mi primera propiedad <ArrowRight size={16} />
            </Link>
            <Link className="text-link" href="/dashboard">
              Ir a mi panel
            </Link>
          </section>
        ) : (
          <div className="form-footer">
            {onboarding && step > 1 && (
              <Button
                type="button"
                className="btn-outline"
                onClick={() => setStep((s) => s - 1)}
              >
                <ArrowLeft size={16} />
                Atrás
              </Button>
            )}
            {onboarding ? (
              <Button type="button" busy={mutation.isPending} onClick={next}>
                Guardar y continuar <ArrowRight size={16} />
              </Button>
            ) : (
              <Button type="submit" busy={mutation.isPending}>
                Guardar cambios
              </Button>
            )}
          </div>
        )}
      </form>
      {!onboarding && (
        <div className="form-panel publication-panel">
          <div>
            <h2>
              {profile.data?.published
                ? "Tu portfolio está publicado"
                : "Todo listo para salir al mundo"}
            </h2>
            <p>
              {profile.data?.published
                ? "Cualquier persona con tu enlace puede visitar el portfolio."
                : "Guardá todos tus datos antes de publicar tu portfolio."}
            </p>
          </div>
          <div className="inline-actions">
            <Button
              className={profile.data?.published ? "btn-outline" : ""}
              busy={mutation.isPending}
              onClick={() =>
                mutation.mutate({ published: !profile.data?.published })
              }
            >
              {profile.data?.published
                ? "Despublicar portfolio"
                : "Publicar portfolio"}
            </Button>
            {profile.data?.published && (
              <Button
                className="btn-outline"
                onClick={() =>
                  copyLink(`/${profile.data!.username}`)
                    .then(() => toast.success("Enlace copiado."))
                    .catch(() => toast.error("No se pudo copiar."))
                }
              >
                <Copy size={16} />
                Copiar enlace
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
