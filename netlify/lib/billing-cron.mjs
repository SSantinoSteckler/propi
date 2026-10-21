import { createHash, timingSafeEqual } from 'node:crypto';

/** @typedef {{deploy?: {context?: string, published?: boolean}}} DeployContext */

const enabled = (context, env) => env.BILLING_CRON_PROVIDER === 'netlify'
  && context?.deploy?.context === 'production' && context.deploy.published === true;

function configuration(env) {
  const secret = env.CRON_SECRET;
  if (!secret || secret.length < 32) throw new Error('BILLING_CRON_SECRET_MISSING');
  let url;
  try { url = new URL(env.URL); } catch { throw new Error('BILLING_CRON_ORIGIN_INVALID'); }
  // URL is reserved by Netlify. Never send CRON_SECRET to an origin from a request.
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash
    || url.origin !== env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')) throw new Error('BILLING_CRON_ORIGIN_INVALID');
  return { secret, origin: url.origin };
}

/**
 * @param {DeployContext} context
 * @param {Record<string, string | undefined>} env
 * @param {(input: string, init: RequestInit) => Promise<Response>} send
 */
export async function dispatchReconciliation(context, env = process.env, send = fetch) {
  if (!enabled(context, env)) return { code: 'BILLING_CRON_DISABLED' };
  const { secret, origin } = configuration(env);
  let response;
  try {
    response = await send(`${origin}/.netlify/functions/billing-reconcile-background`, {
      method: 'POST', headers: { Authorization: `Bearer ${secret}` },
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
  } catch { throw new Error('BILLING_CRON_DISPATCH_FAILED'); }
  if (response.status !== 202) throw new Error('BILLING_CRON_DISPATCH_FAILED');
  return { code: 'BILLING_CRON_DISPATCHED' };
}

/**
 * @param {Request} request
 * @param {DeployContext} context
 * @param {Record<string, string | undefined>} env
 * @param {(input: string, init: RequestInit) => Promise<Response>} send
 */
export async function runReconciliation(request, context, env = process.env, send = fetch) {
  if (!enabled(context, env)) return { code: 'BILLING_CRON_DISABLED' };
  const { secret, origin } = configuration(env);
  const digest = value => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(digest(request.headers.get('authorization') || ''), digest(`Bearer ${secret}`))) {
    throw new Error('BILLING_CRON_UNAUTHORIZED');
  }
  let response;
  try {
    response = await send(`${origin}/api/billing/reconcile`, {
      headers: { Authorization: `Bearer ${secret}` }, cache: 'no-store',
      redirect: 'error', signal: AbortSignal.timeout(55000),
    });
  } catch { throw new Error('BILLING_CRON_REQUEST_FAILED'); }
  if (response.status === 204) return { code: 'BILLING_CRON_TARGET_DISABLED' };
  if (response.status !== 200) throw new Error('BILLING_CRON_REQUEST_FAILED');
  let result;
  try { result = await response.json(); } catch { throw new Error('BILLING_CRON_RESPONSE_INVALID'); }
  if (![result?.synced, result?.failed].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('BILLING_CRON_RESPONSE_INVALID');
  if (result.failed > 0) throw new Error('BILLING_CRON_RECONCILIATION_FAILED');
  return { code: 'BILLING_CRON_COMPLETED', synced: result.synced, failed: result.failed };
}
