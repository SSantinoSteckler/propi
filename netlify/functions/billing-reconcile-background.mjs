import { runReconciliation } from '../lib/billing-cron.mjs';

// The platform returns 202 before execution. Authentication and published-deploy
// checks remain mandatory before invoking the protected reconciliation endpoint.
export default async function handler(request, context) {
  console.info(JSON.stringify(await runReconciliation(request, context)));
}

export const config = { background: true };
