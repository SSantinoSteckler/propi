import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

function origin(value) {
  let url;
  try { url = new URL(value || ''); } catch { throw new Error('NETLIFY_SITE_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash
    || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('NETLIFY_SITE_URL_INVALID');
  return url.origin;
}

/** @param {Record<string, string | undefined>} source */
export function netlifyBuildEnvironment(source = process.env) {
  if (source.NETLIFY !== 'true') throw new Error('NETLIFY_BUILD_CONTEXT_REQUIRED');
  if (!['production', 'deploy-preview', 'branch-deploy'].includes(source.CONTEXT)) throw new Error('NETLIFY_BUILD_CONTEXT_INVALID');
  const preview = source.CONTEXT !== 'production';
  if (preview && ['SUPABASE_SECRET_KEY', 'MERCADOPAGO_ACCESS_TOKEN', 'MERCADOPAGO_WEBHOOK_SECRET', 'CRON_SECRET'].some(key => source[key])) {
    throw new Error('NETLIFY_PREVIEW_MUST_NOT_HAVE_PRIVATE_CREDENTIALS');
  }
  const site = preview ? origin(source.DEPLOY_PRIME_URL) : origin(source.NEXT_PUBLIC_SITE_URL || source.URL);
  if (!preview && site !== origin(source.URL)) throw new Error('NETLIFY_PRODUCTION_SITE_URL_MISMATCH');
  return { ...source, NEXT_PUBLIC_SITE_URL: site };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const env = netlifyBuildEnvironment();
    console.info(JSON.stringify({ stage: 'netlify_build', context: env.CONTEXT, site: env.NEXT_PUBLIC_SITE_URL }));
    const require = createRequire(import.meta.url);
    const result = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build', '--webpack'], { env, stdio: 'inherit' });
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'NETLIFY_BUILD_CONFIGURATION_INVALID');
    process.exitCode = 1;
  }
}
