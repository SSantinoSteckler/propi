# Precio temporal global: AR$ 50 por mes

El servidor fija AR$ 50 para todas las nuevas contrataciones mediante
`temporaryAmount` en `src/lib/billing/catalog.json`. No requiere un UID ni
variables nuevas. El navegador no decide el importe.

El checkout existente crea suscripciones sin asociacion formal al plan. El plan
comercial permanece en AR$ 14.900: no hay que modificarlo ni crear otro.

## Publicacion y prueba

1. Publicar el codigo revisado con autorizacion para commit, push y despliegue.
2. Mantener las credenciales reales existentes, el vendedor 1355208203, el plan
   comercial y su webhook. No ejecutar migraciones ni modificar Supabase.
3. Comprobar que Facturacion muestre AR$ 50 por mes y el aviso de cobro real
   recurrente. La cuenta ficticia reservada sigue bloqueada en produccion.
4. Iniciar una unica contratacion manualmente y verificar tambien AR$ 50 en
   Mercado Pago antes de autorizar el pago. No confirmar otro importe. El
   proveedor puede rechazar el importe o el medio de pago; su aceptacion queda
   pendiente de la prueba real. Premium requiere un pago verificado.
5. Tras comprobar el pago aprobado y Premium, cancelar la renovacion desde
   Propi para evitar nuevos cobros de prueba. No hay cancelacion ni reembolso
   automaticos. Puede haber comisiones del proveedor.

Las suscripciones existentes conservan su importe. Un checkout pendiente con
otro precio queda bloqueado para nuevas contrataciones hasta revisarlo; no se
modifica ni cancela automaticamente. La cancelacion sigue disponible.

## Restaurar AR$ 14.900

Quitar unicamente `temporaryAmount` de `catalog.json` y publicar nuevamente.
El precio de las nuevas contrataciones vuelve a AR$ 14.900. Las suscripciones
creadas a AR$ 50 conservan ese importe recurrente hasta su cancelacion o una
modificacion explicita: restaurar el catalogo no las aumenta automaticamente.
La sincronizacion sigue validando cada pago contra el importe de su acuerdo.

Durante la ventana de prueba cualquier usuario habilitado puede contratar a
AR$ 50. Conservar el historial real; no trasladarlo a tablas ficticias.
Este cambio no ejecuta pagos, no cambia credenciales ni configura Vercel.
