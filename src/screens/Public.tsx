"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowUpRight,
  Bath,
  BedDouble,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Expand,
  Globe,
  Instagram,
  MapPin,
  MessageCircle,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Star,
} from "lucide-react";
import { getProperty, getProfile, track } from "../services/data";

import { PropertyCard } from "../components/PropertyCard";
import { ThemeToggle } from "../features/theme/ThemeProvider";
import { Empty, ErrorBox, Loading, Logo } from "../components/ui";
import {
  area,
  copyLink,
  price,
  siteUrl,
  statusLabel,
  whatsapp,
} from "../lib/utils";
import type {
  Profile,
  Property,
  PublicCollection,
  PublicPortfolio,
} from "../types/domain";

function DemoBanner() {
  return (
    <div className="demo-banner">
      PORTFOLIO DE EJEMPLO · Perfiles, propiedades y reseñas ficticios. Fotos
      ilustrativas.{" "}
      <Link href="/registro">
        Creá el tuyo <ArrowUpRight size={13} />
      </Link>
    </div>
  );
}
function PublicHeader() {
  return (
    <header className="public-nav container">
      <Logo />
      <div className="public-nav-actions">
      <ThemeToggle />
      <Link href="/registro">
        Creá tu portfolio <ArrowUpRight size={15} />
      </Link>
      </div>
    </header>
  );
}
function PublicFooter() {
  return (
    <footer className="public-footer container">
      <Logo />
      <p>Propiedades con alguien del otro lado.</p>
      <Link href="/privacidad">Privacidad</Link>
    </footer>
  );
}
export function Professional({ profile: p }: { profile: Profile }) {
  return (
    <div className="professional">
      {p.agency && <span>{p.agency}</span>}
      {p.responsible_broker && (
        <span>Corredor responsable: {p.responsible_broker}</span>
      )}
      {p.license && (
        <span>
          Matrícula: {p.license} · {p.jurisdiction}
        </span>
      )}
    </div>
  );
}
export function Contact({
  profile: p,
  demo = false,
  property,
}: {
  profile: Profile;
  demo?: boolean;
  property?: Property;
}) {
  return demo || !p.whatsapp ? (
    <span className="btn btn-outline demo-contact">
      Contacto deshabilitado en el ejemplo
    </span>
  ) : (
    <a
      className="btn"
      target="_blank"
      rel="noopener noreferrer"
      href={whatsapp(
        p.whatsapp,
        `Hola ${p.first_name}, ${property ? `me interesa ${property.title}: ${siteUrl()}/${p.username}/propiedad/${property.slug}` : "vi tu portfolio y quisiera hacerte una consulta."}`,
      )}
      onClick={() => track(p.username, "whatsapp", property?.slug)}
    >
      <MessageCircle size={18} />
      Conversemos por WhatsApp <ArrowUpRight size={16} />
    </a>
  );
}

