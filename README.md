# Propi

MVP de portfolios inmobiliarios para Argentina. Next.js App Router + React 19 + TypeScript + Tailwind, Supabase Auth/PostgreSQL/Storage, React Hook Form, Zod, TanStack Query y Lucide. Frontend y funciones HTTP preparados para Vercel. Facturación mensual con Mercado Pago implementada; activación y validación externa pendientes.

## Mercado Pago

La configuración completa, nueva migración, comando administrativo idempotente, políticas de acceso, webhooks y preparación de Vercel están en [docs/MERCADOPAGO.md](docs/MERCADOPAGO.md). No se ejecutan creaciones de planes o cobros durante instalación, build o pruebas.

Para actualizar una base existente, seguir [la transición Expand and Contract](docs/MERCADOPAGO-TRANSICION.md): la RPC anterior se conserva durante Expand, el flujo ficticio usa tablas separadas y Contract queda pospuesto fuera de las migraciones automáticas. Verificar primero el SHA activo de Production y el diagnóstico SQL; no aplicar cambios remotos sin autorización.

## Estado y alcance

El repositorio inicial estaba vacío. Se implementaron las cinco fases en código: landing, autenticación, onboarding con progreso, panel, propiedades e imágenes, portfolios, fichas, colecciones, reseñas, analítica, límites de planes, HTML público para SEO y pruebas.

**El despliegue y la conexión al proyecto de destino requieren configuración del operador.** La migración a Next.js conserva la base, los módulos y las políticas RLS. Las verificaciones y sus límites se detallan más abajo. No hay credenciales reales en el repositorio.

### Decisión de arquitectura

La aplicación utiliza Next.js App Router con rutas por archivos, Server Components para consultar los recursos públicos y Client Components para filtros, formularios, sesión y panel. Las rutas y endpoints están en `src/app`. La base de datos y las políticas RLS se administran mediante las migraciones de Supabase.

Hay dos paletas: clara (marfil, arena y acentos bosque) y oscura (grafito, gris pizarra y acentos esmeralda, sin beige). El botón de sol/luna cambia toda la interfaz y las notificaciones. La preferencia se guarda en una cookie de apariencia `propi-theme`, sin datos personales, y Next la aplica en el HTML inicial para evitar destellos al recargar. Sin preferencia se utiliza la paleta clara. Los colores semánticos están centralizados en `src/styles.css`; el acento personalizado del agente se adapta a ambas paletas. El E2E de apariencia verifica cambio, navegación, recarga, respuesta SSR y teclado.

El manifest exige Next.js **16.4.1 o posterior compatible**, con React 19.3. El lockfile fija la instalación actual. Desarrollo, compilación y producción usan Next.js. Playwright ejecuta las pruebas unitarias y de Route Handlers en Node sin navegador, y los E2E en Chromium.

Las páginas `/ejemplo`, `/ejemplo/propiedad/:slug` y `/ejemplo-coleccion` son demostraciones explícitas e independientes de Supabase. La aplicación privada no simula una base de datos cuando falta configuración. Las demostraciones no habilitan contacto con números ficticios.

## Video de portada

La primera sección de la landing incluye video decorativo sin sonido, en loop, con superposición adaptada a ambas paletas y botón para pausarlo. Se pausa al salir de pantalla o cambiar de pestaña. En celulares, con ahorro de datos o movimiento reducido se utiliza una portada estática sin cargar el MP4. Si falla la imagen o el video se conserva el fondo y los enlaces.

