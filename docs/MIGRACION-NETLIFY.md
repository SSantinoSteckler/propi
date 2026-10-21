# Propi: migración preparada de Vercel a Netlify Free

Auditoría: 21/10/2026. Estado: cambios locales, sin publicación ni cambios remotos.
Supabase y Mercado Pago siguen siendo los servicios existentes. No ejecutar SQL,
Expand, Contract, `billing:plan --create`, nuevas suscripciones ni pagos para migrar.

## A. Decisión técnica y cambios necesarios

El proyecto instalado usa Next.js 16.4.2, React 19.3 y App Router. Netlify documenta
soporte para las versiones estables actuales mediante su adaptador automático
OpenNext. No se instala ni fija un plugin manual, ni se convierte el proyecto en
una exportación estática. El primer Preview debe confirmar la versión del
adaptador instalada y su compatibilidad efectiva con este lockfile.

| Área | Auditoría / preparación |
| --- | --- |
| SSR, RSC y metadatos | Se conserva `.next`; portfolios, propiedades y previews sociales mantienen renderizado del servidor. |
| Server Actions | El adaptador las soporta; el proyecto no depende actualmente de acciones `use server`. |
| API Route Handlers | Siguen en Next, Node.js; no hay Express ni otro backend. |
| Proxy/middleware | CSP con nonce, cabeceras y noindex; se reemplazó Buffer por btoa para evitar dependencia de Node en el proxy. Validar CSP en el Preview, porque Netlify aplica un orden propio a middleware y redirecciones. |
| Cookies y sesiones | La cookie de tema se conserva; Supabase Auth utiliza su SDK y tokens existentes. La sesión del navegador pertenece al origen: hay que iniciar sesión en el dominio nuevo, sin crear otra cuenta. |
| Autorización administrativa | Mismo transporte seguro de Supabase para `sb_secret_`; la clave privada no se agrega al cliente ni como Bearer JWT. |
| Imágenes | Mismo Storage de Supabase, URLs firmadas y reglas existentes; no se copian archivos. Comprobar galería y avatares en Netlify. |
| Analítica | Reconoce la cabecera de IP de Netlify; Preview no escribe eventos. |
| Facturación | Preview bloqueada, credenciales privadas ausentes; modo ficticio continúa limitado a local. Mismo vendedor real, plan, referencias e idempotencia. |
| Cron | Selector explícito de proveedor, apagado por defecto en Netlify. Programación diaria a las 06:00 UTC. |
| Vercel | Se conserva `vercel.json` para convivencia y reversión. Sus reglas no configuran Netlify. |

### Plan y URL de retorno, sin recrear recursos

El plan real existente se valida contra su retorno original. En Netlify Production:

```text
MERCADOPAGO_CATALOG_SITE_URL=https://propi-psi.vercel.app
NEXT_PUBLIC_SITE_URL=https://<nombre-del-sitio>.netlify.app
```

La primera variable solo fija el origen original del catálogo. No modifica Mercado
Pago. El checkout actual crea acuerdos pendientes sin token de tarjeta y envía su
propio `back_url` al dominio de `NEXT_PUBLIC_SITE_URL`. No reutiliza como checkout
la URL del plan. Se siguen validando vendedor, ARS 14.900, frecuencia, estado y plan.
Si no se configura la variable nueva, Vercel mantiene el comportamiento anterior.

Las suscripciones existentes, incluso acuerdos históricos con otro importe,
conservan su precio y cobertura registrados. No se cambian a ARS 14.900 por migrar.

### Cron sin duplicar trabajos

Se mantiene `/api/billing/reconcile` con autenticación `CRON_SECRET`, bloqueos e
idempotencia existentes. `BILLING_CRON_PROVIDER` admite `vercel`, `netlify` u `off`.
Sin variable, Vercel conserva su comportamiento y Netlify queda apagado.

Una Scheduled Function de Netlify tiene límite de 30 segundos. Por eso la tarea
diaria solo despacha a una Background Function autenticada, que llama al endpoint
existente. No se duplica la lógica de facturación. La llamada HTTP sigue limitada
por la función síncrona de Next: presupuesto del proveedor 45 s, espera del worker
55 s y límite documentado de funciones síncronas 60 s. El worker no transforma
ese endpoint en una operación ilimitada.

