# Mercado Pago Suscripciones — Propi

Implementación en Next.js App Router (Node runtime), sin backend separado. **No se activó en una cuenta real, no se creó ningún plan y no se realizaron cobros.** El build y las pruebas locales no reemplazan las pruebas de autorización, cobro y webhook con el vendedor configurado.

## Decisiones de integración

- `src/lib/billing/catalog.json` es el catálogo central: Propi Premium, ARS 14.900, cada mes. Para cambiar el precio, editar este archivo en el servidor y registrar un plan compatible. No se admite precio, usuario ni plan desde el navegador. Los acuerdos existentes conservan su importe; el panel muestra el de cada acuerdo.
- Se investigó el SDK oficial Node 3.6.1 (Node >=18). Se utiliza un adaptador REST tipado sobre `fetch` hacia la API oficial: este entorno no pudo descargar el paquete por restricciones de red. No se agregó una dependencia que no pudiera instalarse/verificarse. Este punto difiere de la preferencia por el SDK; todos los endpoints son oficiales y pueden conservarse al sustituir el transporte.
- **El plan se registra mediante `/preapproval_plan`, pero el checkout alojado crea `/preapproval` sin asociación formal al plan**, con estado `pending`. La documentación del flujo con plan exige `card_token_id` y `authorized`; el flujo sin plan permite iniciar pendiente y autorizar en la página alojada de Mercado Pago. Para conservar la experiencia solicitada sin capturar/tokenizar tarjetas en Propi se implementa esta alternativa documentada. No se envía `preapproval_plan_id` combinado con un flujo que no está documentado. El plan configurado se consulta y valida como catálogo contra vendedor, importe, moneda, frecuencia, estado y URL antes de contratar. No se afirma que esas suscripciones estén asociadas al plan en el panel del proveedor.
- El email del pagador se solicita explícitamente; no se presupone que sea el de Supabase. No se almacena ese email localmente. Nunca se capturan ni almacenan tarjetas.
- Las capacidades existentes son propiedades, colecciones y personalización de color/portada. No se comercializan estadísticas avanzadas ni funciones aún inexistentes. Free conserva 5 propiedades publicadas y 1 colección activa; Premium tiene un límite técnico de 1.000 de cada una.