Fuente: [Modern House Interior — Abdullah | 4K, Pexels](https://www.pexels.com/video/modern-house-interior-5744424/), bajo [licencia Pexels](https://www.pexels.com/license/). Es material ilustrativo, no una propiedad anunciada. La fuente, autor y licencia están en `src/lib/hero-media.json`.

**La descarga binaria está bloqueada en el entorno de desarrollo del agente (EACCES).** Por eso el archivo aún no está guardado en `public`: se utiliza la URL original del CDN. Esa fuente es UHD y su reproducción real no pudo verificarse desde este entorno. La portada y la interfaz se probaron sin acceso al CDN; no se presenta ese fallback como una prueba de reproducción.

Build y 16 E2E de interfaz aprobados (dos casos con Supabase real siguen omitidos). También se comprobó manualmente que el reproductor silencia, pausa y reanuda usando un pequeño WebM generado exclusivamente para la prueba; ese archivo no se utiliza como contenido de la aplicación.

Para guardar los archivos en el proyecto desde una conexión habilitada:

```powershell
npm.cmd run media:download
```

El comando intenta descargar HD, valida tipo y tamaño (hasta 12 MB de video y 2 MB de portada), guarda en `public/media/` y actualiza el manifiesto para servirlos localmente. No modifica el manifiesto si la descarga falla. Antes del despliegue, comprobar el peso del resultado y su reproducción; si se conserva UHD, convertir a H.264/720p sin audio antes de publicarlo. No necesita nuevas variables de entorno.

## Requisitos e instalación

Node.js 22.12 o posterior y npm. Para Supabase local, Docker Desktop con el motor iniciado. En PowerShell con scripts bloqueados, usar `npm.cmd` y `npx.cmd`.

```powershell
npm.cmd install
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm.cmd run db:start
npx.cmd supabase status
npm.cmd run db:reset
```

Copiar la URL, la clave pública y la clave secreta locales mostradas por `supabase status` a `.env.local`. También se aceptan las claves legacy anon y service_role en los campos público y secreto, respectivamente:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-o-anon-local>
SUPABASE_SECRET_KEY=<secret-o-service-role-local>
```

```powershell
npm.cmd run dev
```

Abrir `http://localhost:3100`. Next ejecuta tanto la interfaz como `/api/events`, `/api/og`, `/robots.txt` y `/sitemap.xml`. La URL y la clave pública habilitan Auth y las consultas con RLS; la clave secreta se utiliza únicamente en el servidor para analítica y facturación. No se necesita contraseña de PostgreSQL ni conexión directa a la base: la aplicación usa la API de Supabase. La dirección local sigue siendo localhost:3100. `NEXT_PUBLIC_SITE_URL` permite definir el origen HTTPS público para producción y pruebas de pagos.

Para producción local:

```powershell
npm.cmd run build
npm.cmd start
```

Para un proyecto Supabase remoto:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref <project-ref>
npx.cmd supabase db push
```

`db reset` es exclusivamente para desarrollo local: recrea la base y carga ejemplos. No ejecutar el seed en producción. No ejecutar reseteos sobre una base con datos útiles.

Se incluye `package-lock.json`. Para una instalación limpia usar `npm ci`. Ejecutar `npm audit` y revisar cambios de dependencias antes del lanzamiento.

## Autenticación

En Supabase Auth habilitar email/contraseña, definir Site URL y agregar las URLs exactas de redirección:

- `https://tu-dominio.com/onboarding`
- `https://tu-dominio.com/actualizar-clave`

En local la confirmación de email está desactivada para facilitar pruebas. En producción activarla y configurar SMTP. Con confirmación habilitada, el registro informa que se debe revisar el email; con sesión disponible, inicia onboarding. La recuperación da un mensaje genérico y no informa si existe una cuenta. El cambio de contraseña usa la sesión de recuperación de Supabase. Supabase administra los límites del servicio Auth: ajustar sus rate limits, políticas de contraseña y CAPTCHA según el tráfico; no están aprovisionados remotamente desde este repositorio.

## Acceso con Google

Ingreso y registro incluyen **Continuar con Google**, mediante Supabase Auth. La sesión se conserva con el mismo cliente del acceso por email. `/login/callback` espera la sesión y consulta el perfil con RLS: si tiene usuario y terminó el paso 3, abre el dashboard; en caso contrario retoma el onboarding. El trigger de registro existente crea perfil y plan Free también para usuarios de Google. No hay una migración adicional.

Para habilitarlo con tu proyecto Supabase:

1. En Google Cloud / Google Auth Platform configurar la pantalla de consentimiento y crear un cliente OAuth de tipo **Aplicación web**. Si está en modo de prueba, agregar las cuentas de prueba permitidas.
2. Agregar `http://localhost:3100` como origen JavaScript autorizado. En **URIs de redirección autorizados**, copiar exactamente el callback que muestra Supabase en su proveedor Google (normalmente `https://<project-ref>.supabase.co/auth/v1/callback`). Ese callback es distinto de la ruta de Next.
3. En Supabase → Authentication → Sign In / Providers → Google, habilitar Google y guardar el **Client ID** y **Client Secret** obtenidos. Esas credenciales se guardan en Supabase, no en `.env.local` de Next.
4. En Authentication → URL Configuration, usar Site URL `http://localhost:3100` y agregar `http://localhost:3100/login/callback` a Redirect URLs, junto con las rutas de onboarding y recuperación existentes.
5. En producción agregar el dominio real y su `/login/callback`, y actualizar `SITE_URL` en `src/lib/config.ts`.

Se solicitan únicamente los permisos básicos de identidad que usa Supabase. No se solicitan permisos de Gmail o Drive ni acceso offline. El flujo actual usa sesión en el navegador, sin cookies de autenticación SSR; Supabase procesa el retorno OAuth y el callback limpia su URL. No se importan automáticamente foto ni datos profesionales del proveedor.

El archivo `supabase/config.toml` permite el retorno de Next para desarrollo local. Si también ejecutás **Supabase en Docker**, su proveedor Google debe habilitarse aparte en la configuración de Auth local con credenciales propias y el callback local que corresponda; la configuración del Dashboard solo afecta al proyecto alojado.

Las pruebas automatizadas cubren la solicitud de OAuth, el destino según el perfil, la presencia del botón y el retorno cancelado. Pasaron las 15 pruebas unitarias, los cuatro casos de interfaz de Google en escritorio/móvil y el build de Next con verificación de tipos. **El consentimiento y el ingreso real con Google quedan pendientes hasta configurar el proveedor y probar con una cuenta autorizada.** Referencia: [Google con Supabase Auth](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Flujo principal

1. `/` → `/registro`.
2. `/onboarding`: guardar datos personales, profesionales y nombre de usuario. Cada paso persiste en PostgreSQL; se puede salir y continuar. La carga de foto guarda inmediatamente.
3. Crear una propiedad; guardar borrador para habilitar fotos. Completar información y elegir `Disponible` para publicarla.
4. `/dashboard/portfolio`: revisar y publicar el perfil. La base valida datos mínimos y matrícula/jurisdicción para las modalidades correspondientes.
5. Copiar `/:username` y compartir.
6. `/dashboard/colecciones`: seleccionar propiedades, ordenar y copiar enlace no listado.

El orden de fotos se cambia con controles de teclado accesibles. La primera es la principal. Los duplicados de propiedades se crean como borradores y no duplican archivos. Archivar oculta la propiedad; restaurarla vuelve a aplicar el límite de publicación.

## Estructura

```text
src/
  app/
    layout.tsx, providers.tsx       layout raíz y estado del cliente
    page.tsx                       landing renderizada por Next
    (auth)/                        registro, acceso y recuperación
    onboarding/, dashboard/        configuración y panel privado
    [username]/                    portfolio público SSR
    [username]/propiedad/[slug]/    ficha SSR
    c/[token]/, r/[token]/          colecciones y solicitudes de reseña
    ejemplo/, ejemplo-coleccion/    demostraciones explícitas
    api/events/, api/og/            Route Handlers de servidor
    sitemap.ts, robots.ts          metadatos por convenciones de Next
  screens/                         vistas reutilizables
  components/                      UI, navegación, tarjetas y JSON-LD
  features/                        auth, perfil, propiedades, colecciones, reseñas y métricas
  lib/public-data.ts               consultas públicas exclusivas del servidor
  lib/seo.ts                       metadatos nativos y serialización segura
  services/                        operaciones del panel con Supabase/RLS
  proxy.ts                         CSP con nonce y cabeceras de privacidad
supabase/                          migraciones, seed y pruebas pgTAP
tests/                             unitarias, Route Handlers y flujos de navegador
scripts/test-database.mjs           pruebas PostgreSQL/RLS en PGlite
```

## Datos, RLS y permisos

`profiles.id` corresponde a `auth.users.id`. Un trigger crea perfil, configuración y suscripción Free al registrarse. No se confía en metadata de registro para planes o permisos. PostgreSQL asigna `owner_id` desde `auth.uid()`, aplica RLS y usa claves foráneas compuestas para impedir vínculos entre propietarios.

Las tablas privadas no tienen SELECT anónimo. Las RPC `get_portfolio` y `get_collection` proyectan únicamente campos públicos. No devuelven email de acceso, eventos, solicitudes de reseña, configuración, notas de verificación ni UUID del usuario. La dirección exacta se reemplaza por `null` cuando está oculta. Borradores, pausadas, archivadas y perfiles despublicados quedan fuera. Las vendidas/alquiladas se incluyen solo si el perfil lo permite, también en colecciones y sitemap.

Todas las funciones con privilegios elevados usan `search_path` fijo, nombres calificados, revocación de EXECUTE general y concesión por rol. Las funciones de escritura de usuarios comprueban sesión y pertenencia. No hay service role key en el navegador.

Referencia de diseño: [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [funciones y privilegios](https://supabase.com/docs/guides/database/functions), [Storage y RLS](https://supabase.com/docs/guides/storage/security/access-control).

### Imágenes

El editor del portfolio y el avatar del header comparten la consulta de imagen por usuario y ruta de Storage. Guardar el perfil actualiza inmediatamente la caché, también al subir una foto; las URLs firmadas se renuevan antes de vencer. Si no hay foto o no se puede cargar, el header muestra las iniciales. El E2E de producto incluye la regresión de subir una imagen y verla en ambos lugares sin recargar; requiere Supabase local y `RUN_SUPABASE_E2E=1`.

Bucket `media` privado con 8 MB máximos y tipos JPEG/PNG/WebP. El cliente decodifica las imágenes, reduce a 1800 px y convierte a WebP. Las políticas restringen escrituras al prefijo UUID del propietario. El acceso anónimo solo se habilita para imágenes referenciadas por un perfil o propiedad públicamente visibles. Las URLs firmadas duran 10 minutos: una URL emitida puede continuar activa hasta expirar después de despublicar. No hay bucket público de borradores.

Los archivos no se duplican junto con una propiedad. Borrar fotos o propiedades elimina las filas y solicita borrar los objetos; ante errores de Storage puede quedar un objeto huérfano, que sigue siendo privado. Las eliminaciones directas por SQL o al borrar cuentas requieren purgar los objetos con un proceso de mantenimiento del operador. Antes de producción configurar barrido de archivos huérfanos y cuota total por cuenta; el MVP limita imágenes por propiedad, pero no ofrece una cuota agregada de almacenamiento. Evitar un crecimiento de borradores ilimitado sin una cuota operativa. Los UUID técnicos en rutas de archivos no son credenciales; el acceso depende de RLS.

### Free y Pro

`subscriptions` solo admite SELECT del propietario. No permite que un navegador inserte, elimine o actualice planes. Los triggers bloquean la fila de suscripción para serializar cargas concurrentes y aplican:

- Free: cinco propiedades publicadas (disponibles, reservadas, vendidas o alquiladas sin archivar), una colección activa, color predeterminado y sin portada personalizada.
- Pro: sin límite de propiedades/colecciones; color y portada habilitados.

La facturación mensual de Premium está implementada en Next.js con la API oficial de Mercado Pago. Se habilita solo con configuración del servidor y cobro aprobado verificado. Estadísticas avanzadas y branding adicional continúan fuera del alcance. Ver [configuración, arquitectura, pruebas y pasos pendientes de Mercado Pago](docs/MERCADOPAGO.md). No se creó un plan ni se realizaron cobros desde este entorno. No existe un endpoint público de cambio arbitrario de plan.

## Reseñas y moderación

Las solicitudes usan 32 bytes aleatorios, expiran a los 30 días, se consumen atómicamente y admiten una reseña. Se permiten diez solicitudes por agente/hora. Hay validación de longitud, honeypot y consentimiento obligatorio. La unicidad de `request_id` impide reenvíos simultáneos. El token de 256 bits evita enumeración práctica; no se presenta como autenticación del cliente ni verificación comercial.

El agente solo puede actualizar `response`. No puede alterar rating, nombre, cuerpo, estado o verificación, ni eliminar reseñas. Los reportes se guardan sin ocultar automáticamente el contenido. La calificación negativa no es un motivo de retiro.

Proceso de operador pendiente de habilitar antes del lanzamiento:

1. Designar responsables y publicar un canal de soporte/moderación en los textos legales.
2. Revisar `review_reports` desde un entorno administrativo, contrastar contenido con las reglas y permitir apelación. Conservar registro de la decisión fuera de los datos públicos.
3. Para abuso demostrado, cambiar `reviews.status` a `moderated` desde SQL administrativo. No cambiar la puntuación original.
4. Para verificar una relación, pedir evidencia mínima a ambas partes por un canal seguro, revisarla de manera independiente y registrar una referencia/resumen en `verification_note`; después marcar `verified=true`. No guardar documentos sensibles en el bucket de imágenes ni hacerlos públicos. El agente no puede ejecutar este paso.
5. Tramitar solicitudes de retiro de consentimiento y supresión mediante el operador autenticado, respetando las obligaciones aplicables.

El repositorio no incluye un backoffice de moderadores, envío de invitaciones por email ni CAPTCHA externo. La invitación se copia y se comparte manualmente. Antes de exposición masiva, configurar límites de infraestructura y valorar CAPTCHA para formularios públicos. No hay testimonios reales precargados.

## Analítica

`/api/events` reutiliza la misma URL de Supabase. Para habilitar la analítica, se puede agregar opcionalmente esta clave **solo de servidor**; no hace falta para registrarse, cargar propiedades ni publicar el portfolio:

```dotenv
SUPABASE_SECRET_KEY=<server-only>
```

La función valida origen exacto y payload con Zod, descarta agentes de bots conocidos y calcula HMAC diario de IP + user agent utilizando la clave privada con un contexto exclusivo de analítica. No necesita un secreto adicional. No persiste la IP ni cookies de seguimiento. `record_event` es ejecutable solo por service_role y deduplica por tipo/recurso/origen/hora mediante clave única. Retiene eventos hasta 365 días y claves durante dos horas; la limpieza se ejecuta durante siguientes escrituras. No garantiza detectar todo tráfico automatizado. Consultas del panel limitadas a 10.000 eventos recientes y claramente identificadas como aproximadas. Sin la clave privada opcional, la ingesta responde 503 y no inventa datos.

## SEO y Vercel

Los portfolios, fichas y colecciones reciben sus datos en Server Components y entregan su contenido visible en el HTML inicial. Las vistas interactivas se hidratan conservando ese HTML; no hay un reemplazo de un HTML armado a mano por otra aplicación SPA. Los filtros se mantienen en Client Components.

`generateMetadata` genera título, descripción, canonical, Open Graph y Twitter Cards a partir del recurso publicado. El layout establece metadataBase, idioma y viewport. Se utiliza la [API de metadatos de Next](https://nextjs.org/docs/app/api-reference/functions/generate-metadata). Los documentos JSON-LD usan una serialización que escapa los caracteres de apertura HTML y llevan nonce.

Las consultas públicas usan exclusivamente la clave pública y las RPC con campos autorizados. React.cache evita repetir una consulta entre metadata y página dentro de la misma petición. No se comparte una caché de portfolios entre peticiones: fetch usa no-store, el layout es dinámico y las imágenes de Storage tienen URLs temporales. Una URL firmada ya emitida puede durar hasta diez minutos después de despublicar.

El endpoint `/api/og` ofrece una URL estable para previews y devuelve solo imágenes de recursos públicos. La landing incluye una imagen PNG de 1200 × 630. Los perfiles usan ProfilePage/Person; las fichas, RealEstateListing, sin direcciones privadas en los datos estructurados.

Colecciones, panel, autenticación, invitaciones y demos usan noindex en los metadatos del servidor y cabeceras HTTP. Las colecciones nunca se incluyen en el sitemap. sitemap.ts y robots.ts usan las convenciones del App Router. Sin Supabase configurado, el sitemap incluye únicamente el inicio; no inventa perfiles.

`src/proxy.ts` genera un nonce por petición y lo comunica al renderizador de Next, para permitir sus scripts de hidratación sin habilitar scripts inline indiscriminados en producción. También establece protección contra framing, políticas de referer y permisos del navegador. No sustituye RLS ni autoriza acceso a datos privados. El panel recupera su sesión con Supabase Auth en el navegador; las consultas privadas se autorizan en PostgreSQL.

Para Vercel:

1. Importar el directorio como un proyecto **Next.js**. `vercel.json` declara ese framework.
2. Configurar las dos variables públicas de `.env.example` y cambiar `SITE_URL` en `src/lib/config.ts` al dominio de despliegue. La clave opcional de analítica es exclusiva del servidor.
3. Aplicar las migraciones, configurar Auth/SMTP/redirecciones y verificar los flujos contra Supabase real.
4. Ejecutar `npm install`, versionar el lockfile resultante, verificar `npm run typecheck`, `npm test`, `npm run test:db` y `npm run build` con la versión requerida de Next.
5. Desplegar y comprobar HTML inicial, metadatos, sitemap, robots, imágenes, CSP y noindex de colecciones. Los metadatos se bloquean para todos los user agents mediante htmlLimitedBots para entregar previews completas.

La CSP permite Supabase Cloud, el origen de Supabase configurado, Google Fonts e imágenes Unsplash ilustrativas. Ajustar los orígenes si se agregan servicios externos. No se usa material de franquicias inmobiliarias.

## Verificación

La configuración actual se verificó con Next 16.4.2: compilación de producción, tipos y 15 pruebas unitarias/Route Handlers ejecutadas por Playwright. Pasaron los 16 E2E públicos en escritorio/móvil; los dos E2E con Supabase real, incluida la subida de avatar, permanecen omitidos hasta habilitarlos expresamente. La última ejecución de PostgreSQL/RLS aprobó 18 pruebas; estas tablas no cambiaron con los ajustes visuales. Se revisaron landing, ejemplo y acceso entre 320 y 1440 px sin desbordes horizontales. Los E2E funcionales bloquean fuentes y fotografías externas para no depender de su disponibilidad. Las claves del env son URL, clave pública y clave secreta exclusiva del servidor. El servidor responde por `http://localhost:3100`.

Comprobaciones realizadas durante la migración, con Next 16.3.6 disponible en caché y React 19.3.0:

- Compilación de producción con Webpack y verificación de tipos del App Router: aprobadas.
- Pruebas unitarias y de Route Handlers: 12 aprobadas.
- Pruebas PostgreSQL/RLS en PGlite: 18 aprobadas.
- Navegación en Chrome headless de Windows con viewport de escritorio y móvil: 6 aprobadas, incluyendo contenido SSR visible sin JavaScript y redirección de rutas privadas.
- E2E con registro y Supabase real: 2 casos omitidos explícitamente por falta de credenciales.
- Respuestas HTTP de inicio, ejemplo, colección de ejemplo, robots y sitemap: 200; los ejemplos incluyen noindex.

Estas comprobaciones históricas no validan Supabase Auth/Storage HTTP ni un despliegue de Vercel. La instalación actual se describe en `package-lock.json`.

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:db
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

`test:db` ejecuta las migraciones y seed sobre PostgreSQL WASM real (PGlite), luego verifica creación de perfil, aislamiento, slugs, CRUD, límites, colección transaccional, publicación, privacidad, reseñas, permisos y límite de imágenes. Para esa prueba se emulan exclusivamente `auth.users`, `auth.uid()`, tablas de Storage y la función de bytes aleatorios: **no prueba Auth/Storage HTTP ni entropía criptográfica**, que en producción dependen de Supabase/pgcrypto.

Con Supabase local iniciado, ejecutar `npm run test:rls`: aplica pgTAP a permisos, RLS y aislamiento sobre la infraestructura real y datos de seed. Las pruebas PostgreSQL no reemplazan una prueba de concurrencia entre conexiones separadas.

E2E público prueba landing → ejemplo → ficha → colección y rutas protegidas. El flujo de producto registra una cuenta, guarda perfil, publica propiedad y portfolio, crea colección y abre su enlace. Se omite explícitamente salvo que se habilite `RUN_SUPABASE_E2E=1`; los ejemplos públicos siguen probándose. Para habilitarlo, usar una instancia local desechable con confirmación desactivada y configurar `.env.local` con sus claves. No apuntar el E2E a producción. Se crean usuarios de prueba y no se eliminan: restablecer la instancia local al terminar. La prueba móvil usa Chromium con viewport móvil; no acredita compatibilidad con Safari real.

Playwright usa el puerto 3100 y arranca su propio servidor por defecto. No reutiliza un servidor existente salvo que se configure `E2E_REUSE_SERVER=1` después de confirmar que corresponde a Propi. `E2E_USE_BUILD=1` selecciona el build de producción en lugar del servidor de desarrollo. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` permite usar un Chrome/Chromium instalado cuando no está disponible el navegador descargado por Playwright. Se usa Webpack tanto en desarrollo como en build para mantener el mismo flujo de compilación verificado.

## Pendiente antes de un lanzamiento comercial

- Verificación final del build y E2E en el entorno de despliegue.
- Ejecutar Supabase real, pgTAP, Auth/Storage HTTP y E2E con credenciales locales.
- Desplegar y probar funciones de Vercel, previews sociales y configuración de CSP.
- Definir identidad/contacto del operador, revisar textos legales, requisitos publicitarios y flujo de moderación con profesionales correspondientes.
- Configurar cuotas agregadas de archivos, purga de huérfanos, controles de abuso, SMTP, recuperación de datos y respaldos.
- No anunciar pagos como listos para producción hasta completar la configuración y las pruebas externas de [Mercado Pago](docs/MERCADOPAGO.md).

Estos pasos no están marcados como realizados. No hay una URL de producción publicada por este trabajo.
