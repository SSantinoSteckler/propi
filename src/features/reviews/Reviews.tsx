"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Check, Copy, MessageSquare, ShieldCheck, Star } from "lucide-react";
import {
  PageHeading,
  Button,
  Empty,
  ErrorBox,
  Logo,
} from "../../components/ui";
import {
  createReviewRequest,
  getReviews,
  respondReview,
  reportReview,
} from "../../services/data";
import { db } from "../../lib/supabase";
import { copyLink, errorMessage, siteUrl } from "../../lib/utils";
import { reviewSchema } from "../../lib/validation";
import type { z } from "zod";
export function Reviews() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["reviews"], queryFn: getReviews });
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [editing, setEditing] = useState("");
  const [response, setResponse] = useState("");
  const [reporting, setReporting] = useState("");
  const [reason, setReason] = useState("");
  return (
    <>
      <PageHeading
        eyebrow="EXPERIENCIAS QUE CONSTRUYEN CONFIANZA"
        title="Reseñas"
        description="Escuchá a tus clientes y compartí su experiencia con transparencia."
        action={
          <Button
            busy={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const t = await createReviewRequest();
                setToken(t);
                toast.success("Solicitud creada. El enlace es de un solo uso.");
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Solicitar una reseña
          </Button>
        }
      />
      {token && (
        <div className="notice request-link">
          <div>
            <strong>Invitación de un solo uso · Válida por 30 días</strong>
            <input
              aria-label="Enlace de solicitud de reseña"
              readOnly
              value={`${siteUrl()}/r/${token}`}
            />
          </div>
          <Button
            className="btn-outline"
            onClick={() =>
              copyLink(`/r/${token}`)
                .then(() => toast.success("Enlace copiado."))
                .catch(() => toast.error("Copialo manualmente desde el campo."))
            }
          >
            <Copy size={16} />
            Copiar
          </Button>
        </div>
      )}
      <div className="notice">
        <ShieldCheck size={20} />
        <span>
          Las reseñas no se marcan como verificadas automáticamente. Los
          reportes se revisan por moderación; reportar una opinión no la elimina
          ni cambia la calificación.
        </span>
      </div>
      {query.isError ? (
        <ErrorBox error={query.error} />
      ) : query.data?.length ? (
        <div className="reviews-list">
          {query.data.map((r) => (
            <article className="panel review-panel" key={r.id}>
              <div className="review-header">
                <div>
                  <strong>{r.display_name}</strong>
                  <small>
                    {new Date(r.created_at).toLocaleDateString("es-AR")} ·{" "}
                    {r.verified
                      ? "Relación comercial verificada"
                      : "Relación comercial sin verificar"}
                  </small>
                </div>
                <span className="stars">
                  {"★".repeat(r.rating)}
                  {"☆".repeat(5 - r.rating)}
                </span>
              </div>
              <p>{r.body}</p>
              {r.status === "moderated" && (
                <span className="status-badge">Retirada por moderación</span>
              )}
              {r.response && (
                <blockquote>
                  <strong>Tu respuesta</strong>
                  <p>{r.response}</p>
                </blockquote>
              )}
              <div className="inline-actions">
                <Button
                  className="btn-outline btn-small"
                  onClick={() => {
                    setEditing(r.id);
                    setResponse(r.response || "");
                  }}
                >
                  Responder
                </Button>
                <Button
                  className="btn-ghost btn-small"
                  onClick={() => setReporting(r.id)}
                >
                  Reportar contenido
                </Button>
              </div>
              {editing === r.id && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                      await respondReview(r.id, response);
                      client.invalidateQueries({ queryKey: ["reviews"] });
                      setEditing("");
                      toast.success("Respuesta publicada.");
                    } catch (err) {
                      toast.error(errorMessage(err));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    Tu respuesta
                    <textarea
                      required
                      maxLength={2000}
                      value={response}
                      onChange={(e) => setResponse(e.target.value)}
                    />
                  </label>
                  <Button type="submit" busy={busy}>
                    Publicar respuesta
                  </Button>
                </form>
              )}
              {reporting === r.id && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                      await reportReview(r.id, reason);
                      setReporting("");
                      setReason("");
                      toast.success("Reporte enviado a moderación.");
                    } catch (err) {
                      toast.error(errorMessage(err));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    Motivo del reporte
                    <textarea
                      required
                      minLength={10}
                      maxLength={1000}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <Button type="submit" busy={busy}>
                    Enviar reporte
                  </Button>
                </form>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Tu próxima recomendación empieza acá"
          description="Generá un enlace y compartilo con un cliente real para conocer su experiencia."
        />
      )}
    </>
  );
}
export function ReviewForm() {
  const { token } = useParams<{ token: string }>();
  const [sent, setSent] = useState(false);
  const query = useQuery({
    queryKey: ["review-request", token],
    queryFn: async () => {
      const { data, error } = await db().rpc("review_request_info", {
        p_token: token,
      });
      if (error) throw error;
      return data as { name: string } | null;
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof reviewSchema>>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { rating: 5, honeypot: "" },
  });
  return (
    <div className="public-form-page">
      <Logo />
      <div className="form-panel">
        {query.isLoading ? (
          <p>Cargando invitación…</p>
        ) : query.isError ? (
          <ErrorBox error={query.error} />
        ) : !query.data ? (
          <Empty
            title="Este enlace ya no está disponible"
            description="Puede haber expirado o haber sido utilizado. Pedile al agente una nueva invitación."
          />
        ) : sent ? (
          <div className="success-panel">
            <Check size={32} />
            <h1>Gracias por compartir.</h1>
            <p>
              Tu reseña se recibió y se publica con la identificación de
              relación comercial sin verificar.
            </p>
          </div>
        ) : (
          <>
            <span className="eyebrow">TU EXPERIENCIA CUENTA</span>
            <h1>¿Cómo fue trabajar con {query.data.name}?</h1>
            <p>
              Compartí una experiencia real. El agente puede responder, pero no
              eliminar arbitrariamente tu calificación.
            </p>
            <form
              onSubmit={handleSubmit(async (v) => {
                try {
                  const { error } = await db().rpc("submit_review", {
                    p_token: token,
                    p_name: v.display_name,
                    p_rating: v.rating,
                    p_body: v.body,
                    p_consent: v.privacy,
                    p_honeypot: v.honeypot,
                  });
                  if (error) throw error;
                  setSent(true);
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              })}
            >
              <label>
                Nombre que querés publicar
                <input {...register("display_name")} autoComplete="name" />
                {errors.display_name && (
                  <small className="field-error">
                    {errors.display_name.message}
                  </small>
                )}
              </label>
              <label>
                Tu calificación
                <select {...register("rating")}>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {"★".repeat(n)} — {n} de 5
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tu experiencia
                <textarea rows={5} {...register("body")} />
                {errors.body && (
                  <small className="field-error">{errors.body.message}</small>
                )}
              </label>
              <div className="honeypot" aria-hidden="true">
                <label>
                  Sitio web
                  <input
                    tabIndex={-1}
                    autoComplete="off"
                    {...register("honeypot")}
                  />
                </label>
              </div>
              <label className="checkbox-label">
                <input type="checkbox" {...register("privacy")} />
                <span>
                  Acepto la{" "}
                  <Link href="/privacidad" target="_blank">
                    política de privacidad
                  </Link>{" "}
                  y autorizo publicar el nombre indicado, mi testimonio y
                  calificación. Confirmo que reflejan una experiencia real.
                </span>
              </label>
              {errors.privacy && (
                <small className="field-error">{errors.privacy.message}</small>
              )}
              <Button type="submit" busy={isSubmitting}>
                Enviar mi reseña
              </Button>
            </form>
          </>
        )}
      </div>
      <small>
        Una invitación. Una experiencia real.{" "}
        <Link href="/privacidad">Privacidad</Link>
      </small>
    </div>
  );
}