Fuentes oficiales: [suscripciones](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/overview), [flujo con plan](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/integration-configuration/subscription-associated-plan), [checkout pendiente sin plan](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments), [SDK oficial](https://github.com/mercadopago/sdk-nodejs).

## Configuración por entorno

Usar los nombres de esta tabla, sin subir `.env.local`. No enviar secretos por chat. Configurarlos en variables privadas de Vercel y reiniciar/recompilar después de cambios:

| Variable | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase existente |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública existente; acepta anon legacy |
| `SUPABASE_SECRET_KEY` | Clave secret o service_role existente, solo servidor |
| `NEXT_PUBLIC_SITE_URL` | Origen HTTPS público estable, sin ruta; ejemplo `https://tu-dominio.com` |
| `MERCADOPAGO_ACCESS_TOKEN` | Access Token privado del vendedor argentino correspondiente al entorno |
| `MERCADOPAGO_WEBHOOK_SECRET` | Firma secreta de Webhooks de la aplicación de Mercado Pago |
| `MERCADOPAGO_PRO_PLAN_ID` | ID del plan previamente creado/registrado |
| `MERCADOPAGO_ENVIRONMENT` | `production` por defecto; `test` sólo en Next local |
| `MERCADOPAGO_SELLER_ID` | ID explícito del vendedor; el ficticio 3779671542 está prohibido en producción |
| `BILLING_TEST_USER_ID` | Sólo local: UUID también designado en la tabla administrativa privada |
| `CRON_SECRET` | Secreto aleatorio independiente de al menos 32 caracteres |

- **Development:** el producto normal continúa en `http://localhost:3100` sin configurar `NEXT_PUBLIC_SITE_URL` y con contratación deshabilitada. Para la única prueba con base compartida seguir [la guía local](./MERCADOPAGO-PRUEBA-LOCAL.md): túnel HTTPS, usuario designado y vendedor fijo. El retorno de ese checkout usa el túnel sin modificar el plan ficticio existente.
- **Preview:** no usarlo para esta prueba; el modo ficticio se rechaza en todos los despliegues Vercel.
- **Production:** dominio HTTPS definitivo, base de producción, credenciales del vendedor real, plan compatible y webhook de esa aplicación. Las variables `MERCADOPAGO_*`, `SUPABASE_SECRET_KEY` y `CRON_SECRET` nunca llevan prefijo `NEXT_PUBLIC_`.
- Registrar también los orígenes/retornos de Supabase Auth para ese dominio. Se conserva el sistema de sesión existente; los endpoints verifican el JWT Bearer con `auth.getUser()` en Supabase, no con datos del cliente.

## Migración

Si las primeras tres migraciones ya están aplicadas, ejecutar **solamente** `supabase/migrations/202610200001_billing.sql` una vez, mediante el SQL Editor de Supabase o `supabase db push` con el historial correctamente vinculado. No repetir las migraciones anteriores ni ejecutar `seed.sql` en producción. Un proyecto nuevo aplica todas las migraciones en orden.

Para los controles actuales también se requiere `202610200002_billing_isolation.sql`,
previa revisión y autorización. Si facturación ya está instalada, aplicar sólo
esta última siguiendo [la transición compatible](./MERCADOPAGO-TRANSICION.md).
Expand conserva la RPC antigua y separa las pruebas en tablas nuevas del mismo
Supabase; el endurecimiento de `supabase/deferred/` no se ejecuta en esta fase.

No se alteran las columnas de `subscriptions` existentes: se agrega un libro de acuerdos/cobros separado, se extienden las funciones de autorización y se conserva compatibilidad con Pro otorgado administrativamente antes de esta integración (`provider` distinto de `mercadopago`). No otorgar Pro manualmente a acuerdos de Mercado Pago modificando la tabla: el acceso real proviene de las evidencias de pago.

Tablas nuevas:

- `billing_agreements`: propietario, referencia externa aleatoria de 256 bits, ID del proveedor, catálogo, importe, estado, reserva de creación, cursor de recuperación y sincronización.
- `subscription_payments`: facturas/cobros únicos, importe, moneda, aprobación validada y cobertura de servicio.
- `billing_webhook_events`: bandeja durable mínima, sin cuerpo original ni datos de tarjeta; reintentos, estado e idempotencia.
- `billing_plan_registry`: registro administrativo del plan e intentos de creación.
- `private.billing_locks` y `private.billing_rates`: exclusión mutua con lease y token de cercado, y rate limits compartidos entre instancias.

RLS permite a cada usuario leer únicamente sus acuerdos/cobros. Los usuarios no pueden escribirlos ni consultar los eventos, el registro administrativo o funciones privilegiadas. Las escrituras requieren la clave privada del servidor. No hay endpoint que cambie planes arbitrariamente.

## Registrar el plan sin duplicarlo

### Diagnosticar Supabase antes de crear recursos

```powershell
npm.cmd run billing:plan -- --diagnose
```

Este modo solo ejecuta un SELECT en `public.billing_plan_registry`: no adquiere locks, no crea filas, no modifica datos y no llama a Mercado Pago. Necesita únicamente `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SECRET_KEY`, no el token de Mercado Pago ni la URL pública. Una tabla accesible y vacía es válida: el diagnóstico devuelve `registryAccessible: true` y `registryRowExists: false`.

Se carga la configuración con `@next/env` desde el directorio de ejecución, igual que el script existente. Se muestran los nombres de los archivos cargados y si las variables están declaradas en `.env.local`, sin imprimir valores de claves. Las variables heredadas del proceso tienen prioridad; si reemplazan un valor literal de `.env.local`, el script se detiene para no administrar otro proyecto accidentalmente. Ejecutar desde la raíz de Propi. La URL del proyecto es pública; su host se muestra para contrastarlo con el proyecto abierto en Supabase.

`SUPABASE_SECRET_KEY` debe ser una clave privada `sb_secret_...` o una clave legacy `service_role` del mismo proyecto, nunca la publishable/anon del frontend ni una contraseña de PostgreSQL. El formato de la clave no prueba que sea válida: eso lo comprueba la respuesta del servidor. La información de rol/proyecto de un JWT legacy se presenta como no verificada, sin mostrar el JWT.

El transporte del script normaliza los encabezados después de que los prepara el SDK: con `sb_secret_...` envía la clave solo en `apikey` y elimina `Authorization`; con una legacy `service_role` mantiene `apikey` y `Authorization: Bearer <JWT>`. La versión instalada del SDK, 2.118.0, incluía el API key como fallback Bearer en consultas REST; el adaptador evita usar una clave opaca como JWT sin cambiar RLS ni permisos. Solo permite peticiones al origen Supabase configurado y a `/rest/v1/`, sin seguir redirecciones. Se comprobaron los encabezados reales en pruebas del SDK con un servidor simulado, sin imprimir valores.

`--diagnose` informa `authenticationHeaders` como booleanos: `apiKeyHeaderMatchesConfigured`, `authorizationHeaderPresent` y `secretKeyUsedAsBearer`. Para una clave nueva se espera `true`, `false` y `false`, respectivamente. `projectKeyValidatedByApi: true` significa que el SELECT privado fue aceptado en la URL configurada; `false` indica rechazo de autenticación y `null` una comprobación inconclusa, por ejemplo por red bloqueada. Las claves `sb_secret_` no contienen un project ref decodificable: un prefijo correcto no demuestra pertenencia. Si continúa el 401 con esos encabezados correctos, revisar que la clave esté vigente y copiada completa desde **Settings → API Keys** del proyecto cuyo host muestra el diagnóstico. No probar claves en otros proyectos ni compartirlas por chat.

El diagnóstico comprueba además el transporte real del SDK:

- `runtime.engine: node`, versión de Node y `browserGlobalsPresent: false`. Se rechaza ejecutar el administrador con globals de navegador. No depende de que exista `navigator`: Node también puede definirlo.
- `keyHygiene`: indicadores de espacios, saltos, comillas extra y caracteres no ASCII. Si alguno es verdadero se cancela antes de emitir peticiones; no se recorta ni se modifica la clave silenciosamente. Las comillas normales que delimitan un valor en `.env.local` son procesadas por `@next/env`; no deben permanecer dentro del valor final.
- `urlIsProjectOrigin` y `transport.endpoint`: la variable debe contener solo el origen del proyecto; la consulta final debe ir a `/rest/v1/billing_plan_registry`, sin duplicar `/rest/v1`. Se muestran el endpoint sin query y los nombres de parámetros, nunca sus valores.
- `transport.userAgent`: se fija explícitamente `propi-billing-admin/1.0 Node.js/<versión>`, con tipo `node-server`, desde el proceso Node. Se informa únicamente el tipo del encabezado entrante del SDK, sin imprimir valores arbitrarios. No se reenvía un User-Agent de navegador. Esto no habilita claves secretas en el frontend: el comando sigue siendo administrativo y exclusivo de Node.
- `transport.response`: HTTP y código antes de que el SDK procese la respuesta. Se inspecciona una copia acotada a 8 KB; el status y el cuerpo originales se devuelven intactos al cliente oficial. El mensaje mostrado es una descripción controlada del error reconocido, nunca el payload completo, `details`, `hint`, cabeceras privadas ni textos arbitrarios del proveedor.

Los rechazos explícitos por navegador/User-Agent se identifican con `authFailureKind: BROWSER_USER_AGENT_BLOCK` y categoría propia. Un mensaje explícito de API key inválida produce `API_KEY_REJECTED`; un rechazo de JWT produce `JWT_REJECTED`. Un 401 sin explicación reconocible produce `AUTHENTICATION_REJECTED_UNSPECIFIED` y no se declara automáticamente como clave inválida. Si no existe respuesta HTTP por un error de red, `transport.response` es `null`: no se inventa un 401 ni un diagnóstico del servidor. Estas distinciones se probaron con respuestas simuladas y la consulta real sigue pendiente de una conexión habilitada cuando aparece `EACCES`.

El error anterior era genérico: cualquier fallo, incluso adquirir `billing_acquire_lock` antes de consultar la tabla, sugería aplicar una migración. Ahora el informe incluye operación, HTTP y código sanitizados:

| Categoría | Interpretación / siguiente paso |
| --- | --- |
| `TABLE_NOT_FOUND` (`42P01` / `PGRST205`) | Tabla inexistente o no visible en la caché de la API. Confirmar con el SQL de solo lectura antes de aplicar cambios. |
| `FUNCTION_NOT_FOUND` (`42883` / `PGRST202`) | Función ausente o no visible en la caché de la API. Comprobar firma y existencia con SQL. |
| `INSUFFICIENT_PERMISSIONS` (`42501` / HTTP 403) | Revisar tipo de clave y grants de `service_role`. No desactivar RLS ni conceder acceso público. |
| `INVALID_CREDENTIALS` (HTTP 401 / errores JWT) | Revisar clave privada vigente y pareja URL/proyecto. No compartir la clave. |
| `BROWSER_USER_AGENT_BLOCK` | El servidor informó un rechazo por contexto de navegador/User-Agent. Contrastar con el transporte Node registrado; no implica por sí solo una clave inválida. |
| `AUTHENTICATION_REJECTED` | HTTP 401 sin una causa específica reconocida. Revisar `transport.response`; no atribuirlo automáticamente a una clave revocada. |
| `INVALID_KEY_FORMAT` | El valor de la clave contiene espacios, saltos de línea, comillas extra u otros caracteres no válidos para este administrador. Corregir el valor; no se envía la petición. |
| `CONNECTION_ERROR` | Revisar red, DNS, firewall, certificado o disponibilidad de Supabase. `EACCES` significa acceso de red denegado en el proceso que ejecuta el diagnóstico; no demuestra una migración faltante. |
| `SUPABASE_ERROR` | Otro error: se conserva su código sin mostrar el mensaje/payload potencialmente privado. |

Para comprobar los objetos y permisos desde Supabase **SQL Editor**, ejecutar el contenido de [`supabase/diagnostics/billing.sql`](../supabase/diagnostics/billing.sql). Es un único SELECT que consulta `to_regclass`, `to_regprocedure` y permisos de `service_role`; no invoca funciones que adquieran locks ni ejecuta DDL. Esto funciona aunque la red de la terminal esté bloqueada. Las migraciones aplicadas manualmente por SQL Editor no siempre figuran en el historial de Supabase CLI; la mera existencia de una tabla tampoco prueba que toda la migración se haya completado.

La tabla y las funciones administrativas se crean en **`supabase/migrations/202610200001_billing.sql`**. Aplicar ese archivo una sola vez únicamente si se confirma que la migración no se ejecutó y sus objetos no existen. Si solo faltan algunos objetos/permisos, no repetir toda la migración ni recrear las tablas: revisar el resultado para preparar una reparación específica que preserve datos. Si SQL confirma existencia pero la API devuelve `PGRST205`/`PGRST202`, revisar proyecto, exposición del esquema y caché antes de concluir que falta la migración.

Fuentes: [claves y privilegios de Supabase](https://supabase.com/docs/guides/api/api-keys), [códigos de error PostgREST](https://docs.postgrest.org/en/stable/references/errors.html).

El comando sin opciones **solo valida** un plan existente. Necesita la migración aplicada y configuración de Supabase, vendedor y URL. No necesita el ID de plan si se lo va a crear explícitamente.

```powershell
npm.cmd run billing:plan -- --help
# Vista previa local, sin llamadas ni escrituras externas:
npm.cmd run billing:plan -- --dry-run
# Consulta de solo lectura: titular del token, sin guardar ni crear recursos:
npm.cmd run billing:plan -- --verify-seller
npm.cmd run billing:plan
# Registrar un plan existente compatible:
npm.cmd run billing:plan -- --adopt <ID_DEL_PLAN>
# SOLO cuando el operador decida crear el plan en la cuenta correspondiente:
npm.cmd run billing:plan -- --create
```

`--create` es una acción administrativa explícita: crea un plan del vendedor, no un pago ni una suscripción. No ejecutarlo en instalación/build/tests. El comando adquiere un lock de PostgreSQL y persiste el intento antes del POST; si la respuesta es ambigua no vuelve a crear automáticamente. Revisar los planes del vendedor y usar `--adopt ID`. Repetir `--create` con un plan registrado lo valida/reutiliza. Se imprime únicamente el ID no secreto que debe configurarse en `MERCADOPAGO_PRO_PLAN_ID`.

El ID devuelto se guarda en `public.billing_plan_registry` antes del GET de verificación. Si ese GET falla, la siguiente ejecución reutiliza el ID guardado. Sin opciones, el comando solo consulta y valida; no crea filas ni modifica el registro. `--dry-run` muestra el cuerpo previsto y los nombres de configuración faltantes sin consultar Supabase ni Mercado Pago; un `back_url: null` indica que todavía falta definir la URL y **no se enviaría a la API**.

Para verificar el vendedor de prueba antes de autorizar la creación, `--verify-seller` hace solamente `GET /users/me`, sin consultar Supabase ni crear planes. Muestra únicamente ID, sitio y presencia de `test_user` en los tags devueltos por el proveedor. Exige sitio argentino `MLA` y ese marcador para informar confirmación; si falta el marcador, no presupone que la cuenta sea ficticia. Contrastá además el ID con el User ID del vendedor en Mercado Pago Developers → Cuentas de prueba. Si una variable del proceso reemplaza el token declarado en `.env.local`, la consulta se cancela. El prefijo del token por sí solo no identifica una cuenta ficticia; no compartir el token ni respuestas completas del perfil.

Para comprobar la creación, ejecutar `npm.cmd run billing:plan` después de configurar el ID: hace `GET /preapproval_plan/{id}` y verifica vendedor, estado `active`, nombre `Propi Premium`, ARS 14.900, frecuencia mensual sin prueba gratuita ni fecha de fin, y URL de retorno exacta. El mensaje `Plan validado` confirma esas comprobaciones; no confirma un cobro ni una suscripción de comprador. También puede revisarse el ID desde la cuenta vendedora en Mercado Pago. Referencia: [crear planes mediante la API oficial](https://www.mercadopago.com.ar/developers/es/reference/online-payments/subscriptions/create-preapproval-plan/post).

El precio de referencia no modifica planes existentes en Mercado Pago automáticamente. Para cambiarlo, registrar/adoptar un plan compatible y desplegar catálogo y ID juntos; probar la nueva contratación antes de habilitarla públicamente.

## Endpoints y flujo

| Ruta | Autorización / comportamiento |
| --- | --- |
| `POST /api/billing/subscribe` | JWT Supabase y Origin exacto. Cuerpo estricto `{payer_email}`. Reserva durable, lock de propietario y unicidad antes del POST remoto. Reutiliza checkout pendiente. |
| `GET /api/billing/status?refresh=1` | JWT Supabase. Devuelve solamente facturación del usuario. La actualización remota tiene throttle y backoff. |
| `POST /api/billing/cancel` | JWT, Origin y `{confirm:true}`. Cancela en Mercado Pago y relee el estado canónico. |
| `POST /api/mercadopago/webhook` | Firma oficial y actualidad, sin sesión de usuario. Reconsulta recursos oficiales. |
| `GET /api/billing/reconcile` | Bearer `CRON_SECRET` con comparación constante. Procesa reintentos y acuerdos pendientes de revisión. |

Todos usan Node runtime, respuestas `no-store`, errores sin secretos y validación de permisos en servidor. Los POST de usuario no aceptan `user_id`, precio o plan. Nunca se repite automáticamente un POST remoto ambiguo, aunque venza el lock. El estado `uncertain` bloquea nuevas contrataciones hasta recuperar el ID o una resolución administrativa comprobada.

El dashboard está en `/dashboard/billing`. El retorno es `/dashboard/billing/return`: consulta al backend, espera confirmación y permite reintentar. Visitar la URL, cambiar parámetros o recibir `authorized` no habilita Premium.

## Webhooks

En Mercado Pago Developers, seleccionar la aplicación del vendedor, configurar como URL HTTPS:

```
https://propi-psi.vercel.app/api/mercadopago/webhook
```

Habilitar **Planes y suscripciones** y **Pagos**, según los nombres del panel oficial:

| Selección en Mercado Pago Developers | Tópico | Tratamiento |
| --- | --- | --- |
| Planes y suscripciones | `subscription_preapproval` | Consulta y sincroniza el acuerdo. |
| Planes y suscripciones | `subscription_authorized_payment` | Consulta la factura, su suscripción y los cobros aplicables. |
| Planes y suscripciones | `subscription_preapproval_plan` | Reconoce el aviso y lo marca ignorado; no concede acceso ni cambia el catálogo. El plan se valida al contratar. |
| Pagos | `payment` | Correlaciona el pago mediante la factura recurrente y sincroniza su acuerdo. |

Los temas desconocidos se reconocen como ignorados después de validar firma y cuerpo, sin operar la base. Estados de acuerdos admitidos: `pending`, `authorized`, `paused`, `cancelled` (y compatibilidad `canceled`). No se inventa un evento `subscription_expired`: el vencimiento de acceso se calcula con evidencia vigente.

Guardar la firma secreta del panel en `MERCADOPAGO_WEBHOOK_SECRET`. Se exige `data.id` único en query, coincidencia con el cuerpo, `x-request-id` y `x-signature`. Se valida HMAC SHA256 del manifiesto oficial `id:<id normalizado>;request-id:<request-id>;ts:<ts>;` con comparación constante. Se aceptan timestamps de segundos o milisegundos dentro de cinco minutos; sincronizar el reloj del servidor. Un replay con firma antigua obtiene 401. La reconciliación recupera cambios incluso si un reintento del proveedor conserva un timestamp demasiado antiguo.

La notificación se guarda antes de procesar. Los duplicados con mismo request/recurso se deduplican; otros request IDs del mismo recurso también convergen mediante locks, IDs únicos y versiones monotónicas. Siempre se consulta el recurso oficial, la suscripción y los cobros aplicables. Se valida referencia externa, vendedor, ID de suscripción, pagador cuando está disponible, moneda, importe y devolución. Los snapshots antiguos no revierten estados posteriores ni resucitan una cancelación. Los cobros se actualizan según su propia versión, sin depender del orden de llegada del webhook.

Si la factura llega antes que el aviso de creación de la suscripción o antes de recuperar una respuesta de creación incierta, se consulta la suscripción canónica para correlacionar su referencia externa con el acuerdo local. Nunca se toma un `user_id`, precio, estado aprobado ni plan del cuerpo de la notificación como autorización.

El flujo escribe `billing_webhook_events` para recepción, intentos y resultado. `billing_apply_sync` actualiza atómicamente `billing_agreements`, `subscription_payments` y la proyección `subscriptions`, con lease vigente y control de versiones. No se cambió el esquema: requiere la migración de facturación existente, no una migración nueva. El cliente administrativo del servidor, además del script, envía `sb_secret_` solo mediante `apikey`, elimina el Bearer opaco y fija un User-Agent de Node; las claves legacy mantienen su JWT. Las políticas RLS siguen intactas.

Respuesta 200 para procesado/ignorado, 400 para cuerpo inválido, 401 para firma inválida o vencida, 429 para exceso de solicitudes y 503 para errores temporales. Los eventos fallidos quedan disponibles para reintento con backoff. No se guardan cuerpos originales ni se registran tokens, emails, tarjetas o payloads completos en logs.

La API de Mercado Pago dispone de 15 segundos de presupuesto dentro del webhook para dejar margen a las operaciones de base antes de la espera de confirmación de 22 segundos del proveedor. Si hay timeout/error no se responde con una aprobación ficticia: se conserva el evento reintentable y se devuelve error. Una latencia excesiva de Supabase puede igualmente demorar la respuesta; los reenvíos convergen mediante la idempotencia existente.

Para habilitarlo en Vercel:

1. Subir y desplegar el código actualizado. Registrar la URL anterior en **Webhooks → Configurar notificación** de la aplicación correcta del vendedor y seleccionar los eventos indicados.
2. Guardar la configuración en Mercado Pago y copiar la firma secreta que genera el panel a `MERCADOPAGO_WEBHOOK_SECRET`, tanto en el entorno local que se vaya a probar como en el entorno de Vercel correspondiente. No es el Access Token ni una contraseña de Supabase. No inventar un secreto para hacerlo coincidir con fixtures.
3. Verificar las variables privadas `MERCADOPAGO_ACCESS_TOKEN`, `SUPABASE_SECRET_KEY` y la URL `NEXT_PUBLIC_SUPABASE_URL` del proyecto correcto. `MERCADOPAGO_PRO_PLAN_ID` y `NEXT_PUBLIC_SITE_URL=https://propi-psi.vercel.app` son necesarios para la contratación/retorno. `CRON_SECRET` es independiente y se usa solo para la reconciliación diaria.
4. Volver a desplegar para aplicar las variables. Hasta configurar la firma, el webhook responde 503; una firma inexistente o inválida responde 401. No quitar esa validación para conseguir un resultado exitoso en el simulador.
5. Revisar una entrega firmada en el panel y la bandeja `billing_webhook_events`. Una simulación con un ID de recurso que no existe puede pasar la firma y fallar al consultar la API: no equivale a un pago ni debe conceder Premium. La validación completa con un evento auténtico del entorno apropiado sigue pendiente hasta configurarlo. No crear suscripciones ni cobrar durante esta revisión.

La auditoría solo comprobó presencia de variables locales, sin mostrar valores: el plan está configurado y falta `MERCADOPAGO_WEBHOOK_SECRET`; también falta `CRON_SECRET` para el respaldo diario. No se modificaron `.env.local` ni variables de Vercel. No se aprovisionaron credenciales ficticias en Production. Las cuentas y credenciales de prueba deben mantenerse separadas del entorno comercial.

Referencia: [Webhooks oficiales: firma, eventos y respuesta](https://www.mercadopago.com.ar/developers/es/docs/split-payments/additional-content/your-integrations/notifications/webhooks?scope=prod).

## Fuente de verdad y cobertura

`private.effective_plan()` y los RPC `get_user_entitlements()` (solo el usuario actual) / `billing_get_entitlements()` (solo servidor) determinan el plan efectivo en tiempo de consulta. `getUserEntitlements()` es el servicio TypeScript. `subscriptions.plan` es una proyección de compatibilidad, **no una autorización fiable al vencer un período**. Todos los límites/personalización usan la función efectiva, incluso si un cron no se ejecuta. Las concesiones administrativas previas se mantienen separadas.

Para habilitar inicialmente Premium se requiere:

1. Acuerdo canónico correlacionado del vendedor, ya autorizado, en pausa o cancelado con cobertura pagada previa; una suscripción pendiente no concede acceso.
2. Factura de suscripción ligada al acuerdo y un pago consultado en `/v1/payments/{id}`, `approved`, por el importe completo esperado en ARS, sin reembolso.
3. Fecha de aprobación válida y cobertura actual de servicio.

**La API no aporta un `current_period_end` contractual.** Propi define explícitamente una regla de servicio: cada factura pagada cubre desde `debit_date` hasta un mes calendario después, respetando el offset horario y ajustando fin de mes (31/01 → 28/02 o 29/02). Es una fecha derivada de Propi, no un vencimiento devuelto por Mercado Pago. Una aprobación tardía no mueve el ciclo ni regala otro mes. `next_payment_date`, si existe, se muestra solo como próximo intento informado por el proveedor. No hay período de gracia.

Un cobro rechazado no agrega cobertura; un período anterior aprobado permanece hasta vencer. Reintegros, devoluciones parciales y contracargos revocan la evidencia de ese cobro al sincronizar. Una pausa/cancelación no genera cobertura nueva. Mercado Pago cancela el acuerdo **ahora**: Propi no promete una cancelación diferida del proveedor, pero conserva el acceso ya abonado hasta su fecha derivada, salvo reversión del pago. No hay reembolso automático al cancelar.

Al volver a Free se conservan los datos, publicaciones existentes, portadas y colores. Se permite editar, archivar y retirar contenido; solo se impiden nuevas publicaciones/activaciones que excedan 5/1, y nuevas personalizaciones premium. La exclusión mediante fila bloqueada serializa los límites. No se elimina ni despublica contenido automáticamente.

## Reconciliación y operación

`vercel.json` configura una ejecución diaria compatible con **Vercel Hobby** mediante `0 6 * * *`: a partir de las 06:00 UTC (03:00 de Argentina). Hobby no garantiza el minuto exacto: puede ejecutarse dentro de esa hora. No hace falta contratar Pro ni configurar otro scheduler para esta frecuencia. Mantener `CRON_SECRET` privado en las variables de Production de Vercel: se envía como `Authorization: Bearer <CRON_SECRET>`. El endpoint `/api/billing/reconcile` mantiene la validación del secreto y rechaza solicitudes no autorizadas. [Límites de Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Los webhooks son el mecanismo principal: `/api/mercadopago/webhook` verifica la firma, guarda la notificación y llama directamente a `processEvent()`, que consulta Mercado Pago y sincroniza el acuerdo y los pagos. No espera ni depende del cron diario para activar Premium ante un cobro aprobado y verificado. El panel también puede solicitar una actualización autenticada. La validación de cobertura en PostgreSQL mantiene los vencimientos efectivos aunque el cron no corra.

El cron diario funciona como respaldo. Cada pasada procesa hasta 2 eventos reintentables y 10 acuerdos vencidos para revisión, ordenados por fecha. `reconcile_after` habilita una revisión después de una hora, o cinco minutos ante errores; esos plazos no programan ejecuciones adicionales: el cron recoge los registros elegibles en su próxima pasada diaria. Los eventos tienen backoff de hasta una hora. Si falla una entrega del webhook, la recuperación automática puede demorar hasta la siguiente pasada diaria o más si el lote tiene pendientes acumulados. Hay presupuesto global de llamadas MP de 45 segundos (8 segundos máximo por petición) dentro de Route Handlers de 60 segundos. Una interrupción conserva reservas/eventos y nunca habilita por error. Configurar alertas ante HTTP no exitoso **y ante `failed > 0` en JSON**. Monitorear en Supabase antigüedad de eventos pendientes/failed, `sync_error`, acuerdos `uncertain` y retrasos de `reconcile_after`; esta configuración externa no está aprovisionada por el repositorio.

Recuperación de creaciones ambiguas: `/preapproval/search` no documenta filtro por referencia externa; se recorre la lista del vendedor en páginas de 100 con cursor persistido y comparación exacta de la referencia aleatoria, luego se obtiene el recurso canónico. No se agregan filtros ficticios ni se reinicia el POST. En vendedores con muchos acuerdos puede requerir varias pasadas. El webhook de suscripción también recupera por referencia. No marcar un intento incierto como fallido solo porque no aparece inmediatamente; verificar definitivamente en el proveedor y cancelar cualquier acuerdo encontrado antes de permitir otra contratación.

Límites por sincronización: hasta 500 facturas por acuerdo y 8 consultas de pagos actuales/recientes. Si se exceden, falla cerrado y conserva el último estado; requiere ampliar el procesamiento con cursor antes de superar esos volúmenes. El presupuesto por pasada y el scheduler deben ajustarse antes de escalar a muchos suscriptores; no se promete sincronización instantánea ni reconciliación ilimitada. Se siguen reconciliando acuerdos cancelados para detectar reversión de pagos previos. Definir retención/borrado de eventos según obligaciones operativas y fiscales antes del lanzamiento; no se borran cobros automáticamente.

## Pruebas y activación

```powershell
npm.cmd test
npm.cmd run test:db
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:e2e -- --workers=1
```

Las pruebas unitarias usan fixtures del proveedor y no hacen llamadas de pago. Cubren firmas, anti-replay, validación del catálogo y recursos, precio/moneda, aprobación, rechazos, devoluciones, cobertura de meses, reserva antes del POST, ambigüedad/concurrencia y rechazo de endpoints sin sesión/origen válido. Las pruebas PostgreSQL/PGlite aplican las migraciones reales y prueban RLS, funciones, duplicados, locks/leases, períodos, downgrade y límites. Auth y Storage HTTP requieren Supabase real; las pruebas locales no equivalen a un checkout integrado en Mercado Pago.

Para probar oficialmente: crear vendedor y comprador de prueba de Argentina con la aplicación/configuración correspondiente. La documentación de Suscripciones indica usar credenciales de producción **de la cuenta vendedora de prueba** y tarjetas de prueba nacionales; no asumir que un token `TEST-` ni el sandbox de Checkout Pro representan todos los flujos de Suscripciones. Verificar las opciones habilitadas para la aplicación del vendedor. No usar la misma cuenta como vendedor y comprador. No compartir credenciales entre producción y pruebas.

Fuentes: [prueba de aprobación de Suscripciones](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/integration-test/payment-approval), [aclaraciones oficiales de pruebas](https://www.mercadopago.com.ar/developers/es/news/2023/11/16/Questions-on-how-to-test-your-integration--).

Antes de anunciar la integración como lista para producción falta completar y dejar evidencia de:

- Aplicar migración en el proyecto de destino y comprobar RLS con dos usuarios reales autenticados.
- Configurar secretos privados, URL HTTPS, vendedor, registrar/adoptar plan y validar comando sin opciones.
- Registrar Webhooks, verificar firma real del proveedor y entrega/reintentos; ejecutar scheduler autenticado y alertas.
- Recorrer registro/login → contratación → autorización → primer pago aprobado → Premium → publicación por encima de Free → renovación y cancelación con cobertura restante. Probar también abandono, rechazo, reembolso/contracargo y acceso vencido.
- Confirmar tiempos/estados y disponibilidad de pruebas que ofrece la cuenta de Mercado Pago concreta. No realizar un cobro real sin autorización explícita del operador.
- Revisar términos comerciales, identificación del operador, facturación fiscal, soporte, política de datos y observabilidad. Las páginas legales siguen siendo documentos base pendientes de revisión.

No hay credenciales inventadas ni activación ficticia. Hasta completar esta lista la integración está implementada en código y validada localmente, **pendiente de activación y validación externa**.

## Resultado de verificación local

- `npm run build`: aprobado con Next.js 16.4.2, incluidos los cinco Route Handlers nuevos y ambas páginas de facturación.
- `npm run typecheck`: aprobado; el build final también completó su comprobación TypeScript.
- `npm test`: 68 pruebas aprobadas, incluidas firma, procesamiento canónico del webhook, duplicados, reintentos y correlación temprana de facturas.
- `npm run test:db`: 32 pruebas PostgreSQL/RLS aprobadas con las cuatro migraciones aplicadas en PGlite, incluyendo unicidad de eventos, ledger de cobros y condiciones de acceso Premium.
- Última pasada E2E de interfaz, anterior a esta auditoría del webhook, con un worker: 20 aprobados y 2 omitidos porque requieren Supabase real. Los cuatro casos de facturación (dos flujos en escritorio/celular) usan respuestas de red de prueba; no validan un cobro real.
- El comando administrativo se comprobó con `--help` y validación sintáctica; no se ejecutó `--create` ni se contactó a un vendedor para crear planes.

En la verificación inicial faltaban las variables de Mercado Pago, cron y URL pública. En la revisión posterior del script administrativo se confirmó, sin mostrar su valor ni enviarlo al proveedor, que `MERCADOPAGO_ACCESS_TOKEN` ya está declarado y cargado desde `.env.local`. La vista previa indicó que falta `NEXT_PUBLIC_SITE_URL` para preparar la creación del plan; todavía no se ejecutó esa creación. Las cuatro pruebas adicionales del comando administrativo y `npm run typecheck` pasaron. La migración remota, configuración del proveedor y pruebas integradas siguen pendientes. Una pasada previa del navegador sufrió timeouts durante la recompilación del servidor de desarrollo; la pasada final, sin ediciones concurrentes y con un worker, terminó completa.
# Prueba local con base compartida

Antes de probar con el Supabase existente, seguir
[MERCADOPAGO-PRUEBA-LOCAL.md](./MERCADOPAGO-PRUEBA-LOCAL.md).
La configuración nueva exige `MERCADOPAGO_SELLER_ID`; sólo permite el vendedor
ficticio 3779671542 en modo local `MERCADOPAGO_ENVIRONMENT=test`, para un único
`BILLING_TEST_USER_ID` también designado por SQL administrativo. En Vercel se
rechaza ese modo. El cron nuevo consulta producción y legacy; las tablas ficticias
están separadas y tampoco son visibles para las consultas del cron anterior.
No ejecutar la migración de aislamiento remota sin revisión y autorización.
