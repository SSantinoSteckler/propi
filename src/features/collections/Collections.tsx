"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  ExternalLink,
  Layers,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  getCollections,
  getCollection,
  getProperties,
  saveCollection,
  deleteCollection,
} from "../../services/data";
import {
  PageHeading,
  AddLink,
  Button,
  Empty,
  Loading,
  ErrorBox,
} from "../../components/ui";
import { copyLink, errorMessage, price } from "../../lib/utils";
export function Collections() {
  const query = useQuery({
    queryKey: ["collections"],
    queryFn: getCollections,
  });
  const client = useQueryClient();
  return (
    <>
      <PageHeading
        eyebrow="UNA SELECCIÓN MÁS PERSONAL"
        title="Colecciones"
        description="Las propiedades indicadas para cada búsqueda. Un enlace para compartirlas."
        action={
          <AddLink to="/dashboard/colecciones/nueva">Crear colección</AddLink>
        }
      />
      <div className="notice">
        Los enlaces son no listados y no aparecen en buscadores. Cualquier
        persona que tenga el enlace puede abrirlo. No incluyas datos de clientes
        sin consentimiento.
      </div>
      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorBox error={query.error} />
      ) : !query.data?.length ? (
        <Empty
          title="Una selección puede abrir una puerta"
          description="Elegí propiedades de tu catálogo y compartilas juntas."
          action={
            <AddLink to="/dashboard/colecciones/nueva">
              Crear mi primera colección
            </AddLink>
          }
        />
      ) : (
        <div className="collection-grid">
          {query.data.map((c) => (
            <article className="panel collection-card" key={c.id}>
              <div>
                <span className="feature-icon">
                  <Layers />
                </span>
                <span className="status-badge">
                  {c.active ? "Enlace activo" : "Desactivada"}
                </span>
              </div>
              <h2>{c.name}</h2>
              <p>{c.description || "Una selección de tu catálogo."}</p>
              <small>
                Creada el {new Date(c.created_at).toLocaleDateString("es-AR")}
              </small>
              <div className="inline-actions">
                <Link
                  className="btn btn-outline btn-small"
                  href={`/dashboard/colecciones/${c.id}`}
                >
                  <Pencil size={14} />
                  Editar
                </Link>
                <Button
                  className="btn-outline btn-small"
                  disabled={!c.active}
                  onClick={() =>
                    copyLink(`/c/${c.token}`)
                      .then(() => toast.success("Enlace copiado."))
                      .catch(() => toast.error("No se pudo copiar."))
                  }
                >
                  <Copy size={14} />
                  Copiar
                </Button>
                {c.active && (
                  <Link
                    className="icon-btn"
                    href={`/c/${c.token}`}
                    aria-label="Abrir colección"
                  >
                    <ExternalLink size={16} />
                  </Link>
                )}
                <button
                  className="icon-btn danger"
                  aria-label="Eliminar colección"
                  onClick={async () => {
                    if (
                      window.confirm(
                        "¿Eliminar esta colección y desactivar su enlace?",
                      )
                    ) {
                      try {
                        await deleteCollection(c.id);
                        client.invalidateQueries({ queryKey: ["collections"] });
                        toast.success("Colección eliminada.");
                      } catch (e) {
                        toast.error(errorMessage(e));
                      }
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
export function CollectionEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const client = useQueryClient();
  const properties = useQuery({
    queryKey: ["properties"],
    queryFn: getProperties,
  });
  const collection = useQuery({
    queryKey: ["collection", id],
    queryFn: () => getCollection(id!),
    enabled: !!id,
  });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (collection.data) {
      setName(collection.data.name);
      setDescription(collection.data.description);
      setActive(collection.data.active);
      setIds(collection.data.property_ids || []);
    }
  }, [collection.data]);
  function move(i: number, d: number) {
    setIds((v) => {
      const copy = [...v];
      [copy[i], copy[i + d]] = [copy[i + d], copy[i]];
      return copy;
    });
  }
  return (
    <>
      <Link className="back-link" href="/dashboard/colecciones">
        <ArrowLeft size={15} />
        Colecciones
      </Link>
      <PageHeading
        title={id ? "Una selección a medida." : "Creá una colección."}
        description="Un nombre, las propiedades y un enlace para compartir."
      />
      {collection.isError ? (
        <ErrorBox error={collection.error} />
      ) : (
        <form
          className="form-panel"
          onSubmit={async (e) => {
            e.preventDefault();
            if (ids.length === 0) {
              toast.error("Elegí al menos una propiedad.");
              return;
            }
            setBusy(true);
            try {
              await saveCollection(id || null, name, description, ids, active);
              client.invalidateQueries({ queryKey: ["collections"] });
              client.invalidateQueries({ queryKey: ["collection", id] });
              toast.success("Colección guardada.");
              router.push("/dashboard/colecciones");
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Nombre público
            <input
              required
              minLength={3}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Una selección para tu próxima mudanza"
            />
          </label>
          <p className="form-note">
            Usá un título que no exponga la identidad de tu cliente.
          </p>
          <label>
            Descripción (opcional)
            <textarea
              maxLength={600}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Enlace activo
          </label>
          <h2>Elegí las propiedades</h2>
          {properties.isError && <ErrorBox error={properties.error} />}
          <div className="property-checklist">
            {properties.data
              ?.filter((p) => !p.archived)
              .map((p) => (
                <label className="checkbox-label" key={p.id}>
                  <input
                    type="checkbox"
                    checked={ids.includes(p.id)}
                    onChange={(e) =>
                      setIds((v) =>
                        e.target.checked
                          ? [...v, p.id]
                          : v.filter((x) => x !== p.id),
                      )
                    }
                  />
                  <span>
                    {p.title}
                    <small>
                      {price(p.price, p.currency)} · {p.status}
                    </small>
                  </span>
                </label>
              ))}
          </div>
          <p className="form-note">
            Solo las propiedades publicadas se mostrarán en el enlace
            compartido.
          </p>
          {ids.length > 0 && (
            <>
              <h3>Orden de presentación</h3>
              <ol className="reorder-list">
                {ids.map((pid, i) => (
                  <li key={pid}>
                    <span>
                      {properties.data?.find((p) => p.id === pid)?.title ||
                        "Propiedad"}
                    </span>
                    <button
                      className="icon-btn"
                      type="button"
                      disabled={i === 0}
                      aria-label="Subir propiedad"
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      type="button"
                      disabled={i === ids.length - 1}
                      aria-label="Bajar propiedad"
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown size={15} />
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
          <div className="form-footer">
            <Button busy={busy} type="submit">
              Guardar colección
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
