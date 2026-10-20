"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  Copy,
  ExternalLink,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import {
  getProperties,
  getProfile,
  saveProperty,
  deleteProperty,
  duplicateProperty,
} from "../../services/data";
import {
  PageHeading,
  AddLink,
  Empty,
  Loading,
  ErrorBox,
  Button,
} from "../../components/ui";
import { price, errorMessage, statusLabel } from "../../lib/utils";
export default function Properties() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todas");
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["properties"], queryFn: getProperties });
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile });
  const mutation = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Catálogo actualizado.");
    },
    onError: (e) => {
      client.invalidateQueries({ queryKey: ["properties"] });
      toast.error(errorMessage(e));
    },
  });
  const rows = (query.data || []).filter(
    (p) =>
      (filter === "archivadas"
        ? p.archived
        : !p.archived && (filter === "todas" || p.status === filter)) &&
      `${p.title} ${p.city} ${p.neighborhood}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="TU CATÁLOGO"
        title="Mis propiedades"
        description="Cada espacio tiene una historia. Organizalos desde acá."
        action={
          <AddLink to="/dashboard/propiedades/nueva">Agregar propiedad</AddLink>
        }
      />
      <div className="list-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Buscar propiedades"
            placeholder="Buscar por título o ubicación…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filtrar por estado"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="todas">Todas las activas</option>
          {Object.entries(statusLabel).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
          <option value="archivadas">Archivadas</option>
        </select>
      </div>
      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorBox error={query.error} />
      ) : !rows.length ? (
        <Empty
          title={
            search
              ? "No encontramos coincidencias"
              : "Acá empieza tu próximo catálogo"
          }
          description="Agregá una propiedad o probá otro filtro."
          action={
            <AddLink to="/dashboard/propiedades/nueva">
              Agregar propiedad
            </AddLink>
          }
        />
      ) : (
        <div className="manage-grid">
          {rows.map((p) => (
            <article className="manage-property" key={p.id}>
              <Link
                className="manage-photo"
                href={`/dashboard/propiedades/${p.id}`}
              >
                {p.images[0]?.url ? (
                  <img src={p.images[0].url} alt={p.images[0].alt || p.title} />
                ) : (
                  <div className="image-placeholder">Sin imágenes todavía</div>
                )}
                <span className={`status-badge status-${p.status}`}>
                  {p.archived ? "Archivada" : statusLabel[p.status]}
                </span>
              </Link>
              <div className="manage-info">
                <span className="property-price">
                  {price(p.price, p.currency)}
                </span>
                <h3>{p.title}</h3>
                <p>
                  {p.neighborhood} · {p.city}
                </p>
                <div className="manage-actions">
                  <Link
                    className="btn btn-outline btn-small"
                    href={`/dashboard/propiedades/${p.id}`}
                  >
                    <Pencil size={14} />
                    Editar
                  </Link>
                  <button
                    className="icon-btn"
                    aria-label={`Duplicar ${p.title}`}
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate(() => duplicateProperty(p))}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={
                      p.archived ? "Restaurar propiedad" : "Archivar propiedad"
                    }
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate(() =>
                        saveProperty({ archived: !p.archived }, p.id),
                      )
                    }
                  >
                    <Archive size={16} />
                  </button>
                  <button
                    className="icon-btn danger"
                    aria-label={`Eliminar ${p.title}`}
                    disabled={mutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "¿Eliminar esta propiedad? Esta acción no se puede deshacer.",
                        )
                      )
                        mutation.mutate(() => deleteProperty(p.id));
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                  {profile.data?.published &&
                    [
                      "disponible",
                      "reservada",
                      "vendida",
                      "alquilada",
                    ].includes(p.status) &&
                    !p.archived && (
                      <Link
                        aria-label="Ver ficha pública"
                        className="icon-btn"
                        href={`/${profile.data.username}/propiedad/${p.slug}`}
                      >
                        <ExternalLink size={16} />
                      </Link>
                    )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
