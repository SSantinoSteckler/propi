"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, House, Layers, MessageCircle, ArrowUpRight } from "lucide-react";
import { getEvents, getProperties } from "../../services/data";
import { PageHeading, Empty, ErrorBox } from "../../components/ui";
export default function Analytics() {
  const [period, setPeriod] = useState(30);
  const events = useQuery({ queryKey: ["events"], queryFn: getEvents });
  const properties = useQuery({
    queryKey: ["properties"],
    queryFn: getProperties,
  });
  const rows = (events.data || []).filter(
    (e) =>
      !period ||
      new Date(e.created_at).getTime() > Date.now() - period * 86400000,
  );
  const counts = [
    "portfolio",
    "property",
    "collection",
    "whatsapp",
    "social",
  ].map((k) => rows.filter((r) => r.kind === k).length);
  const days = Array.from({ length: period === 7 ? 7 : 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (period === 7 ? 6 : 29) + i);
    const day = date.toISOString().slice(0, 10);
    return {
      day,
      count: rows.filter(
        (r) =>
          r.created_at.slice(0, 10) === day &&
          ["portfolio", "property", "collection"].includes(r.kind),
      ).length,
    };
  });
  const max = Math.max(1, ...days.map((d) => d.count));
  const ranked = (properties.data || [])
    .map((p) => ({
      ...p,
      views: rows.filter((r) => r.kind === "property" && r.property_id === p.id)
        .length,
    }))
    .filter((p) => p.views > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);
  return (
    <>
      <PageHeading
        eyebrow="APRENDÉ DE CADA VISITA"
        title="Estadísticas"
        description="Una mirada simple a lo que despierta interés."
        action={
          <select
            aria-label="Período de estadísticas"
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value))}
          >
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={0}>Total disponible</option>
          </select>
        }
      />
      <div className="notice">
        Métricas aproximadas, sin cookies de seguimiento. Se descartan bots
        conocidos y se cuenta como máximo un evento del mismo tipo por recurso,
        origen anónimo y hora. Conservación: 365 días. Máximo de consulta:
        10.000 eventos más recientes.
      </div>
      {events.isError ? (
        <ErrorBox error={events.error} />
      ) : (
        <>
          <div className="stats-grid">
            {[
              "Visitas al portfolio",
              "Visitas a propiedades",
              "Visitas a colecciones",
              "Clics a WhatsApp",
            ].map((t, i) => (
              <div className="stat-card" key={t}>
                <span>{t}</span>
                <strong>{events.isLoading ? "—" : counts[i]}</strong>
              </div>
            ))}
          </div>
          <p className="metric-note">
            Clics en redes sociales: {events.isLoading ? "—" : counts[4]}
          </p>
          {!rows.length ? (
            <Empty
              title="Tus próximas visitas aparecerán acá"
              description="Publicá tu portfolio y compartí el enlace. Las métricas requieren configurar la función de analítica de Vercel."
            />
          ) : (
            <div className="panel">
              <h2>Visitas por día</h2>
              <p>
                {period === 0
                  ? "Últimos 30 días del total disponible"
                  : `Últimos ${period} días`}
              </p>
              <div className="analytics-chart">
                {days.map((d) => (
                  <div key={d.day} title={`${d.day}: ${d.count} visitas`}>
                    <span>{d.count || ""}</span>
                    <i style={{ height: Math.max(3, (d.count / max) * 150) }} />
                    <small>{d.day.slice(8)}</small>
                  </div>
                ))}
              </div>
            </div>
          )}
          <section className="panel">
            <h2>Propiedades más vistas</h2>
            {ranked.length ? (
              <ol className="ranking">
                {ranked.map((p) => (
                  <li key={p.id}>
                    <span>{p.title}</span>
                    <strong>{p.views} visitas</strong>
                  </li>
                ))}
              </ol>
            ) : (
              <p>Todavía no hay visitas registradas en propiedades.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
