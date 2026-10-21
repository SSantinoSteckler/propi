import Link from "next/link";
import { Logo } from "../components/ui";
import { ContactCard } from "../components/ContactCard";
export default function Legal({ privacy = false }: { privacy?: boolean }) {
  return (
    <main className="container legal-page">
      <Logo />
      <Link className="back-link" href="/">
        Volver al inicio
      </Link>
      <span className="eyebrow">
        INFORMACIÓN DE PROPI
      </span>
      <h1>
        {privacy ? "Privacidad y datos personales" : "Condiciones de uso"}
      </h1>
      <p>
        Última actualización: 21 de octubre de 2026.
      </p>
      {privacy ? (
        <>
          <h2>Qué datos se utilizan</h2>
          <p>
            Supabase gestiona email, credenciales y sesión. El perfil
            profesional, WhatsApp, enlaces, propiedades publicadas y reseñas
            consentidas son públicos. Los borradores, email de acceso, enlaces
            de solicitud, suscripción y eventos de analítica quedan restringidos
            a su propietario o a procesos del servidor autorizados.
          </p>
          <h2>Imágenes y publicación</h2>
          <p>
            Las imágenes se almacenan en un bucket privado. Las de recursos
            publicados pueden consultarse mediante enlaces temporales de hasta
            10 minutos. Despublicar impide emitir nuevos enlaces; los ya
            emitidos pueden seguir activos hasta su vencimiento. Las imágenes
            retiradas de una propiedad se eliminan del almacenamiento cuando la
            operación se completa.
          </p>
          <h2>Reseñas</h2>
          <p>
            Al enviar una reseña, autorizás la publicación del nombre que
            elegiste, tu testimonio, fecha y calificación. No publiques datos
            sensibles ni de terceros. Se conserva fecha de consentimiento. Una
            invitación de un solo uso no acredita por sí sola una relación
            comercial. Las verificaciones requieren revisión independiente y
            evidencia minimizada.
          </p>
          <h2>Analítica y conservación</h2>
          <p>
            No se usan cookies publicitarias. Las sesiones de acceso se
            conservan en el navegador. La función de analítica recibe
            temporalmente IP y agente de navegador para reducir bots y
            repeticiones; genera un resumen criptográfico diario y no conserva
            la IP. Los resúmenes de deduplicación se eliminan después de dos
            horas de actividad y los eventos al superar 365 días durante la
            siguiente escritura. La consulta del panel se limita a los 10.000
            eventos más recientes. No se comparten identificadores para
            publicidad.
          </p>
          <h2>Acceso, corrección y supresión</h2>
          <p>
            El profesional puede editar o despublicar su contenido. Las
            solicitudes de acceso, rectificación, retiro de consentimiento,
            supresión y revisión de reseñas se reciben por el email de contacto
            al final de esta página. Para proteger tu cuenta, podemos solicitar
            información que permita comprobar tu identidad antes de procesar el
            pedido. La eliminación debe considerar los archivos asociados y las
            obligaciones de conservación aplicables.
          </p>
          <h2>Facturación</h2>
          <p>Mercado Pago procesa la autorización y los pagos. Propi conserva
            identificadores de suscripción y cobros, importes, estados y fechas
            para gestionar el acceso. No recibe ni almacena datos de tarjeta.
            Para consultas sobre estos registros, podés escribirnos al email de
            contacto al final de esta página.</p>
          <h2>Proveedores</h2>
          <p>
            El servicio utiliza Supabase para autenticación, datos y archivos y
            Vercel para alojamiento. Podés consultar sobre el tratamiento de tu
            información a través del canal de contacto indicado en esta página.
          </p>
        </>
      ) : (
        <>
          <h2>Uso del servicio</h2>
          <p>
            Propi permite crear portfolios profesionales y compartir
            propiedades. Cada profesional es responsable por contar con
            autorización para publicar inmuebles, fotografías y datos, y por
            mostrar la identificación profesional exigible en su jurisdicción.
            La plataforma no acredita habilitación ni interviene en operaciones
            inmobiliarias.
          </p>
          <h2>Contenido auténtico</h2>
          <p>
            No se admite suplantación, publicidad engañosa, contenido abusivo ni
            reseñas fabricadas. Los ejemplos están identificados como ficticios
            y no constituyen ofertas. Las reseñas negativas no se eliminan por
            decisión unilateral del agente. Los reportes requieren revisión y
            resolución documentada del operador.
          </p>
          <h2>Enlaces y disponibilidad</h2>
          <p>
            Los portfolios publicados son públicos. Las colecciones no listadas
            pueden ser vistas y reenviadas por cualquiera con el enlace. No
            utilices una colección para almacenar datos privados de compradores.
          </p>
          <h2>Planes</h2>
          <p>
            Free permite un portfolio, cinco propiedades publicadas y una
            colección activa. Premium permite ampliar el catálogo y personalizar
            colores y portada, con un límite técnico de 1.000 propiedades y
            1.000 colecciones activas. Cuando la contratación esté habilitada,
            el precio mensual se muestra antes de autorizar los cobros recurrentes
            en Mercado Pago. Podés cancelar los próximos cobros desde Facturación.
            El acceso ya abonado se conserva hasta su vencimiento, salvo reintegros
            o contracargos, y no se eliminan tus propiedades al volver a Free.
          </p>
          <h2>Contacto y moderación</h2>
          <p>
            Podés enviarnos consultas, reportes de contenido o pedidos de
            revisión al email de contacto al final de esta página. Los reportes
            se revisan de forma manual; no eliminan automáticamente una reseña
            ni modifican su calificación.
          </p>
        </>
      )}
      <ContactCard />
    </main>
  );
}
