import type { BillingStatus } from './types';

// Presentation only. Access and cancellation are still validated by the server.
export function billingPresentation(data: BillingStatus) {
  const a = data.agreement;
  const canceled = Boolean(a && ['cancelled', 'canceled'].includes(a.status));
  const open = Boolean(a && !canceled && a.creation_state !== 'failed');
  const ready = a?.creation_state === 'ready';
  const checkoutPending = Boolean(open && a?.status === 'pending');
  const renewable = Boolean(open && ready && ['authorized', 'paused'].includes(a!.status));
  const cancelLabel = checkoutPending ? 'Cancelar solicitud' : data.entitlements.premium ? 'Cancelar renovación' : 'Cancelar suscripción';
  return {
    canceled, open, checkoutPending,
    priceConflict: Boolean(open && Number(a!.amount) !== data.catalog.amount),
    canCancel: Boolean(ready && (checkoutPending || renewable)),
    canCheckout: Boolean(!data.entitlements.premium && data.available && (!open || (checkoutPending && ready))),
    cancelLabel,
  };
}
