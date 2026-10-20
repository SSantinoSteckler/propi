# Una prueba local, con el Supabase existente

No requiere Docker, otro proyecto ni un despliegue Preview. No se ejecutaron
migraciones remotas, altas de usuarios, suscripciones ni pagos al implementar esto.

## 1. Revisar y autorizar la migración, después desplegar el código

La migración fue revisada como **Expand compatible**: conserva íntegramente la
RPC anterior y sus permisos. El código de `origin/main` acf6420 y `origin/staging`
83f849c se ejecutó contra el esquema expandido con PostgreSQL temporal y proveedor
simulado. Antes de aplicar en remoto, confirmar el SHA activo de Vercel y el
diagnóstico de la base siguiendo [el procedimiento de transición](./MERCADOPAGO-TRANSICION.md).

Archivo: `supabase/migrations/202610200002_billing_isolation.sql`.
Aplicar una sola vez en SQL Editor **después de revisar y autorizar su contenido**.
Requiere las migraciones anteriores. No ejecutar `db:reset` sobre la base compartida.
Consultas preparadas de sólo lectura: `supabase/diagnostics/billing-isolation-before.sql`
y `supabase/diagnostics/billing-isolation-after.sql`. Guardar el resultado previo,
incluidas definiciones y permisos originales. Existe un script manual de
restauración en `supabase/rollback/billing-restore-compatibility.sql`. Si el SQL
falla antes de COMMIT, ejecutar ROLLBACK en esa misma sesión.

Qué cambia:

- Agrega `environment` y `seller_id` a acuerdos, pagos y eventos, sin crear índices
  sobre las tablas pobladas ni ejecutar un backfill masivo.
- Los registros previos conservan estados, importes y propietarios; quedan como
  `legacy` y vendedor desconocido, sin atribuirles una verificación nueva.
  El nuevo servidor vincula el vendedor después de verificarlo en Mercado Pago.
- Crea una tabla administrativa privada, vacía, para un único usuario ficticio.
- Agrega tres tablas vacías de prueba dentro del Supabase actual: acuerdos,
  pagos y eventos. El cron anterior no puede ver esos datos en sus consultas.
- Protege propietario/entorno/vendedor y exige el ámbito al sincronizar mediante
  `billing_apply_sync_v2`; la RPC antigua sigue admitiendo snapshots anteriores.
- Los pagos heredan el ámbito del acuerdo; Premium sólo usa el ledger permitido.
- Conserva beneficios Pro manuales y las reglas existentes de cobertura/cancelación.

No cambiar las credenciales de Production por las del vendedor ficticio. El flujo
local nuevo requiere Expand; la aplicación publicada puede conservar el binario
anterior mientras tanto, ya que no consulta las tablas de prueba. El servidor
nuevo de producción requiere el ID explícito del vendedor real; si todavía no
está configurado, no desplegarlo esperando mantener habilitada la contratación.
El Contract posterior está fuera de `migrations/` y no debe aplicarse en esta prueba.

## 2. Designar una cuenta ficticia (manual, no se crea automáticamente)

Registrar una cuenta nueva de Propi, completar el onboarding sin publicar el perfil
y sin cargar propiedades o colecciones. Para empezar, usar email y contraseña:
no hace falta cambiar Google ni el Site URL de Supabase.

Copiar su UUID de Supabase Auth y ejecutar como administrador, sustituyendo el UUID:

```sql
insert into private.billing_test_account(owner_id)
values ('UUID-DEL-USUARIO-FICTICIO');
```

Esta inserción es un cambio remoto separado que requiere autorización. No usar una
cuenta real. La base rechaza cuentas publicadas, con propiedades, colecciones,
facturación previa o plan Pro; el administrador sigue siendo responsable de
elegir una cuenta realmente ficticia. Sólo permite un usuario y no su reasignación.
El service role y los usuarios normales no pueden designarlo.

## 3. Configurar únicamente `.env.local`

Conservar las variables actuales de Supabase. Las credenciales reales de Mercado
Pago permanecen en Vercel; no copiarlas al proceso local de prueba.

```dotenv
MERCADOPAGO_ENVIRONMENT=test
MERCADOPAGO_SELLER_ID=3779671542
BILLING_TEST_USER_ID=UUID-DEL-USUARIO-FICTICIO
MERCADOPAGO_ACCESS_TOKEN=TOKEN-DEL-VENDEDOR-FICTICIO
MERCADOPAGO_PRO_PLAN_ID=ID-DEL-PLAN-FICTICIO-EXISTENTE
MERCADOPAGO_WEBHOOK_SECRET=SECRETO-DE-SU-APLICACION
NEXT_PUBLIC_SITE_URL=https://DOMINIO-DEL-TUNEL
```