Solo se ejecuta con contexto Production, despliegue publicado y selector
`netlify`. Requiere origen canónico idéntico a la variable reservada `URL`, secreto
de al menos 32 caracteres y no sigue redirecciones. Un 202 significa **despachado**;
el éxito real es `BILLING_CRON_COMPLETED`, con `failed: 0`, en el worker.

El selector no es un bloqueo distribuido entre hosts. La ausencia de solapamiento
depende del traspaso ordenado: apagar Vercel y comprobarlo antes de habilitar
Netlify. Los bloqueos de base e idempotencia son protección adicional.

## B. Archivos de esta preparación

Nuevos:

```text
netlify.toml
netlify/functions/billing-reconcile.mjs
netlify/functions/billing-reconcile-background.mjs
netlify/lib/billing-cron.mjs
scripts/build-netlify.mjs
src/lib/deployment.ts
tests/netlify-migration.test.ts
docs/MIGRACION-NETLIFY.md
```

Modificados para la migración:

```text
.gitignore
next.config.ts
package.json
scripts/test-billing-compatibility.mjs
scripts/test-database.mjs
src/app/api/billing/reconcile/route.ts
src/app/api/events/route.ts
src/app/robots.ts
src/app/sitemap.ts
src/lib/billing/domain.ts
src/lib/billing/http.ts
src/lib/billing/runtime.ts
src/lib/billing/scope.ts
src/lib/mercadopago/webhook-diagnostics.ts
src/proxy.ts
tests/fixtures/admin-sdk-probe.mjs
```

No se cambian dependencias, lockfile, SQL ni `vercel.json`. El build solo compila:
no ejecuta migraciones ni scripts administrativos. Existen otros cambios locales
anteriores de facturación/documentación y diagnósticos: no agregarlos con `git add .`
sin revisarlos. Esta guía no autoriza commit, push ni despliegue.

## Variables por contexto

En Netlify: Project configuration → Environment variables. Los nombres del panel
pueden variar. Free permite valores por contexto; los scopes configurables son
una función de planes superiores y no son necesarios para esta preparación.
No importar `.env.local` completo. No guardar secretos en `netlify.toml`.

| Variable | Deploy Preview / Branch deploy | Production de Netlify |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Mismo proyecto actual | Mismo proyecto actual |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Clave pública actual | Clave pública actual |
| NEXT_PUBLIC_SITE_URL | Build la obtiene de DEPLOY_PRIME_URL | URL canónica exacta del sitio Netlify |
| SUPABASE_SECRET_KEY | **Ausente** | Clave administrativa actual, privada |
| MERCADOPAGO_ACCESS_TOKEN | **Ausente** | Token real de propi-app, privado |
| MERCADOPAGO_WEBHOOK_SECRET | **Ausente** | Secreto real de propi-app, Productivo |
| CRON_SECRET | **Ausente** | Secreto vigente de al menos 32 caracteres |
| MERCADOPAGO_ENVIRONMENT | Ausente | production |
| MERCADOPAGO_SELLER_ID | Ausente | 1355208203 |
| MERCADOPAGO_PRO_PLAN_ID | Ausente | 4a843c8aa5ea45e7be05039d068bc985 |
| MERCADOPAGO_CATALOG_SITE_URL | Ausente | https://propi-psi.vercel.app |
| BILLING_CRON_PROVIDER | off o ausente | off al principio; netlify solo al hacer el traspaso |

No configurar `BILLING_TEST_USER_ID` ni credenciales del vendedor ficticio en el
hosting. Las cuatro claves privadas de la tabla deben tener valor **solo para
Production**, nunca compartido entre todos los contextos. El build de Preview
falla si las hereda. No hay que trasladar las variables de Vercel automáticamente.