export function PortfolioView({
  data,
  demo,
}: {
  data: PublicPortfolio;
  demo: boolean;
}) {
  const p = data.profile;
  useEffect(() => {
    if (!demo) track(p.username, "portfolio");
  }, [p.username, demo]);
  const [operation, setOperation] = useState("todas");
  const [type, setType] = useState("todos");
  const [city, setCity] = useState("todas");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [showFilters, setShowFilters] = useState(false);
  const rows = data.properties.filter(
    (r) =>
      (operation === "todas" || r.operation === operation) &&
      (type === "todos" || r.type === type) &&
      (city === "todas" || r.city === city) &&
      (!min || (r.currency === currency && r.price >= Number(min))) &&
      (!max || (r.currency === currency && r.price <= Number(max))),
  );
  return (
    <div
      className="portfolio-page"
      style={{ "--brand": p.color } as React.CSSProperties}
    >
      {demo && <DemoBanner />}
      <PublicHeader />
      <div className="portfolio-cover">
        {data.cover_url ? (
          <img src={data.cover_url} alt="Portada del portfolio" />
        ) : (
          <div className="cover-pattern">
            <span>
              Los espacios cambian.
              <br />
              Las historias empiezan.
            </span>
          </div>
        )}
      </div>
      <main className="container portfolio-container">
        <section className="agent-intro">
          <div className="agent-heading">
            <div className="agent-avatar">
              {data.avatar_url ? (
                <img
                  src={data.avatar_url}
                  alt={`${p.first_name} ${p.last_name}`}
                />
              ) : (
                <span>
                  {p.first_name[0]}
                  {p.last_name[0]}
                </span>
              )}
            </div>
            <div className="agent-top-actions">
              <button
                className="btn btn-outline btn-small"
                onClick={() => share(window.location.href)}
              >
                <Share2 size={15} />
                Compartir
              </button>
              {!demo && p.whatsapp && <Contact profile={p} />}
            </div>
          </div>
          <span className="eyebrow">TU PRÓXIMO LUGAR EMPIEZA ACÁ</span>
          <h1>
            {p.first_name} {p.last_name}
          </h1>
          <p className="agent-location">
            <MapPin size={16} />
            {p.city}, {p.province}
          </p>
          <Professional profile={p} />
          <p className="agent-bio">{p.bio}</p>
          <div className="social-links">
            {p.instagram && (
              <a
                href={`https://www.instagram.com/${p.instagram.replace("@", "")}`}
                rel="noopener noreferrer"
                target="_blank"
                onClick={() => track(p.username, "social")}
              >
                <Instagram size={18} />
                Instagram <ArrowUpRight size={14} />
              </a>
            )}
            {p.website && (
              <a
                href={p.website}
                rel="noopener noreferrer"
                target="_blank"
                onClick={() => track(p.username, "social")}
              >
                <Globe size={18} />
                Sitio web <ArrowUpRight size={14} />
              </a>
            )}
          </div>
        </section>
        <section className="portfolio-catalog">
          <div className="section-heading">
            <div>
              <span className="eyebrow">ESPACIOS PARA TU PRÓXIMA HISTORIA</span>
              <h2>Encontrá tu próximo lugar.</h2>
            </div>
            <span>{data.properties.length} propiedades</span>
          </div>
          <div className="portfolio-filter-bar">
            <div className="segmented">
              {[
                ["todas", "Todas"],
                ["venta", "En venta"],
                ["alquiler", "En alquiler"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={operation === key ? "active" : ""}
                  onClick={() => setOperation(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="btn btn-outline btn-small"
              aria-expanded={showFilters}
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal size={16} />
              Filtros
            </button>
          </div>
          {showFilters && (
            <div className="filters-panel">
              <label>
                Tipo
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="todos">Todos los inmuebles</option>
                  {Array.from(new Set(data.properties.map((r) => r.type))).map(
                    (t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Localidad
                <select value={city} onChange={(e) => setCity(e.target.value)}>
                  <option value="todas">Todas</option>
                  {Array.from(new Set(data.properties.map((r) => r.city))).map(
                    (t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Moneda
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option>USD</option>
                  <option>ARS</option>
                </select>
              </label>
              <label>
                Precio desde
                <input
                  type="number"
                  min={0}
                  value={min}
                  onChange={(e) => setMin(e.target.value)}
                />
              </label>
              <label>
                Precio hasta
                <input
                  type="number"
                  min={0}
                  value={max}
                  onChange={(e) => setMax(e.target.value)}
                />
              </label>
            </div>
          )}
          {rows.length ? (
            <div className="card-grid">
              {rows.map((property) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  username={p.username}
                  demo={demo}
                />
              ))}
            </div>
          ) : (
            <Empty
              title="Todavía no hay espacios para esta búsqueda"
              description="Probá otros filtros o consultale al agente por lo que estás buscando."
            />
          )}
        </section>
        {data.reviews.length > 0 && (
          <section className="public-reviews">
            <span className="eyebrow">EXPERIENCIAS COMPARTIDAS</span>
            <h2>Lo que cuentan mis clientes.</h2>
            <div className="reviews-public-grid">
              {data.reviews.map((r) => (
                <article className="panel" key={r.id}>
                  <span className="stars">
                    {"★".repeat(r.rating)}
                    {"☆".repeat(5 - r.rating)}
                  </span>
                  <p>“{r.body}”</p>
                  <strong>{r.display_name}</strong>
                  <small>
                    {new Date(r.created_at).toLocaleDateString("es-AR", {
                      timeZone: "America/Argentina/Buenos_Aires",
                    })}{" "}
                    ·{" "}
                    {r.verified
                      ? "Relación comercial verificada"
                      : "Relación comercial sin verificar"}
                  </small>
                  {r.response && (
                    <blockquote>
                      <strong>Respuesta del agente</strong>
                      <p>{r.response}</p>
                    </blockquote>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
        <section className="public-contact">
          <div>
            <span className="eyebrow">
              CADA BÚSQUEDA EMPIEZA CON UNA CHARLA
            </span>
            <h2>Hablemos de tu próximo paso.</h2>
            <p>Contame qué estás buscando. Te acompaño a encontrarlo.</p>
          </div>
          <Contact profile={p} demo={demo} />
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
export function PropertyPreview() {
  const { id } = useParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["property-preview", id],
    queryFn: async () => {
      const [profile, property] = await Promise.all([
        getProfile(),
        getProperty(id),
      ]);
      return { profile, property };
    },
  });
  if (query.isLoading)
    return (
      <div className="container section">
        <Loading />
      </div>
    );
  if (query.isError) return <ErrorBox error={query.error} />;
  if (!query.data) return <NotFound />;
  return (
    <PropertyView
      p={query.data.property}
      profile={query.data.profile}
      demo={false}
      preview
    />
  );
}
export function PropertyView({
  p,
  profile,
  demo,
  preview,
}: {
  p: Property;
  profile: Profile;
  demo: boolean;
  preview: boolean;
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!demo && !preview) track(profile.username, "property", p.slug);
  }, [profile.username, p.slug, demo, preview]);
  return (
    <div className="property-page">
      {demo && <DemoBanner />}
      {preview && (
        <div className="demo-banner">
          Previsualización privada · La propiedad no se publica por abrir esta
          página.
        </div>
      )}
      <PublicHeader />
      <main className="container">
        <Link
          className="back-link"
          href={
            preview
              ? `/dashboard/propiedades/${p.id}`
              : demo
                ? "/ejemplo"
                : `/${profile.username}`
          }
        >
          <ArrowLeft size={15} />
          {preview ? "Volver al editor" : "Volver al portfolio"}
        </Link>
        <div className="property-title-row">
          <div>
            <span className="eyebrow">
              {p.type} · {p.operation === "venta" ? "EN VENTA" : "EN ALQUILER"}{" "}
              · {statusLabel[p.status]}
            </span>
            <h1>{p.title}</h1>
            <p className="property-location">
              <MapPin size={16} />
              {[p.neighborhood, p.city, p.province].filter(Boolean).join(", ")}
            </p>
          </div>
          <button
            className="btn btn-outline"
            onClick={() => share(window.location.href)}
          >
            <Share2 size={16} />
            Compartir
          </button>
        </div>
        <div className="property-gallery">
          {p.images[index]?.url ? (
            <img
              src={p.images[index].url}
              alt={p.images[index].alt || p.title}
            />
          ) : (
            <div className="image-placeholder">Fotografías próximamente</div>
          )}
          {p.images.length > 1 && (
            <>
              <button
                className="gallery-prev icon-btn"
                aria-label="Foto anterior"
                onClick={() =>
                  setIndex((i) => (i - 1 + p.images.length) % p.images.length)
                }
              >
                <ChevronLeft />
              </button>
              <button
                className="gallery-next icon-btn"
                aria-label="Siguiente foto"
                onClick={() => setIndex((i) => (i + 1) % p.images.length)}
              >
                <ChevronRight />
              </button>
            </>
          )}
          <span className="gallery-count">
            {p.images.length ? index + 1 : 0} / {p.images.length}
          </span>
        </div>
        {p.images.length > 1 && (
          <div className="gallery-thumbs">
            {p.images.map((image, i) => (
              <button
                key={image.id}
                className={index === i ? "active" : ""}
                aria-label={`Ver foto ${i + 1}`}
                onClick={() => setIndex(i)}
              >
                <img
                  src={image.url}
                  alt={image.alt || `Foto ${i + 1}`}
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
        <div className="property-detail-columns">
          <div>
            <div className="detail-features">
              <span>
                <Expand />
                {area(p.total_area)} totales
              </span>
              <span>
                <BedDouble />
                {p.bedrooms} dormitorios
              </span>
              <span>
                <Bath />
                {p.bathrooms} baños
              </span>
              <span>
                <Car />
                {p.garages} cocheras
              </span>
            </div>
            <section>
              <h2>Un espacio para imaginarte.</h2>
              <p className="preserve-lines">{p.description}</p>
            </section>
            <section>
              <h2>Todos los detalles</h2>
              <dl className="details-grid">
                {[
                  ["Superficie cubierta", area(p.covered_area)],
                  ["Superficie total", area(p.total_area)],
                  ["Ambientes", p.rooms],
                  ["Dormitorios", p.bedrooms],
                  ["Baños", p.bathrooms],
                  ["Cocheras", p.garages],
                  [
                    "Antigüedad",
                    p.age === null ? "Sin especificar" : `${p.age} años`,
                  ],
                  ["Estado", statusLabel[p.status]],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section>
              <h2>Ubicación</h2>
              <p>
                <MapPin size={16} />{" "}
                {p.show_address && p.address ? `${p.address}, ` : ""}
                {[p.neighborhood, p.city, p.province]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              {!p.show_address && (
                <small>
                  Ubicación aproximada. Consultá al agente para conocer más.
                </small>
              )}
            </section>
          </div>
          <aside className="property-contact-card">
            <span>
              {p.operation === "venta" ? "Valor de venta" : "Alquiler mensual"}
            </span>
            <h2>{price(p.price, p.currency)}</h2>
            <hr />
            <strong>
              {profile.first_name} {profile.last_name}
            </strong>
            <Professional profile={profile} />
            <Contact profile={profile} property={p} demo={demo || preview} />
            <small>
              La información fue proporcionada por el profesional. Consultá
              disponibilidad y condiciones.
            </small>
          </aside>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
export function CollectionView({
  data,
  demo = false,
}: {
  data: PublicCollection;
  demo?: boolean;
}) {
  useEffect(() => {
    if (!demo)
      track(
        data.profile.username,
        "collection",
        undefined,
        data.collection.token,
      );
  }, [data.profile.username, data.collection.token, demo]);
  const c = data;
  return (
    <>
      {demo && <DemoBanner />}
      <PublicHeader />
      <main className="container public-collection">
        <div className="collection-public-heading">
          <span className="eyebrow">UNA SELECCIÓN ESPECIAL PARA VOS</span>
          <h1>{c.collection.name}</h1>
          <p>{c.collection.description}</p>
          <small>
            Preparada por {c.profile.first_name} {c.profile.last_name} ·{" "}
            {new Date(c.collection.created_at).toLocaleDateString("es-AR", {
              timeZone: "America/Argentina/Buenos_Aires",
            })}
          </small>
        </div>
        <div className="notice">
          Colección no listada. Cualquier persona con este enlace puede acceder
          y compartirlo.
        </div>
        {c.properties.length ? (
          <div className="card-grid">
            {c.properties.map((p) => (
              <PropertyCard
                key={p.id}
                property={p}
                username={c.profile.username}
                demo={demo}
              />
            ))}
          </div>
        ) : (
          <Empty
            title="Esta selección no tiene propiedades disponibles"
            description="Consultá al agente para conocer otras opciones."
          />
        )}
        <section className="public-contact">
          <div>
            <h2>¿Encontraste un lugar que te gusta?</h2>
            <Professional profile={c.profile} />
          </div>
          <Contact profile={c.profile} demo={demo} />
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
async function share(url: string) {
  try {
    if (navigator.share) await navigator.share({ title: document.title, url });
    else {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado.");
    }
  } catch (e) {
    if (!(e instanceof DOMException && e.name === "AbortError"))
      toast.error("No se pudo compartir el enlace.");
  }
}
export function NotFound() {
  return (
    <div className="not-found">
      <Logo />
      <Empty
        title="Este lugar todavía no está disponible"
        description="El enlace puede haber cambiado o el portfolio no está publicado."
        action={
          <Link className="btn" href="/">
            Volver al inicio
          </Link>
        }
      />
    </div>
  );
}
