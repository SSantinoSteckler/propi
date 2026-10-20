import { test, expect } from '@playwright/test';
import { billingPresentation } from '../src/lib/billing/presentation';
import type { BillingStatus } from '../src/lib/billing/types';

const free: BillingStatus = {
  catalog: { name: 'Propi Premium', amount: 14900, currency: 'ARS' }, available: true,
  entitlements: { plan: 'free', premium: false, access_until: null }, agreement: null, payments: [],
};
const pending: NonNullable<BillingStatus['agreement']> = {
  id: 'fixture', amount: 14900, currency: 'ARS', status: 'pending', creation_state: 'ready',
  next_payment_date: null, last_synced_at: null, sync_error: false,
};

test('Free sin solicitud no tiene cancelación ni renovación y permite contratar', () => {
  expect(billingPresentation(free)).toMatchObject({ open: false, canCancel: false, checkoutPending: false, canCheckout: true });
});

test('checkout pendiente se cancela como solicitud sin presentarlo como renovación de Free', () => {
  expect(billingPresentation({ ...free, agreement: pending })).toMatchObject({
    canCancel: true, cancelLabel: 'Cancelar contratación', checkoutPending: true, canCheckout: true,
  });
  for (const creation_state of ['creating', 'uncertain'] as const) {
    expect(billingPresentation({ ...free, agreement: { ...pending, creation_state } })).toMatchObject({ canCheckout: false, canCancel: false });
  }
  expect(billingPresentation({ ...free, agreement: { ...pending, creation_state: 'failed' } })).toMatchObject({ canCancel: false, canCheckout: true });
});

test('autorización sin pago mantiene Free y permite cancelar la suscripción, sin contratar otra', () => {
  for (const status of ['authorized', 'paused']) {
    expect(billingPresentation({ ...free, agreement: { ...pending, status } })).toMatchObject({
      canCheckout: false, canCancel: true, checkoutPending: false, cancelLabel: 'Cancelar suscripción',
    });
  }
});

test('Premium pagado permite cancelar renovación; cancelado conserva acceso sin ofrecer otra cancelación', () => {
  const pro: BillingStatus = { ...free, entitlements: { plan: 'pro', premium: true, access_until: '2026-11-20T00:00:00Z' }, agreement: { ...pending, status: 'authorized', amount: 50 } };
  expect(billingPresentation(pro)).toMatchObject({ canCancel: true, canCheckout: false, cancelLabel: 'Cancelar renovación' });
  for (const status of ['cancelled', 'canceled']) {
    expect(billingPresentation({ ...pro, agreement: { ...pending, status } })).toMatchObject({ canCancel: false, canceled: true, canCheckout: false });
    expect(billingPresentation({ ...free, agreement: { ...pending, status } })).toMatchObject({ canCancel: false, canCheckout: true });
  }
});

test('checkout de otro importe puede cancelarse sin habilitar otro checkout ni cambiar importes', () => {
  const data = { ...free, available: false, agreement: { ...pending, amount: 50 } };
  expect(billingPresentation(data)).toMatchObject({ priceConflict: true, canCheckout: false, canCancel: true, cancelLabel: 'Cancelar contratación' });
  expect(data.agreement.amount).toBe(50);
  expect(billingPresentation({ ...free, available: false })).toMatchObject({ priceConflict: false, canCheckout: false, canCancel: false });
});
