# Transición de facturación: Expand → aplicación nueva → Contract

Estado confirmado por el operador el 2026-10-20: **Expand ya está aplicado en
Production**. Las 16 secciones del inventario dieron OK; la verificación confirmó
Contract desactivado, tres respaldos, RPC antigua idéntica, tablas ficticias
vacías, cero anomalías y cero diferencias de Premium. Existe una suscripción
Free y ningún pago. **No volver a ejecutar Expand ni ejecutar Contract**.
No se cambiaron credenciales. Los pasos 1 y 2 siguientes se conservan como
procedimiento de referencia; no son tareas pendientes de esta instalación.

El operador confirmó que el despliegue activo de Production es
`acf6420992e41790fa3952f0ad933f4f96378ce3`. La falta de snapshot histórico impide
demostrar retrospectivamente igualdad de todos los datos; el circuito HTTP real
de Mercado Pago aún no fue ejecutado.

## Qué se conserva

Expand no cambia el cuerpo, firma, identidad ni permisos de
`public.billing_apply_sync(uuid,uuid,jsonb,jsonb)`. Las tablas y rutas usadas por
el servidor anterior conservan sus nombres. Altas antiguas omiten el vendedor y
entran en `environment='legacy', seller_id=NULL`. Las sincronizaciones antiguas
continúan usando el mismo contrato y dejan explícitamente desconocido el vendedor.
No hay backfill de usuarios, estados o importes, ni una nueva marca de verificación
de sus pagos. Se mantiene su cobertura anterior; retirar beneficios históricos
sin conocer su procedencia sería un cambio de negocio fuera de esta migración.

El servidor nuevo usa `billing_apply_sync_v2` con entorno y vendedor obligatorios.
Sólo después de consultar los recursos canónicos puede promover un acuerdo legacy
a producción con vendedor conocido. Los pagos históricos no se promueven por esa
sola operación: se actualizan al reconciliar su factura. Los eventos fallidos o
ignorados sin correlación mantienen `legacy`.

Las tablas `billing_test_agreements`, `billing_test_payments` y
`billing_test_webhook_events` tienen RLS y propietario controlado. Están separadas
porque el cron viejo usa `service_role`, ignora el entorno y evita RLS: un filtro
en código nuevo o una policy no podrían impedir que leyera pruebas mezcladas en
sus tablas. Ningún cron viejo puede descubrir pruebas consultando sus tablas
originales. No se duplica infraestructura ni se mueven registros existentes.

## 1. Verificar antes de autorizar

1. Vercel → Deployments → Production activo → Source: copiar el SHA completo.
2. Actualizar las referencias Git en una terminal con acceso a GitHub y disponer
   localmente de ese commit. No hacer push a main.
3. Ejecutar las pruebas incluyendo ese SHA:

   ```powershell
   $env:BILLING_DEPLOYED_COMMIT = 'SHA-COMPLETO-DEL-DESPLIEGUE'
   npm.cmd run test:db
   Remove-Item Env:BILLING_DEPLOYED_COMMIT
   npm.cmd run typecheck
   npm.cmd test
   npm.cmd run build
   ```

4. En SQL Editor, ejecutar **sólo**
   `supabase/diagnostics/billing-isolation-before.sql` y guardar los resultados.
   Es de lectura. Confirmar que existen las migraciones previas y no hay una
   instalación parcial del borrador. Revisar tamaño, actividad, permisos y planes.

La migración compara las tres funciones previas con huellas del SQL auditado y
aborta si encuentra una personalización. No quitar ese control para forzarla:
primero revisar la diferencia. El backup conserva sus definiciones exactas en
una tabla privada sin acceso del servidor o del navegador.

## 2. Expand, sólo con autorización separada

Aplicar **una sola vez**, completo:
`supabase/migrations/202610200002_billing_isolation.sql`.

Es transaccional, con `lock_timeout=2s` y `statement_timeout=15s` por sentencia.
Las columnas tienen defaults constantes; los CHECK existentes se agregan
`NOT VALID` para evitar el escaneo inicial. Los índices se crean únicamente al
crear las tablas vacías de pruebas. No hay builds de índices en tablas pobladas.
No elimina tablas o filas. Los únicos DROP CONSTRAINT quitan checks de producción
copiados en las tablas de prueba nuevas y vacías, para reemplazarlos por checks test.

Si no puede adquirir un bloqueo, **aborta** en lugar de esperar indefinidamente.
Ejecutar ROLLBACK en esa sesión, verificar que no quedó la expansión y revisar
la actividad antes de reintentar. No partir el SQL ni ejecutarlo repetidamente.
Puede existir latencia breve: los timeouts no son una garantía de cero bloqueos.

Después ejecutar `supabase/diagnostics/billing-isolation-after.sql`.
Esperado: producción original sin cambios de estado/importe, registros previos
legacy, seller NULL, tabla de usuario ficticio vacía, tres backups,
`contracted=false`, permisos de RPC antiguos conservados y v2 sólo para servidor.
Probar login, portfolio y publicación normales, sin iniciar un pago.

## 3. Despliegue progresivo y prueba local

Orden de publicación de esta revisión:

1. Revisar el diff y las pruebas antes de autorizar un commit o push.
2. Con autorización, publicar exclusivamente en `staging`. Su push puede generar
   automáticamente un Preview de Vercel. No modificar `main` en ese paso.
