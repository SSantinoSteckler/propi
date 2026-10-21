import { test, expect } from '@playwright/test';
import { netlifyBuildEnvironment } from '../scripts/build-netlify.mjs';
import { dispatchReconciliation, runReconciliation } from '../netlify/lib/billing-cron.mjs';
import { hostingPlatform, isNetlifyPreview, cronProviderEnabled } from '../src/lib/deployment';
import { billingScope } from '../src/lib/billing/scope';
import { validatePlan } from '../src/lib/billing/domain';
import { GET as cron } from '../src/app/api/billing/reconcile/route';

const previewUrl = 'https://deploy-preview-7--propi-fixture.netlify.app';
const site = 'https://propi-fixture.netlify.app';
const secret = 'fixture-cron-secret-not-real-at-least-32-characters';
const published = { deploy: { context: 'production', published: true } };
const settings = { BILLING_CRON_PROVIDER: 'netlify', URL: site, NEXT_PUBLIC_SITE_URL: site, CRON_SECRET: secret };
const scheduledRequest = () => new Request(`${site}/.netlify/functions/billing-reconcile-background`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` } });

test('build Netlify genera URL de Preview y no admite claves privadas heredadas', () => {
  const env = { NETLIFY: 'true', CONTEXT: 'deploy-preview', DEPLOY_PRIME_URL: previewUrl, NEXT_PUBLIC_SITE_URL: 'https://old.example' };
  expect(netlifyBuildEnvironment(env).NEXT_PUBLIC_SITE_URL).toBe(previewUrl);
  for (const key of ['SUPABASE_SECRET_KEY', 'MERCADOPAGO_ACCESS_TOKEN', 'MERCADOPAGO_WEBHOOK_SECRET', 'CRON_SECRET']) {
    expect(() => netlifyBuildEnvironment({ ...env, [key]: 'fixture' })).toThrow('NETLIFY_PREVIEW_MUST_NOT_HAVE_PRIVATE_CREDENTIALS');
  }
  expect(netlifyBuildEnvironment({ NETLIFY: 'true', CONTEXT: 'production', URL: site }).NEXT_PUBLIC_SITE_URL).toBe(site);
  expect(() => netlifyBuildEnvironment({ NETLIFY: 'true', CONTEXT: 'production', URL: site, NEXT_PUBLIC_SITE_URL: 'https://old.example' })).toThrow('MISMATCH');
  expect(() => netlifyBuildEnvironment({})).toThrow('NETLIFY_BUILD_CONTEXT_REQUIRED');
  for (const url of ['http://localhost:3100', 'https://user:pass@propi.example', `${site}/path`, `${site}?next=evil`]) {
    expect(() => netlifyBuildEnvironment({ ...env, DEPLOY_PRIME_URL: url })).toThrow('NETLIFY_SITE_URL_INVALID');
  }
});

test('metadata de build bloquea facturación Preview y modo ficticio alojado, aun sin NETLIFY/CONTEXT en runtime', () => {
  for (const context of ['deploy-preview', 'branch-deploy', 'unknown', undefined]) {
    const env = { SITE_ID: 'fixture', PROPI_DEPLOY_CONTEXT: context, MERCADOPAGO_ENVIRONMENT: 'production', MERCADOPAGO_SELLER_ID: '1355208203' };
    expect(hostingPlatform(env)).toBe('netlify'); expect(isNetlifyPreview(env)).toBe(true);
    expect(() => billingScope(env)).toThrow('BILLING_PREVIEW_DISABLED');
  }
  const production = { SITE_ID: 'fixture', PROPI_DEPLOY_CONTEXT: 'production', MERCADOPAGO_ENVIRONMENT: 'production', MERCADOPAGO_SELLER_ID: '1355208203' };
  expect(billingScope(production).sellerId).toBe('1355208203');
  expect(() => billingScope({ ...production, MERCADOPAGO_ENVIRONMENT: 'test', MERCADOPAGO_SELLER_ID: '3779671542', BILLING_TEST_USER_ID: '11111111-1111-4111-8111-111111111111' })).toThrow('INVALID_TEST_CONFIGURATION');
});

test('selector de cron conserva Vercel y mantiene Netlify apagado hasta el cambio explícito', () => {
  const vercel = { VERCEL: '1', VERCEL_ENV: 'production' };
  const netlify = { SITE_ID: 'fixture', PROPI_DEPLOY_CONTEXT: 'production' };
  expect(cronProviderEnabled(vercel)).toBe(true);
  expect(cronProviderEnabled(netlify)).toBe(false);
  for (const provider of ['vercel', 'netlify', 'off', 'invalid']) {
    expect(cronProviderEnabled({ ...vercel, BILLING_CRON_PROVIDER: provider })).toBe(provider === 'vercel');
    expect(cronProviderEnabled({ ...netlify, BILLING_CRON_PROVIDER: provider })).toBe(provider === 'netlify');
  }
  expect(cronProviderEnabled({ ...netlify, PROPI_DEPLOY_CONTEXT: 'branch-deploy', BILLING_CRON_PROVIDER: 'netlify' })).toBe(false);
});

test('endpoint apagado sigue exigiendo CRON_SECRET y no consulta base ni proveedor', async () => {
  const names = ['CRON_SECRET', 'BILLING_CRON_PROVIDER'];
  const before = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.CRON_SECRET = secret; process.env.BILLING_CRON_PROVIDER = 'off';
    expect((await cron(new Request(`${site}/api/billing/reconcile`))).status).toBe(401);
    expect((await cron(new Request(`${site}/api/billing/reconcile`, { headers: { Authorization: `Bearer ${secret}` } }))).status).toBe(204);
  } finally { for (const name of names) if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name]; }
});

test('plan original se conserva con retorno de catálogo fijado por servidor y checkout en nuevo sitio', () => {
  const oldReturn = 'https://propi-psi.vercel.app/dashboard/billing/return';
  const newReturn = `${site}/dashboard/billing/return`;
  const plan = { id: 'fixture-plan', collector_id: 1355208203, status: 'active', reason: 'Propi Premium', back_url: oldReturn, auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 14900, currency_id: 'ARS' } };
  expect(() => validatePlan(plan, '1355208203', newReturn)).toThrow('PLAN_MISMATCH');
  expect(() => validatePlan(plan, '1355208203', newReturn, false, oldReturn)).not.toThrow();
  for (const changed of [{ ...plan, back_url: 'https://evil.example/dashboard/billing/return' }, { ...plan, collector_id: 3779671542 }, { ...plan, auto_recurring: { ...plan.auto_recurring, transaction_amount: 50 } }]) {
    expect(() => validatePlan(changed, '1355208203', newReturn, false, oldReturn)).toThrow('PLAN_MISMATCH');
  }
  expect(plan.back_url).toBe(oldReturn);
});

test('cron nativo no despacha en Preview, despliegue anterior o sin activación, incluso con credenciales', async () => {
  const send = async () => { throw new Error('Unexpected network'); };
  for (const context of [{}, { deploy: { context: 'deploy-preview', published: true } }, { deploy: { context: 'production', published: false } }]) {
    expect((await dispatchReconciliation(context, settings, send)).code).toBe('BILLING_CRON_DISABLED');
    expect((await runReconciliation(scheduledRequest(), context, settings, send)).code).toBe('BILLING_CRON_DISABLED');
  }
  expect((await dispatchReconciliation(published, { ...settings, BILLING_CRON_PROVIDER: '' }, send)).code).toBe('BILLING_CRON_DISABLED');
});

test('programador solo encola y worker exige firma Bearer antes de invocar el endpoint existente', async () => {
  let calls = 0;
  const queued = await dispatchReconciliation(published, settings, async (url: string, init: RequestInit) => {
    calls++; expect(url).toBe(`${site}/.netlify/functions/billing-reconcile-background`);
    expect(init.method).toBe('POST'); expect(init.redirect).toBe('error'); expect(init.signal).toBeTruthy();
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${secret}`);
    return new Response(null, { status: 202 });
  });
  expect(queued.code).toBe('BILLING_CRON_DISPATCHED'); expect(calls).toBe(1);
  await expect(runReconciliation(new Request(site), published, settings, async () => { throw new Error('Must not be called'); })).rejects.toThrow('BILLING_CRON_UNAUTHORIZED');
  const result = await runReconciliation(scheduledRequest(), published, settings, async (url: string, init: RequestInit) => {
    expect(url).toBe(`${site}/api/billing/reconcile`); expect(init.redirect).toBe('error');
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${secret}`);
    return Response.json({ synced: 2, failed: 0 });
  });
  expect(result).toEqual({ code: 'BILLING_CRON_COMPLETED', synced: 2, failed: 0 });
});

test('cron rechaza redirecciones, origen incorrecto, respuestas fallidas y errores con secretos sin filtrarlos', async () => {
  const blocked = async () => { throw new Error('Must not be called'); };
  for (const URL of ['http://localhost', 'https://user:pass@evil.example', 'https://evil.example']) {
    await expect(dispatchReconciliation(published, { ...settings, URL }, blocked)).rejects.toThrow('BILLING_CRON_ORIGIN_INVALID');
  }
  await expect(dispatchReconciliation(published, settings, async () => new Response(null, { status: 302 }))).rejects.toThrow('BILLING_CRON_DISPATCH_FAILED');
  await expect(dispatchReconciliation(published, settings, async () => { throw new Error(secret); })).rejects.toThrow('BILLING_CRON_DISPATCH_FAILED');
  await expect(runReconciliation(scheduledRequest(), published, settings, async () => Response.json({ synced: 1, failed: 1 }))).rejects.toThrow('BILLING_CRON_RECONCILIATION_FAILED');
  await expect(runReconciliation(scheduledRequest(), published, settings, async () => Response.json({ secret }))).rejects.toThrow('BILLING_CRON_RESPONSE_INVALID');
  await expect(runReconciliation(scheduledRequest(), published, settings, async () => Response.json({ secret }, { status: 503 }))).rejects.toThrow('BILLING_CRON_REQUEST_FAILED');
});