Los valores indicados son descripciones, no credenciales para copiar literalmente.
El token se verifica contra `/users/me`: debe ser de Argentina, llevar `test_user`
y pertenecer exactamente a **3779671542**. El modo test se rechaza en Vercel,
incluidos Preview y Production. El UUID debe coincidir con el registro SQL.

## 4. Abrir el túnel y configurar el webhook ficticio

Instalar `cloudflared` si no está disponible. En una terminal:

```powershell
cloudflared tunnel --url http://localhost:3100
```

Copiar su URL HTTPS en `NEXT_PUBLIC_SITE_URL`. Después, en otra terminal:

```powershell
npm.cmd run dev
```

Abrir **la URL del túnel**, no localhost, y mantener ambas terminales abiertas.
Next autoriza como origen de desarrollo sólo el hostname configurado.
Un nuevo túnel puede cambiar de URL: actualizar `.env.local`, reiniciar Next y
actualizar el webhook. No cambiar el plan ni su retorno almacenado: el servidor
usa el plan como catálogo y genera su checkout pendiente con retorno al túnel.

En la aplicación del vendedor ficticio de Mercado Pago, configurar el webhook:

```text
https://DOMINIO-DEL-TUNEL/api/mercadopago/webhook
```

Seleccionar **Planes y suscripciones** y **Pagos**. Para las credenciales de
producción del vendedor ficticio, configurar sus notificaciones en modo producción
de **esa cuenta ficticia**, no las de la aplicación del vendedor real. Copiar su
secreto a `.env.local` y reiniciar Next. No alterar el webhook real de Vercel.

## 5. Ejecutar una única prueba autorizada

Usar un comprador de prueba argentino distinto del vendedor y una tarjeta de
prueba oficial. No usar cuenta compradora ni tarjeta reales. En Propi, entrar
únicamente con la cuenta ficticia designada y contratar una vez.

Comprobar en el dashboard: autorización, primer pago aprobado verificado y acceso
Premium sólo para ese UUID. Un estado pendiente no habilita Pro. Si el primer
cobro demora, esperar el evento o usar la actualización de estado: no crear otra
suscripción. No invocar el cron global local, que está bloqueado en modo test.
El email del pagador debe ser el del comprador de Mercado Pago, no necesariamente
el del login de Propi.

El aislamiento se aplica a la sesión, al recurso canónico, al propietario y al
ledger de PostgreSQL; un cuerpo de webhook no concede beneficios. El registro
ficticio es visible para su dueño en la base compartida y nunca debe publicarse
como portfolio real. La clave administrativa sigue teniendo privilegios amplios,
y el túnel expone el servidor de desarrollo temporalmente: cerrarlo al terminar.

## 6. Cerrar la prueba y pasar a real

Cancelar desde el dashboard la suscripción **ficticia** y verificar la cancelación
con Mercado Pago. Después, deshabilitar exclusivamente la cuenta de prueba:

```sql
update private.billing_test_account
set enabled=false
where owner_id='UUID-DEL-USUARIO-FICTICIO';
```

Este cambio requiere autorización; revoca los beneficios ficticios inmediatamente,
conserva el historial y evita que ese UUID se convierta en cuenta de facturación
real. No borrar registros de usuarios reales ni aplicar limpiezas masivas. Apagar
el túnel y quitar su URL del webhook de la aplicación ficticia.

Para habilitar cobros reales en Vercel Production, configurar explícitamente:

- `MERCADOPAGO_ENVIRONMENT=production`.
- `MERCADOPAGO_SELLER_ID`: ID del vendedor **real**, nunca 3779671542.
- Token, plan y secreto de webhook de la aplicación **real**.
- `NEXT_PUBLIC_SITE_URL=https://propi-psi.vercel.app`.

No configurar `BILLING_TEST_USER_ID` en Vercel. Usar webhook real
`https://propi-psi.vercel.app/api/mercadopago/webhook` y retorno
`https://propi-psi.vercel.app/dashboard/billing/return`.
El plan ficticio no puede transferirse al vendedor real: configurar uno de ese
vendedor mediante el script administrativo ya existente, con autorización previa,
sin ejecutar la creación durante estas pruebas. El registro administrativo actual
es único; no usar `--create` ni sobrescribir su ID ficticio como paso automático.
El runtime usa el ID explícito del entorno, no modifica ese registro.

La prueba local no demuestra una renovación mensual futura ni certifica cobros
reales. Ningún token o ID de pago ficticio se promueve a producción.

Referencias oficiales:
- https://www.mercadopago.com.ar/developers/es/news/2023/11/16/Questions-on-how-to-test-your-integration--
- https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
