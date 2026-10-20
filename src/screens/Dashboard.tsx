"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Copy,
  House,
  Layers,
  MessageCircle,
  MousePointerClick,
  Eye,
  Plus,
  Star,
} from "lucide-react";
import {
  PageHeading,
  Empty,
  AddLink,
  ErrorBox,
  Button,
} from "../components/ui";
import {
  getProfile,
  getProperties,
  getCollections,
  getEvents,
  getReviews,
} from "../services/data";
import { copyLink, price } from "../lib/utils";
export default function Dashboard() {
  const p = useQuery({ queryKey: ["profile"], queryFn: getProfile });
  const properties = useQuery({
    queryKey: ["properties"],
    queryFn: getProperties,
  });
  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: getCollections,
  });
  const events = useQuery({ queryKey: ["events"], queryFn: getEvents });
  const reviews = useQuery({ queryKey: ["reviews"], queryFn: getReviews });
  const rows = properties.data || [];
  const stats = [
    {
      label: "Propiedades activas",
      value: properties.isSuccess
        ? rows.filter(
            (r) =>
              !r.archived && ["disponible", "reservada"].includes(r.status),
          ).length
        : null,
      icon: House,
    },
    {
      label: "Vendidas / alquiladas",
      value: properties.isSuccess
        ? rows.filter((r) => ["vendida", "alquilada"].includes(r.status)).length
        : null,
      icon: Layers,
    },
    {
      label: "Visitas al portfolio",
      value: events.isSuccess
        ? (events.data || []).filter((e) => e.kind === "portfolio").length
        : null,
      icon: Eye,
    },
    {
      label: "Clics a WhatsApp",
      value: events.isSuccess
        ? (events.data || []).filter((e) => e.kind === "whatsapp").length
        : null,
      icon: MousePointerClick,
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="SOBRE TU ESCRITORIO"
        title={`Hola${p.data?.first_name ? `, ${p.data.first_name}` : ""}.`}
        description="Tu catálogo, las consultas y lo que sigue. Todo a mano."
        action={
          <AddLink to="/dashboard/propiedades/nueva">Agregar propiedad</AddLink>
        }
      />
      {p.isError && <ErrorBox error={p.error} />}
      {p.data && !p.data.published && (
        <div className="dashboard-welcome">
          <div className="feature-icon">
            <GlobeIcon />
          </div>
          <div>
            <h3>Tu portfolio todavía está puertas adentro.</h3>
            <p>
              Completá tu perfil y publicá tu portfolio para empezar a
              compartirlo.
            </p>
          </div>
          <Link
            className="btn btn-light"
            href={
              p.data.onboarding_step < 4
                ? "/onboarding"
                : "/dashboard/portfolio"
            }
          >
            Preparar mi portfolio <ArrowUpRight size={16} />
          </Link>
        </div>
      )}
      <div className="stats-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div>
              <span>{s.label}</span>
              <s.icon size={18} />
            </div>
            <strong>{s.value === null ? "—" : s.value}</strong>
            <small>
              {s.value === null ? "Esperando datos" : "Datos de tu cuenta"}
            </small>
          </div>
        ))}
      </div>
      <p className="metric-note">
        Las visitas y los clics son aproximados; se reducen repeticiones y bots
        conocidos. Retención: 365 días.
      </p>
      <div className="quick-actions">
        <Link href="/dashboard/colecciones/nueva">
          <Layers size={18} />
          Crear colección <ArrowUpRight size={16} />
        </Link>
        <Button
          className="btn-outline"
          disabled={!p.data?.published}
          onClick={() =>
            copyLink(`/${p.data!.username}`)
              .then(() => toast.success("Enlace copiado."))
              .catch(() => toast.error("No pudimos copiarlo."))
          }
        >
          <Copy size={17} />
          Copiar mi enlace
        </Button>
        <span>{collections.data?.length ?? "—"} colecciones creadas</span>
      </div>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading">
            <h2>Tus últimas propiedades</h2>
            <Link href="/dashboard/propiedades">
              Ver todas <ArrowUpRight size={15} />
            </Link>
          </div>
          {properties.isError ? (
            <ErrorBox error={properties.error} />
          ) : properties.isLoading ? (
            <div className="skeleton" style={{ height: 220 }} />
          ) : rows.length ? (
            <div className="recent-list">
              {rows.slice(0, 4).map((r) => (
                <Link key={r.id} href={`/dashboard/propiedades/${r.id}`}>
                  <div className="recent-image">
                    {r.images[0]?.url && <img src={r.images[0].url} alt="" />}
                  </div>
                  <div>
                    <strong>{r.title}</strong>
                    <small>{r.neighborhood || r.city}</small>
                  </div>
                  <span>{price(r.price, r.currency)}</span>
                  <ArrowUpRight size={16} />
                </Link>
              ))}
            </div>
          ) : (
            <Empty
              title="Acá va tu primera propiedad"
              description="Empezá por las fotos, el precio y dónde está. Podés guardar un borrador y seguir después."
              action={
                <AddLink to="/dashboard/propiedades/nueva">
                  Agregar propiedad
                </AddLink>
              }
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Últimas reseñas</h2>
            <Star size={17} />
          </div>
          {reviews.isError ? (
            <ErrorBox error={reviews.error} />
          ) : reviews.data?.length ? (
            reviews.data.slice(0, 3).map((r) => (
              <div className="review-snippet" key={r.id}>
                <span className="stars">{"★".repeat(r.rating)}</span>
                <p>{r.body}</p>
                <small>
                  {r.display_name} ·{" "}
                  {r.verified ? "Relación verificada" : "Sin verificar"}
                </small>
              </div>
            ))
          ) : (
            <Empty
              title="Que lo cuenten tus clientes"
              description="Invitá a un cliente a compartir su experiencia."
              action={
                <Link className="text-link" href="/dashboard/resenas">
                  Solicitar una reseña <ArrowUpRight size={16} />
                </Link>
              }
            />
          )}
        </section>
      </div>
    </>
  );
}
function GlobeIcon() {
  return <House size={24} />;
}