3. Comprobar en Preview login, portfolio, publicación y configuración; no iniciar
   cobros. El modo ficticio está limitado a Next.js local, no se habilita en Vercel.
4. Antes de promover a `main`, verificar en Vercel las variables de servidor del
   vendedor real. El plan ficticio existente no sirve para cobros de Production.
   Si todavía no están listas, la facturación nueva permanecerá cerrada; no
   habilitar contratación ni anunciar Premium como operativo.
5. Solicitar autorización separada para la promoción a `main`, que puede disparar
   el despliegue Production. No aplicar SQL como parte de esa promoción.
6. Si falla el despliegue, volver al binario `acf6420`, manteniendo Expand aplicado.
   No ejecutar el script de restauración de funciones como rollback rutinario.

El servidor anterior puede seguir activo después de Expand. La prueba local
usa la guía `MERCADOPAGO-PRUEBA-LOCAL.md`, con UUID designado por administrador,
vendedor fijo 3779671542, comprador/tarjeta de prueba y túnel HTTPS.

Cuando se despliegue el nuevo servidor de Production, verificar primero sus
variables de servidor: `MERCADOPAGO_ENVIRONMENT=production` y el ID/token/plan/secreto
del vendedor real. Los valores reales se configuran por separado, no se copian del
entorno ficticio. Si el ID no está configurado o el vendedor es ficticio, el nuevo
servidor cierra la facturación. No alterar esas credenciales como parte de Expand.

Webhooks y cron deben seguir apuntando al dominio público de Production. El código
nuevo lee producción más legacy, nunca las tablas ficticias. La reconciliación
canónica migra gradualmente los acuerdos. No inventar seller_id por SQL ni cambiar
`verified` para que los controles pasen. Un acuerdo fallido sin suscripción real
puede conservar su procedencia legacy y no otorga Premium.

## 4. Contract (pospuesto)

Archivo: `supabase/deferred/202610200003_billing_contract.sql`.
Está deliberadamente fuera de `migrations/`, para que `supabase db push` no lo ejecute.

No es necesario para la única prueba. Ejecutarlo sólo con autorización nueva,
después de verificar el SHA del nuevo servidor, retirar/proteger despliegues viejos
y sus tareas pendientes, y revisar `billing-contract-readiness.sql`.
Bloquea si quedan acuerdos no fallidos, pagos o eventos pendientes/erróneos de
procedencia desconocida. No fuerza ni rellena esa procedencia para superar el bloqueo.

Al aplicarse, el flag `contracted` rechaza nuevas escrituras legacy y la RPC
antigua conserva su firma pero exige el snapshot v2. Éste es el punto explícito
de retirada del servidor viejo. No eliminar columnas o historial.

## Reversión

- **Error antes del COMMIT:** ROLLBACK en la misma sesión. Las pruebas inducen un
  error de DDL para demostrar que se conservan esquema original y cobertura.
- **Rollback del despliegue durante Expand:** volver al binario anterior; mantener
  el esquema expandido. No borrar las tablas de pruebas ni reejecutar migraciones.
  El aislamiento físico sigue evitando que el servidor viejo procese sus registros.
- **Restaurar funciones / deshacer Contract:** detener la prueba local y, con nueva
  autorización, aplicar `supabase/rollback/billing-restore-compatibility.sql`.
  Restaura las tres definiciones capturadas en la base real y `contracted=false`;
  no elimina datos ni columnas. CREATE OR REPLACE conserva propietarios y ACL,
  que Expand/Contract no alteran. Confirmar el diagnóstico y las definiciones.
  Restaurar el cálculo anterior deshabilita Premium ficticio; su historial sigue
  físicamente separado. Este script no revierte cancelaciones o cobros del proveedor.
  Para reactivar después el cálculo de pruebas, preparar un avance de funciones
  revisado; no volver a ejecutar Expand sobre objetos existentes.

## Evidencia y límites

`scripts/test-billing-compatibility.mjs` carga TypeScript real desde Git, no una
reescritura de sus reglas: `origin/main` acf6420992e41790fa3952f0ad933f4f96378ce3
y `origin/staging` 83f849c677ca394cef85d82d3caca9c917061f16 en esta revisión.
Se prueban altas, webhook HTTP firmado/duplicado, cron, cancelación, permisos y
Premium de ambos servidores, incluyendo recursos promovidos por v2 que vuelve a
procesar el binario anterior. La API del proveedor está simulada; Postgres corre
en PGlite, sin Docker, sin modificar datos remotos ni ejecutar pagos.

El SHA activo fue confirmado por el operador y se incluye explícitamente mediante
`BILLING_DEPLOYED_COMMIT` en las pruebas. La conexión de este entorno a GitHub
no permitió refrescar las referencias remotas: comprobar que nadie haya agregado
commits antes del push. No usar force-push. La compatibilidad probada corresponde
al SHA indicado, no a eventuales despliegues posteriores.

La clave administrativa sigue siendo privilegiada. Un servidor viejo mal
configurado con un vendedor ficticio podría interpretar pagos como antes: su RPC
no recibe el vendedor y no puede demostrar su identidad en SQL. Expand no inventa
ese dato ni cambia silenciosamente los beneficios previos; el nuevo flujo de
prueba sí está aislado y validado. Los cobros/renovaciones reales y la contención
de bloqueos bajo tráfico real siguen necesitando validación operativa.