`NODE_VERSION=22` está en TOML para el build. Netlify selecciona su runtime soportado;
registrar la versión efectiva en el primer deploy. `URL`, `SITE_ID`, `SITE_NAME` y
`DEPLOY_PRIME_URL` son variables de Netlify: no inventarlas ni sobrescribirlas.
`PROPI_HOSTING_PLATFORM` y `PROPI_DEPLOY_CONTEXT` se generan en next.config.ts y solo
contienen metadatos públicos, no secretos. Evitan depender de `CONTEXT`/`NETLIFY`,
que no están garantizadas en el runtime de funciones. Cambiar variables requiere
otro despliegue. Evitar llenar el entorno con variables ajenas: existen límites
de tamaño en runtimes compatibles con Lambda.

## C. Riesgos y límites

- Netlify Free admite uso comercial. La oferta vigente incluye **300 créditos por
  mes**, con límite estricto. Al agotarse pueden pausarse sitio y funciones.
  **Mercado Pago puede seguir cobrando aunque Propi no reciba los webhooks.** La
  reconciliación tampoco funciona mientras el sitio está pausado. Esto impide
  prometer disponibilidad continua de un SaaS de cobros usando solo Free.
- Como referencia del tarifario consultado: deploy de Production 15 créditos,
  cómputo 10 créditos/GB-hora, transferencia 20 créditos/GB y solicitudes
  2 créditos/10.000. No equivale a un número garantizado de usuarios. Previews
  consumen recursos aunque no tengan el cargo de deploy de Production.
- SSR, APIs y optimización de imágenes consumen recursos. Las imágenes servidas
  directamente por Supabase consumen principalmente su cuota, que no cambia.
  Revisar Usage de ambos servicios y reservar margen para webhooks.
- Free no admite algunos repositorios privados pertenecientes a organizaciones.
  Verificar el acceso del propietario del repositorio; no volver público el repo
  para resolver permisos sin una decisión explícita.
- El adaptador real OpenNext, empaquetado nativo, CSP, latencias, firmas a través
  del proxy y programación cloud aún deben validarse en Netlify. Un build local
  de Next no sustituye esa comprobación. `maxDuration` de Vercel no amplía límites
  de Netlify.
- Un Preview usa el Supabase actual: aunque pagos y analítica estén bloqueados,
  editar propiedades o perfiles modifica datos reales. Probar allí sin escrituras
  o con una cuenta expresamente autorizada. No usarlo como sandbox de base.
- El subdominio `propi-psi.vercel.app` no puede trasladarse por DNS a Netlify.
  Enlaces compartidos, retornos de checkout ya creados y sesiones requieren
  convivencia. No borrar el proyecto Vercel al publicar Netlify.
- Algunos campos de diagnóstico de commit/entorno existentes usan variables de
  Vercel y pueden aparecer vacíos en Netlify. Consultar el deploy y sus Function
  logs para correlacionar; no registrar tokens ni cuerpos privados.

## D. Publicar el primer Preview (acciones futuras, manuales)

1. Revisar estos archivos y autorizar después su commit/push a una rama de
   migración. No fusionar a main todavía ni modificar variables de Vercel.
2. En Netlify Free: Add new project → Import an existing project → GitHub →
   `SSantinoSteckler/propi`. Mantener main como rama de Production y habilitar
   Deploy Previews para pull requests. No importar secretos del archivo local.
3. Configuración del proyecto desde la raíz: comando `npm run build:netlify`,
   publish `.next`, funciones `netlify/functions`. El TOML lo configura. Dejar
   activo el adaptador automático de Next. No agregar redirección SPA a index.html.
   El primer build de main anterior a estos archivos puede fallar o tener otra
   configuración: no se usa para habilitar facturación.
4. Agregar inicialmente solo las dos variables públicas de Supabase. Registrar
   el nombre/URL estable del sitio. Para Production, cuando se prepare, definir
   `NEXT_PUBLIC_SITE_URL` con esa URL exacta. Para Preview la deriva el build.
5. Abrir un PR de la rama de migración hacia main. Netlify genera una URL
   `https://deploy-preview-<numero>--<sitio>.netlify.app`. Esperar Published/Ready
   y revisar que el log identifique Next 16.4.2 y la versión del adaptador.
6. Probar landing, portfolio `/ejemplo`, una ficha publicada, imágenes, estilos,
   mobile, dark mode, navegación y CSP en la consola. Verificar `robots.txt`
   bloqueado y `X-Robots-Tag: noindex` en las páginas. Facturación debe estar
   inhabilitada: es intencional. No registrar el webhook en este Preview.
