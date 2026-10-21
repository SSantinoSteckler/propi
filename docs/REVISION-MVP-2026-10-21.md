# Revisión del MVP — 21 de octubre de 2026

Actualización posterior: se retiraron los avisos de desarrollo de las páginas
legales y se preparó el contacto público por email en landing, legales y
Configuración. Esto todavía requiere publicación y no sustituye completar la
identificación del operador ni revisar las condiciones aplicables. Los hallazgos
siguientes describen el estado observado durante la auditoría inicial.

## Dictamen

El alcance del producto es suficiente para un MVP: no hace falta agregar más
funcionalidades antes de recibir a los primeros agentes. El lanzamiento
comercial todavía requiere cerrar los puntos operativos siguientes. Esta
revisión local no certifica la configuración actual de Vercel o Supabase remoto.

## Antes de abrir el servicio comercial

1. **Alojamiento comercial.** Si el proyecto sigue en Vercel Hobby, resolver el
   plan de alojamiento antes del lanzamiento pago. El cron diario es compatible
   técnicamente, pero Hobby está limitado a uso personal no comercial. No se
   cambió la cuenta ni se contrató infraestructura.
   Fuente: https://vercel.com/docs/plans/hobby
2. **Identificación y soporte.** `src/screens/Legal.tsx` todavía muestra
   «DOCUMENTO BASE · REVISIÓN DEL OPERADOR PENDIENTE» y «Versión de desarrollo».
   Faltan identidad y contacto del operador, un canal efectivo para datos,
   reclamos y moderación, y la definición de las condiciones comerciales y de
   conservación de comprobantes. Configuración también remite a canales futuros.
   Completar con datos reales y revisión adecuada; no inventarlos. El proceso
   inicial de moderación puede ser manual como ya documenta README.
3. **Correos de acceso.** Verificar SMTP, URLs autorizadas y una recuperación de
   contraseña real con un usuario ajeno al equipo. No se puede conocer la
   configuración remota a partir del repositorio. El SMTP predeterminado de
   Supabase no está destinado a producción y restringe destinatarios.
   Fuente: https://supabase.com/docs/guides/auth/auth-smtp
4. **Respaldo y restauración.** Confirmar un respaldo recuperable de PostgreSQL
   y de los archivos de Storage; no basta con conservar migraciones. No se
   verificó una restauración ni el plan remoto de Supabase. Los respaldos de
   base de datos no contienen los archivos de Storage.
   Fuente: https://supabase.com/docs/guides/platform/backups
5. **Credenciales compartidas durante las pruebas.** Si un token privado que
   se compartió en conversación sigue activo, revocarlo y actualizarlo por un
   canal privado. La revisión no rotó ni imprimió secretos. No hay `.env`
   versionados en el árbol actual; esto no equivale a auditar todo el historial.

## Hallazgos técnicos corregidos localmente

- `/api/events` construía su propio cliente administrativo sin el transporte
  que ya protege facturación. Ahora usa `createAdminFetch`: `sb_secret_` en
  `apikey`, sin emplearlo como JWT Bearer, con User-Agent de servidor y destino
  REST restringido. Se ejecutó el handler real con el SDK instalado y transporte
  simulado para claves nuevas y legacy. No se afirma haber observado un error
  de analítica en Production: se corrigió la inconsistencia comprobada en código.
- Una prueba E2E de cancelación buscaba un texto anterior de la interfaz. Se
  actualizó al mensaje actual y se comprueba que desaparezca el botón de renovar
  una cancelación. El primer intento falló por ese texto; la pasada final pasó.

## Comprobaciones realizadas

| Verificación | Resultado |
| --- | --- |
| TypeScript | Correcto |
| Build de Next.js 16.4.2 | Correcto |
| Pruebas de código y proveedor simulado | 113 aprobadas |
| PostgreSQL/RLS en PGlite desechable | 39 aprobadas |
| Navegador: escritorio y móvil en Chromium/Chrome | 20 aprobadas |
| Registro → perfil → propiedad → portfolio → colección contra Supabase real | 2 omitidas, una por proyecto de navegador |
| `git diff --check` | Sin errores |

Las pruebas de navegador usan el build de producción en un servidor temporal
separado del servidor del usuario. Autenticación y pagos de esas pruebas están
interceptados: no hay cobros, usuarios ni registros nuevos en Supabase remoto.
Las pruebas de base ejecutan migraciones solo en memoria. No se ejecutaron
Expand ni Contract sobre Supabase remoto.

Se revisaron sesiones, protección del dashboard, consultas públicas con campos
permitidos, direcciones privadas, Storage privado y URLs temporales, límites
Free/Pro, relaciones entre propietarios, reseñas, firma de webhooks, deduplicación,
aislamiento ficticio/real, cron protegido, renderizado público y metadatos en
servidor, robots y sitemap. No se detectaron fallos de aislamiento en los casos
ejecutados. No es una auditoría de penetración ni una garantía de ausencia de fallos.

## Límites aceptables para un lanzamiento pequeño

- Estadísticas avanzadas no implementadas: la comunicación comercial debe seguir
  describiendo métricas básicas.
- Moderación manual: los reportes se guardan, pero no hay panel ni notificación
  automática al moderador. Asignar una persona que los revise.
- La reconciliación diaria procesa como máximo 2 eventos y 10 acuerdos por pasada.
  Webhooks son el camino principal. Revisar pendientes, errores y retrasos desde
  el inicio; ampliar el procesamiento antes de escalar suscriptores.
- Hay límite de tamaño por archivo y de fotos por propiedad, pero no cuota
  agregada de Storage por cuenta. Las cargas fallidas pueden dejar huérfanos.
  Controlar consumo y abuso antes de abrir captación masiva.
- El catálogo está restaurado a AR$ 14.900. Acuerdos reales anteriores de AR$ 50
  conservan su importe: cancelar su renovación desde la cuenta correspondiente
  si eran pruebas. No borrar pagos ni cambiar su importe de manera silenciosa.
- Las URLs firmadas de fotos duran diez minutos. SEO y consultas públicas usan
  servidor; previews reales de WhatsApp y comportamiento HTTP de Auth/Storage
  requieren una última comprobación en el despliegue publicado.

## Cierre de versión

Hay cambios locales de diseño, administración del plan real y documentación
pendientes de versionar. La migración de alcance de `billing_plan_registry`
también está sin versionar en este árbol y fue reportada como aplicada por el
operador anteriormente. Conciliar esa historia en Git, sin volver a aplicarla
automáticamente. README y documentación de Mercado Pago conservan notas
históricas de «todavía no publicado»; no usarlas como inventario actualizado.

Antes de invitar clientes, publicar una versión concreta y verificar con una
cuenta real controlada: alta/Google, recuperación, cargar foto y propiedad,
publicar/despublicar, portfolio desde otro dispositivo y colección compartida.
El usuario ya informó un cobro real aprobado; no hace falta repetir un pago para
esta revisión. Renovaciones reales futuras no fueron verificadas desde aquí.

No se hicieron commits, pushes, despliegues, cambios de credenciales ni escrituras
remotas. Las correcciones locales todavía deben publicarse.
