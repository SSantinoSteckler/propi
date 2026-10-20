"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Globe,
  Link2,
  Menu,
  MessageCircle,
  MousePointerClick,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  Layers,
  ChartNoAxesCombined,
} from "lucide-react";
import { Logo } from "../components/ui";
import { ThemeToggle } from "../features/theme/ThemeProvider";
import { HeroBackground } from "../components/HeroBackground";
import { PropertyCard } from "../components/PropertyCard";
import { demoProperties, demoPortfolio, photo, photos } from "../lib/demo";
import billingCatalog from "../lib/billing/catalog.json";
const faqs = [
  [
    "¿Necesito saber de tecnología?",
    "Para nada. Completás tu perfil, cargás las fotos y los datos de tus propiedades y compartís tu link. Podés guardar el progreso y seguir después.",
  ],
  [
    "¿Puedo empezar gratis?",
    "Sí. El plan Free incluye un portfolio, hasta 5 propiedades publicadas, reseñas y una colección activa. No necesitás una tarjeta.",
  ],
  [
    "¿Puedo compartir propiedades con un cliente?",
    "Sí. Creá una colección con las propiedades que le interesan y compartí un único enlace. El enlace es no listado: cualquier persona que lo tenga puede abrirlo.",
  ],
  [
    "¿Qué pasa con mi matrícula profesional?",
    "Podés mostrar tu matrícula, colegio y jurisdicción, o los datos del corredor responsable. El profesional debe completar los requisitos aplicables a su actividad.",
  ],
  [
    "¿Las reseñas son de clientes reales?",
    "Los clientes envían su experiencia mediante invitaciones de un solo uso y dan consentimiento para su publicación. Las reseñas sin validación de la relación comercial se identifican como no verificadas.",
  ],
];
export default function Landing() {
  const [menu, setMenu] = useState(false);
  return (
    <>
      <header className="landing-header">
        <div className="container nav">
          <Logo />
          <nav className={menu ? "nav-links open" : "nav-links"}>
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#herramientas">El producto</a>
            <a href="#planes">Planes</a>
          </nav>
          <div className="nav-actions">
            <ThemeToggle />
            <Link className="login-link" href="/login">
              Ingresar
            </Link>
            <Link className="btn btn-small" href="/registro">
              Empezar gratis <ArrowUpRight size={15} />
            </Link>
            <button
              className="icon-btn mobile-menu"
              aria-label="Abrir menú"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
          </div>
        </div>
      </header>
      <main>
        <div className="hero-stage">
        <HeroBackground />
        <section className="hero container">
          <div className="hero-copy">
            <div className="pill">
              <span className="live-dot" />
              Tu nombre en la puerta. Tu catálogo adentro.
            </div>
            <h1>
              Todas tus
              <br />
              propiedades.
              <br />
              <span>Un solo link.</span>
            </h1>
            <p>
              El departamento con ese balcón. La casa con patio. Reuní lo que
              tenés para ofrecer en un portfolio con tu nombre, listo para
              mandar por WhatsApp.
            </p>
            <div className="hero-actions">
              <Link className="btn" href="/registro">
                Crear mi portfolio gratis <ArrowRight size={17} />
              </Link>
              <Link className="text-link" href="/ejemplo">
                Ver un ejemplo <ArrowUpRight size={17} />
              </Link>
            </div>
            <div className="hero-checks">
              <span>
                <Check />
                Sin tarjeta de crédito
              </span>
              <span>
                <Check />
                Simple desde el primer día
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <span className="portfolio-label" aria-hidden="true">Casa abierta, versión digital.</span>
            <div className="preview-browser">
              <div className="browser-bar">
                <div className="browser-dots">
                  <i />
                  <i />
                  <i />
                </div>
                <div>
                  <Globe size={10} />
                  propi.com / martina-gonzalez
                </div>
                <ArrowUpRight size={12} />
              </div>
              <div className="preview-cover">
                <img
                  src={photo(photos[4], 1000)}
                  alt="Casa de ejemplo con jardín"
                />
                <span>UN LUGAR PARA CADA HISTORIA</span>
              </div>
              <div className="preview-profile">
                <img
                  className="avatar"
                  src={demoPortfolio.avatar_url}
                  alt="Retrato ilustrativo del perfil de ejemplo"
                />
                <div>
                  <h3>
                    Martina González
                  </h3>
                  <p>Agente inmobiliaria · Buenos Aires</p>
                </div>
                <span className="preview-contact">
                  <MessageCircle size={14} /> Contactar
                </span>
              </div>
              <p className="preview-bio">
                Te acompaño a encontrar tu próximo lugar.
              </p>
              <div className="preview-list-head">
                <strong>Encontrá tu próximo espacio</strong>
                <span>
                  Ver todas <ArrowRight size={12} />
                </span>
              </div>
              <div className="preview-cards">
                {demoProperties.slice(0, 2).map((p) => (
                  <PropertyCard
                    key={p.id}
                    property={p}
                    username="ejemplo"
                    demo
                  />
                ))}
              </div>
              <div className="preview-disclaimer">
                Portfolio y propiedades de demostración
              </div>
            </div>
            <div className="float-link">
              <span>
                <Link2 size={20} />
              </span>
              <div>
                <strong>Tu portfolio, siempre a mano</strong>
                <small>Un link. Todas tus oportunidades.</small>
              </div>
              <Check size={18} />
            </div>
            <div className="visual-caption">
              <span>Así podría verse el tuyo.</span>{" "}
              <svg width="54" height="30" viewBox="0 0 54 30">
                <path
                  d="M2 24Q38 36 46 5m-9 4 10-6 4 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
          </div>
        </section>
        </div>
        <section className="value-strip">
          <div className="container">
            <span>
              Pensado para agentes independientes.
              <br />
              <strong>Con nombre, criterio y trato propio.</strong>
            </span>
            <div>
              <Globe />
              Tu espacio profesional
            </div>
            <div>
              <Layers />
              Tus propiedades organizadas
            </div>
            <div>
              <MessageCircle />
              Más cerca de tus clientes
            </div>
          </div>
        </section>
        <section id="como-funciona" className="section container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">MENOS VUELTAS. MÁS OPORTUNIDADES.</span>
              <h2>
                De tus propiedades al mundo.
                <br />
                Así de simple.
              </h2>
            </div>
            <p>
              Dejá de mandar las mismas diez fotos.
              <br />
              Mandá el link y seguí la conversación.
            </p>
          </div>
          <div className="steps">
            {[
              {
                icon: Plus,
                title: "Creá tu perfil",
                text: "Tu foto, tu historia y tus datos profesionales. Que te conozcan antes del primer mensaje.",
              },
              {
                icon: Layers,
                title: "Sumá tus propiedades",
                text: "Cargá fotos, precios y detalles. Un catálogo ordenado que trabaja con vos.",
              },
              {
                icon: ArrowUpRight,
                title: "Compartí tu link",
                text: "En tu bio, por WhatsApp o donde quieras. Todo lo que ofrecés, en un solo lugar.",
              },
            ].map((s, i) => (
              <div className="step" key={s.title}>
                <div className="step-top">
                  <span className="feature-icon">
                    <s.icon size={23} />
                  </span>
                  <span>0{i + 1}</span>
                </div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </section>
        <section id="herramientas" className="features-section">
          <div className="container">
            <div className="center-heading">
              <span className="eyebrow">TU TRABAJO, MEJOR PRESENTADO</span>
              <h2>
                Menos archivos sueltos.
                <br />
                Más conversaciones.
              </h2>
              <p>
                Del “¿tenés algo por esta zona?” a una selección lista para
                compartir.
              </p>
            </div>
            <div className="feature-grid">
              <div className="feature-large">
                <div className="feature-text">
                  <span className="feature-icon">
                    <Layers />
                  </span>
                  <h3>
                    Una selección especial.
                    <br />
                    Para cada cliente.
                  </h3>
                  <p>
                    Elegí las propiedades que le pueden interesar y compartí una
                    colección con su propio enlace.
                  </p>
                  <Link className="text-link" href="/ejemplo-coleccion">
                    Explorar una colección <ArrowUpRight size={16} />
                  </Link>
                </div>
                <div className="collection-preview">
                  <span className="eyebrow">UNA SELECCIÓN PARA VOS</span>
                  <h4>Tu próximo lugar en la ciudad</h4>
                  <p>2 propiedades · Colección de ejemplo</p>
                  <div>
                    {demoProperties.slice(0, 2).map((p) => (
                      <img
                        key={p.id}
                        src={p.images[0].url}
                        loading="lazy"
                        alt={p.images[0].alt}
                      />
                    ))}
                  </div>
                  <span className="fake-url">
                    <Link2 size={13} />
                    propi.com/c/tu-seleccion <ArrowUpRight size={13} />
                  </span>
                </div>
              </div>
              <div className="feature-small">
                <ChartNoAxesCombined size={27} />
                <h3>Entendé qué genera interés.</h3>
                <p>
                  Visitas, propiedades más vistas y clics a WhatsApp. Métricas
                  aproximadas para decidir con información.
                </p>
                <div
                  className="mini-chart"
                  aria-label="Gráfico ilustrativo sin métricas comerciales"
                >
                  {[28, 46, 38, 67, 51, 81, 64, 92, 74, 100, 82, 116].map(
                    (v, i) => (
                      <i key={i} style={{ height: v }} />
                    ),
                  )}
                </div>
                <small>Visualización ilustrativa</small>
              </div>
              <div className="feature-small review-feature">
                <Star size={26} />
                <h3>
                  La confianza también
                  <br />
                  tiene su espacio.
                </h3>
                <p>
                  Invitá a tus clientes a contar su experiencia, respondé sus
                  reseñas y construí tu reputación con transparencia.
                </p>
                <div className="trust-note">
                  <ShieldCheck size={22} />
                  <span>
                    Reseñas con consentimiento.
                    <br />
                    Verificación claramente identificada.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="section container property-showcase">
          <div className="section-heading">
            <div>
              <span className="eyebrow">UN CATÁLOGO A TU ALTURA</span>
              <h2>
                Ese balcón merece
                <br />
                una buena primera impresión.
              </h2>
            </div>
            <div>
              <p>
                Fotos grandes. Información clara.
                <br />
                Una experiencia que invita a descubrir.
              </p>
              <Link className="text-link" href="/ejemplo">
                Ver portfolio de ejemplo <ArrowUpRight size={16} />
              </Link>
            </div>
          </div>
          <div className="card-grid">
            {demoProperties.slice(0, 3).map((p) => (
              <PropertyCard key={p.id} property={p} username="ejemplo" demo />
            ))}
          </div>
          <p className="demo-caption">
            Propiedades ficticias · Fotografías ilustrativas · Sin oferta
            comercial
          </p>
        </section>
        <section id="planes" className="plans-section">
          <div className="container">
            <div className="center-heading">
              <span className="eyebrow">EMPEZÁ SIMPLE. CRECÉ A TU RITMO.</span>
              <h2>Tu próximo paso es gratis.</h2>
              <p>
                Todo lo esencial para empezar. Más posibilidades cuando las
                necesites.
              </p>
            </div>
            <div className="plans">
              <div className="plan">
                <span className="eyebrow">FREE</span>
                <h3>Un gran comienzo.</h3>
                <div className="plan-price">
                  $0 <span>/ para empezar</span>
                </div>
                <p>Tu presencia profesional, sin costo.</p>
                <Link className="btn btn-outline" href="/registro">
                  Crear mi portfolio <ArrowRight size={16} />
                </Link>
                <ul>
                  {[
                    "Tu portfolio con enlace propio",
                    "Hasta 5 propiedades publicadas",
                    "Una colección activa",
                    "Contacto por WhatsApp",
                    "Reseñas de clientes",
                    "Estadísticas básicas",
                  ].map((t) => (
                    <li key={t}>
                      <Check size={16} />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="plan plan-pro">
                <span className="plan-tag">
                  <Sparkles size={13} /> TU PRÓXIMO NIVEL
                </span>
                <span className="eyebrow">PRO</span>
                <h3>Espacio para crecer.</h3>
                <div className="plan-price pro-price">{new Intl.NumberFormat("es-AR", { style: "currency", currency: billingCatalog.currency, maximumFractionDigits: 0 }).format(billingCatalog.amount)} <span>/ mes</span></div>
                <p>Más libertad para tu negocio.</p>
                <Link className="btn" href="/dashboard/billing">
                  Conocer Premium <ArrowRight size={16} />
                </Link>
                <ul>
                  {[
                    "Todo lo incluido en Free",
                    "Más propiedades (hasta 1.000)",
                    "Más colecciones (hasta 1.000)",
                    "Personalización de colores y portada",
                  ].map((t) => (
                    <li key={t}>
                      <Check size={16} />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="demo-caption">
              Renovación mensual automática con Mercado Pago, cuando la contratación esté habilitada. Podés cancelar los próximos cobros desde tu cuenta.
            </p>
          </div>
        </section>
        <section className="section container faq-section">
          <div>
            <span className="eyebrow">POR SI TE LO ESTABAS PREGUNTANDO</span>
            <h2>Todo más claro.</h2>
            <p>
              Unas respuestas antes
              <br />
              de dar el primer paso.
            </p>
          </div>
          <div className="faq-list">
            {faqs.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <Plus size={17} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="container">
          <div className="final-cta">
            <div>
              <span className="eyebrow">TU TRABAJO MERECE SER VISTO</span>
              <h2>
                El próximo link que compartas
                <br />
                puede abrir una nueva puerta.
              </h2>
            </div>
            <Link className="btn btn-light" href="/registro">
              Crear mi portfolio gratis <ArrowUpRight size={18} />
            </Link>
          </div>
        </section>
      </main>
      <footer className="container footer">
        <div>
          <Logo />
          <p>Tu lugar en el mundo inmobiliario.</p>
        </div>
        <div>
          <Link href="/privacidad">Privacidad</Link>
          <Link href="/terminos">Términos</Link>
          <a href="#planes">Planes</a>
          <span>© {new Date().getFullYear()} Propi</span>
        </div>
      </footer>
    </>
  );
}