7. Para probar Google login, agregar **después de autorizar ese cambio remoto**
   las URLs exactas del Preview en Supabase Auth → URL Configuration → Redirect
   URLs: `/login/callback`, `/onboarding` y `/actualizar-clave` bajo ese origen.
   Conservar las URLs Vercel y el Site URL actual durante esta fase. En Google
   Console el callback sigue siendo el mismo proyecto Supabase
   `https://<proyecto>.supabase.co/auth/v1/callback`; no se reemplaza por Netlify.
   El panel enviará a la misma cuenta de Supabase, pero requiere volver a ingresar.

Las variables privadas de Production solo se agregan una vez aprobado el Preview.
Si se quiere una URL de revisión que sobreviva distintos PR, habilitar Branch
deploys para la rama elegida; también mantiene la facturación bloqueada.

## E. Checklist del cambio definitivo

Cada acción remota siguiente necesita autorización; no se ejecutó aquí.

- [ ] Preview validado, versión de adaptador registrada, CSP y OAuth comprobados.
- [ ] Publicar el código compatible en Vercel primero si aún no está allí. Sin
  cambiar variables su cron continúa funcionando. Registrar SHA y entorno para
  rollback. No cambiar SQL ni recrear planes.
- [ ] Fusionar la rama revisada para que Netlify construya Production. Configurar
  allí las variables de la tabla: vendedor real, plan real, puente al catálogo
  Vercel, `BILLING_CRON_PROVIDER=off`. No modificar todavía Vercel.
- [ ] El dominio estable Netlify y `URL` deben coincidir con NEXT_PUBLIC_SITE_URL.
  Quitar protecciones de acceso que impidan a Mercado Pago alcanzar `/api/`.
- [ ] Agregar en Supabase las URLs exactas del dominio definitivo para callback,
  onboarding y actualización de contraseña. Conservar Vercel. Cambiar el Site URL
  principal cuando se cambie el acceso público; no cambiar claves/proveedor Google.
- [ ] Ingresar en Netlify con una cuenta existente. Verificar el mismo UUID,
  Premium, fecha abonada e historial, sin contratar ni pagar de nuevo.
- [ ] En Mercado Pago Developers → **propi-app → Webhooks → Modo productivo**,
  registrar `https://<sitio>.netlify.app/api/mercadopago/webhook`. Seleccionar
  **Planes y suscripciones** y **Pagos (legacy)**. Se procesan
  `subscription_preapproval`, `subscription_authorized_payment` y `payment`;
  `subscription_preapproval_plan` se reconoce pero no concede acceso.
  Si el panel genera/rota un secreto, usar el correspondiente, sin inventarlo.
  Conservar la capacidad del endpoint Vercel para notificaciones en tránsito.
  No redirigir peticiones POST del webhook entre hosts.
- [ ] Comprobar entrega firmada y sincronización usando un recurso existente
  y verificado del vendedor real, mediante reenvío oficial si está disponible,
  sin crear un pago. La firma debe tener timestamp actual; un reenvío con
  timestamp viejo puede ser rechazado correctamente. Simular ID 123456 no prueba
  procesamiento: su 404 puede convertirse en 503 reintentable. Correlacionar logs
  sanitizados y evento persistido, sin imprimir datos personales.
- [ ] Apagar primero el cron Vercel: `BILLING_CRON_PROVIDER=off`, redeploy allí,
  comprobar 204 en `/api/billing/reconcile` **con** CRON_SECRET (sin secreto sigue
  401). Luego activar `BILLING_CRON_PROVIDER=netlify` en Netlify Production y
  redeploy. No dejar ambos activados.
- [ ] En Netlify → Functions, comprobar `billing-reconcile` programada diariamente
  a las 06:00 UTC. Una ejecución manual, solo autorizada, sincroniza registros
  pero no cobra. Revisar tanto `BILLING_CRON_DISPATCHED` como el log
  `BILLING_CRON_COMPLETED`, `failed: 0`, del worker. Un 202 solo no alcanza.
