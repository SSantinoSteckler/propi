import { dispatchReconciliation } from '../lib/billing-cron.mjs';

// Schedule lives in netlify.toml. Only dispatch work; scheduled execution is capped at 30s.
export default async function handler(_request, context) {
  console.info(JSON.stringify(await dispatchReconciliation(context)));
  return new Response(null, { status: 204 });
}
