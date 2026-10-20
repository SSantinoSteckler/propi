# Comprobar Expand ya aplicado: Production acf6420

No ejecutar otra vez Expand, Contract ni la restauración de funciones para hacer
esta comprobación. No se necesita ningún token, UUID ni variable de entorno.
El mensaje «Success. No rows returned» es compatible con un script que termina
en COMMIT sin SELECT; no es el resultado de una auditoría.

## Paso 1: inventario y permisos

En Supabase SQL Editor, como administrador, ejecutar completo:
`supabase/diagnostics/billing-expand-inventory.sql`.

El archivo abre una transacción READ ONLY, limita esperas de bloqueo a 2 segundos
y cada sentencia a 15 segundos. Sólo consulta catálogos de PostgreSQL. No crea
objetos ni ejecuta funciones financieras. Si no existe algún objeto, devuelve
REVISAR en lugar de intentar crearlo.

Todas sus filas deben indicar **OK**. Comprueba tablas, columnas y defaults,
13 funciones contra huellas de sus cuerpos auditados, firma RPC antigua,
triggers activos, índices, checks, claves foráneas, RLS, policies de las tablas
test y privilegios efectivos de anon/authenticated/service_role.
La salida agrupa los controles por sección para no depender del límite de filas
del editor. La columna `revisar` identifica exactamente los controles fallidos;
`detalle` contiene el inventario sin mostrar cuerpos de funciones ni datos de usuarios.

Los checks de ámbito en las tres tablas originales fueron creados NOT VALID para
evitar un escaneo de instalación: `validado=false` en su detalle es esperado.
Esto no significa que RLS esté desactivado. No ejecutar VALIDATE CONSTRAINT como
parte de esta comprobación.

Si aparece REVISAR, guardar ese resultado y detenerse. No corregir permisos,
ejecutar rollback ni volver a migrar automáticamente. Un permiso personalizado
también puede producir REVISAR y requiere interpretación, no borrado automático.

## Paso 2: estado, integridad y Premium

Sólo si el inventario está OK, ejecutar completo:
`supabase/diagnostics/billing-expand-verify.sql`.

Esta transacción es también READ ONLY y usa un snapshot consistente. Sólo llama
los getters de permisos (`private.effective_plan` y `billing_get_entitlements`),
cuyos cuerpos se verificaron en el paso anterior. No llama billing_apply_sync,
billing_apply_sync_v2, webhooks, cron o Mercado Pago.

Interpretación:

| Comprobación | Esperado |
| --- | --- |
| `contract_no_ejecutado` | OK, una fila de configuración con `contracted=false` |
| `tres_respaldos_de_funciones` | OK, 3 definiciones capturadas |
| `definicion_identica_al_respaldo` | OK: la RPC antigua coincide exactamente con la guardada al aplicar Expand |
| `TEST SIN INICIAR` | OK, cuatro conteos en cero: registro administrativo y tres tablas test |
| `INTEGRIDAD` | OK, todos los conteos de anomalías en cero |
| `usuarios_reales_con_formula_anterior` | OK, cero diferencias entre la fórmula de acf6420 sobre los datos actuales y el cálculo instalado |
| `rpc_lectura_coherente` | OK, el getter del servidor devuelve el mismo plan/booleano Premium |
| `DATOS` informativos | Conteos por entorno, estados, planes, importes y monedas; no es un test de igualdad histórica |
| `sin_comparacion_historica` | NO_DEMOSTRABLE: requiere una captura/export anterior independiente |
| `operacion_http_y_mercado_pago` | NO_EJECUTADA: no se hicieron pruebas financieras ni HTTP |

Mientras sólo esté activo acf6420, los registros del flujo antiguo permanecen en
`legacy`, con vendedor NULL. Eso es esperado y no implica pérdida de pagos. Un
vendedor conocido no debe atribuirse por SQL para que el diagnóstico pase.

La comparación Premium reproduce la regla anterior, incluso beneficios manuales,
fechas de cobertura y cancelaciones con acceso abonado vigente. No compara
simplemente `subscriptions.plan`: ese campo puede ser una caché desactualizada.
Si hay cero usuarios, informa cero evaluados; no inventa una prueba positiva.

Si hay una diferencia, las tablas de prueba no están vacías o algún control da
REVISAR, compartir las filas relevantes antes de actuar. Si un archivo produce
un error SQL, ejecutar ROLLBACK en esa misma sesión y compartir el mensaje;
eso no autoriza repetir la migración.

## Qué permite concluir

Con ambos resultados esperados, el estado observado mantiene el contrato SQL
requerido por acf6420992e41790fa3952f0ad933f4f96378ce3. Su código real ya fue
probado localmente con Expand para contratación, webhook duplicado, reconciliación,
cancelación y Premium usando proveedor simulado y PostgreSQL temporal.

La auditoría remota sólo puede confirmarse tras revisar los resultados del operador.
No prueba autenticación HTTP de Supabase, credenciales de Vercel, entrega real de
webhooks, cobros o disponibilidad del proveedor. Tampoco reconstruye los valores
anteriores de las tablas: el backup de Expand contiene funciones, no sus filas.

Los resultados no incluyen emails, nombres de clientes, UUIDs de usuarios,
referencias de compradores ni secretos. No compartir credenciales para ejecutarlos.