- [ ] Cambiar el enlace público que compartís y los enlaces comerciales. El sitio
  nuevo genera canonical/sitemap propios. Conservar Vercel para URLs antiguas y
  checkouts pendientes. Cualquier redirección futura debe tratar GET públicos
  por separado, sin romper APIs, callbacks ni firmas.
- [ ] Vigilar Usage/créditos, errores de sincronización, reintentos de webhook y
  logs del cron. No declarar terminada la migración antes de verificar lo anterior.

Las suscripciones están en Mercado Pago y los permisos/datos en Supabase: no se
migran cuentas, tablas, Storage ni pagos. Una renovación existente mantiene su ID,
referencia y vendedor; la sincronización sigue consultando a Mercado Pago antes
de conceder acceso, con unicidad y control de versiones para eventos duplicados.

### Rollback

1. Apagar Netlify cron y redeploy; conservar el sitio para retornos ya emitidos.
2. Restaurar el webhook productivo a la URL Vercel y el secreto correspondiente,
   conservando validación de firma. Comprobar entrega y lectura de suscripciones.
3. Reactivar Vercel con `BILLING_CRON_PROVIDER=vercel` y redeploy. Nunca antes de
   apagar Netlify. Restaurar el acceso principal y Site URL de Auth si se cambiaron.
4. Mantener ambos orígenes en Redirect URLs durante la transición. No restaurar
   una copia de la base ni reiniciar suscripciones: los registros son compartidos.

La reversión técnica no cambia las condiciones comerciales del plan contratado
en Vercel. No se recomienda depender indefinidamente de Hobby para este SaaS.

## Verificación y alcance

Resultados de esta preparación:

| Verificación | Resultado |
| --- | --- |
| `npm run typecheck` | OK |
| `npm test` | 121 aprobadas |
| `npm run test:db` | 40 aprobadas, PostgreSQL en memoria; ningún SQL remoto |
| `npm run build` | OK, Next.js 16.4.2 |
| `build:netlify` con contexto Preview simulado | OK, sin instalar el adaptador cloud |
| Playwright E2E, escritorio y mobile | 20 aprobadas; 2 omitidas porque crean datos en Supabase |
| `git diff --check` | OK; avisos LF/CRLF de Git no son errores |

Se arrancó el build de Preview simulado en un puerto local separado, sin tokens
de Mercado Pago ni clave administrativa en el proceso del servidor. Una petición
firmada con un secreto **de fixture**, sin enviar nada a Mercado Pago, devolvió
`BILLING_PREVIEW_DISABLED` antes de acceder a base. También se comprobaron URL
canónica propia, noindex, robots bloqueado, sitemap vacío, analítica 204 y cron 204.
Después se restauró el build local normal. No se modificó `.env.local`.

Pruebas locales de la preparación: unitarias, PostgreSQL en memoria con migraciones
y regresiones contra servidor anterior/nuevo, TypeScript y build de Next. La prueba
de convivencia comprueba pago/cobertura conservados, cancelación sin pérdida del
período abonado, nuevo retorno Netlify, catálogo sin mutaciones y Preview bloqueado.
Los fixtures del proveedor son simulados; no se hacen cobros ni consultas remotas.

El build de Preview simulado prueba la configuración y los bloqueos locales. No
instala ni empaqueta el adaptador automático de Netlify, ni prueba la entrega real
de webhooks, los límites o el scheduler cloud. Esa evidencia requiere el Preview
y luego la activación controlada. El flujo E2E con registro real en Supabase se
mantiene omitido sin autorización para crear datos.

## Fuentes oficiales consultadas

- [Next.js y OpenNext](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)
- [Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/)
- [API de funciones y contexto](https://docs.netlify.com/build/functions/api/)
- [Variables en funciones](https://docs.netlify.com/build/functions/environment-variables/)
- [Variables por contexto](https://docs.netlify.com/build/environment-variables/overview/)
- [Precios y créditos actuales](https://www.netlify.com/pricing/)
- [Uso comercial en Free; sus cuotas históricas ya no son las actuales](https://www.netlify.com/blog/introducing-netlify-free-plan/)
- [Restricciones por plan](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)
