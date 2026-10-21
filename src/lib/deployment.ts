type Environment = Record<string, string | undefined>;

// PROPI_* values are non-secret build metadata in next.config.ts. Netlify only
// guarantees URL/SITE_ID/SITE_NAME at function runtime, not CONTEXT or NETLIFY.
export function hostingPlatform(env: Environment = process.env) {
  const baked = env === process.env ? process.env.PROPI_HOSTING_PLATFORM : env.PROPI_HOSTING_PLATFORM;
  if (baked === 'netlify' || env.SITE_ID || env.NETLIFY === 'true') return 'netlify';
  if (baked === 'vercel' || env.VERCEL || env.VERCEL_ENV) return 'vercel';
  return 'local';
}

export function isNetlifyPreview(env: Environment = process.env) {
  const context = env === process.env ? process.env.PROPI_DEPLOY_CONTEXT : env.PROPI_DEPLOY_CONTEXT;
  return hostingPlatform(env) === 'netlify' && context !== 'production';
}

export function isHostedDeployment(env: Environment = process.env) {
  return hostingPlatform(env) !== 'local';
}

export function cronProviderEnabled(env: Environment = process.env) {
  if (isNetlifyPreview(env)) return false;
  const provider = env.BILLING_CRON_PROVIDER;
  const host = hostingPlatform(env);
  // Existing Vercel/local behavior is preserved. A new Netlify site is off by default.
  if (!provider) return host !== 'netlify';
  return ['vercel', 'netlify'].includes(provider) && provider === host;
}
