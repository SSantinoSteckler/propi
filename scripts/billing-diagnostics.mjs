// Only emit controlled messages/codes. Provider messages may include private data.
export class BillingDatabaseError extends Error {
 constructor(category, message, operation, status, code, networkCode = null) {
  super(message);
  this.diagnostic = {category,operation,httpStatus:status || null,code:code || null,networkCode};
 }
}
export function databaseResult(result, operation, networkCode = null, httpEvidence = null) {
 if (!result.error) return result.data;
 const error = result.error;
 const code = /^[A-Z0-9]{2,12}$/.test(error.code || '') ? error.code : null;
 const status = result.status || 0;
 let category = 'SUPABASE_ERROR', message = 'Supabase devolvió un error no clasificado. Revisá el código y la operación; no se imprimen detalles privados.';
 if (networkCode || status === 0 || ['PGRST000','PGRST001','PGRST002','PGRST003'].includes(code) || code?.startsWith('08') || /fetch failed|network|timeout/i.test(error.message || '')) {
  category = 'CONNECTION_ERROR'; message = 'No se pudo conectar con Supabase. Esto no indica que falte una tabla ni una migración.';
 } else if (httpEvidence?.authFailureKind === 'BROWSER_USER_AGENT_BLOCK') {
  category = 'BROWSER_USER_AGENT_BLOCK'; message = 'El servidor rechazó el uso de la clave por contexto de navegador/User-Agent; no prueba que la clave sea inválida.';
 } else if (status === 401 && httpEvidence?.authFailureKind === 'AUTHENTICATION_REJECTED_UNSPECIFIED' && !['PGRST301','PGRST302','PGRST303'].includes(code)) {
  category = 'AUTHENTICATION_REJECTED'; message = 'HTTP 401 sin causa específica reconocida. Revisá el diagnóstico HTTP; no se atribuye automáticamente a una clave inválida.';
 } else if (status === 401 || ['PGRST301','PGRST302','PGRST303'].includes(code) || /invalid api key|invalid jwt|jwt expired/i.test(error.message || '')) {
  category = 'INVALID_CREDENTIALS'; message = 'Supabase rechazó las credenciales. Revisá SUPABASE_SECRET_KEY y que corresponda al proyecto de NEXT_PUBLIC_SUPABASE_URL.';
 } else if (code === '42501' || status === 403) {
  category = 'INSUFFICIENT_PERMISSIONS'; message = 'La credencial no tiene permisos administrativos. Usá una clave secret o service_role del mismo proyecto; no una clave pública.';
 } else if (['42P01','PGRST205'].includes(code)) {
  category = 'TABLE_NOT_FOUND'; message = 'La tabla no existe o no está disponible en la caché de la API. Confirmalo con supabase/diagnostics/billing.sql antes de aplicar migraciones.';
 } else if (['42883','PGRST202'].includes(code)) {
  category = 'FUNCTION_NOT_FOUND'; message = 'La función administrativa no existe o no está disponible en la caché de la API. Confirmalo con supabase/diagnostics/billing.sql.';
 }
 throw new BillingDatabaseError(category,message,operation,status,code,networkCode);
}
export function inspectAdminConfig(env, files) {
 const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SECRET_KEY || '';
 const keyHygiene = {hasWhitespace:/\s/u.test(key),hasLineBreaks:/[\r\n]/.test(key),hasQuotes:/["'`“”‘’]/u.test(key),hasNonAscii:/[^\x21-\x7e]/.test(key)};
 let projectHost = null, keyType = 'unknown', legacyRole = null, legacyProjectMatchesUrl = null;
 let urlIsProjectOrigin = false;
 try {
  const parsed = new URL(url); projectHost = parsed.hostname;
  urlIsProjectOrigin = (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))) && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash;
 } catch { /* Report only presence and invalid configuration. */ }
 if (key.startsWith('sb_secret_')) keyType = 'secret';
 else if (key.startsWith('sb_publishable_')) keyType = 'publishable';
 else {
  try {
   const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
   legacyRole = ['service_role','anon','authenticated'].includes(payload.role) ? payload.role : null;
   keyType = legacyRole ? 'legacy_jwt_unverified' : 'unknown';
   if (payload.ref && projectHost?.endsWith('.supabase.co')) legacyProjectMatchesUrl = payload.ref === projectHost.split('.')[0];
  } catch { /* An opaque or malformed key is checked by the API, never printed. */ }
 }
 const local = files.find(file => file.path === '.env.local')?.contents || '';
 const variables = Object.fromEntries(['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SECRET_KEY'].map(name => {
  const match = local.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^#\\r\\n]*))`,'m'));
  const literal = match ? (match[1] ?? match[2] ?? match[3]).trim() : null;
  return [name,{configured:Boolean(env[name]?.trim()),declaredInEnvLocal:Boolean(match),differsFromEnvLocal:literal !== null && !literal.includes('$') && literal !== env[name]}];
 }));
 return {envFiles:files.map(file => file.path),variables,projectHost,urlIsProjectOrigin,keyType,keyHygiene,legacyRole,legacyProjectMatchesUrl};
}
export function assertAdminConfig(config) {
 if (!config.projectHost || Object.values(config.variables).some(v => !v.configured)) throw new Error('Configurá NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY; la URL debe ser válida.');
 if (!config.urlIsProjectOrigin) throw new Error('NEXT_PUBLIC_SUPABASE_URL debe ser el origen HTTPS del proyecto, sin /rest/v1, rutas, credenciales ni parámetros.');
 if (Object.values(config.keyHygiene).some(Boolean)) throw new BillingDatabaseError('INVALID_KEY_FORMAT','SUPABASE_SECRET_KEY contiene espacios, saltos de línea, comillas adicionales o caracteres no ASCII. Corregí el valor; no se envió la clave.','configuration',null,'KEY_FORMAT');
 if (Object.values(config.variables).some(v => v.differsFromEnvLocal)) throw new Error('Una variable del proceso u otro archivo reemplaza la configuración de .env.local. Resolvé esa diferencia antes de continuar.');
 if (config.keyType === 'publishable' || ['anon','authenticated'].includes(config.legacyRole)) throw new BillingDatabaseError('INSUFFICIENT_PERMISSIONS','SUPABASE_SECRET_KEY contiene una clave pública o de usuario. Necesitás una clave secret o service_role del mismo proyecto.','configuration',null,null);
 if (config.legacyProjectMatchesUrl === false) throw new BillingDatabaseError('INVALID_CREDENTIALS','La clave legacy declara otro proyecto. Revisá la pareja URL/clave antes de continuar.','configuration',null,null);
}
// Runs at the final fetch boundary, after the SDK adds its auth fallback.
// This client is administrative: it must never inherit a user's session JWT.
export function adminRequestHeaders(input, options, key, baseUrl) {
 const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
 if (target.origin !== new URL(baseUrl).origin || !target.pathname.startsWith('/rest/v1/')) throw new Error('Se bloqueó un destino ajeno a la API administrativa configurada.');
 const headers = new Headers(input instanceof Request ? input.headers : undefined);
 new Headers(options?.headers).forEach((value,name) => headers.set(name,value));
 headers.set('apikey',key);
 headers.set('user-agent',`propi-billing-admin/1.0 Node.js/${process.versions.node}`);
 if (key.startsWith('sb_secret_')) headers.delete('authorization');
 else headers.set('authorization',`Bearer ${key}`); // Legacy service_role JWT.
 return headers;
}
export function nodeRuntime() {
 const browserGlobalsPresent = typeof window !== 'undefined' || typeof document !== 'undefined';
 if (typeof process === 'undefined' || !process.versions?.node || browserGlobalsPresent) throw new Error('El administrador de facturación solo puede ejecutarse desde Node.js, fuera del navegador.');
 return {engine:'node',nodeVersion:process.versions.node,browserGlobalsPresent};
}
export function userAgentType(value) {
 if (!value) return 'absent';
 if (/mozilla|chrome|chromium|safari|firefox|edg\/|opera/i.test(value)) return 'browser';
 if (/propi-billing-admin|node|undici/i.test(value)) return 'node-server';
 return 'other';
}
// Read a bounded clone; do not consume, replace or modify the response given to
// the official SDK. Never print arbitrary provider strings, headers or bodies.
export async function inspectHttpResponse(response, secrets = []) {
 const info = {httpStatus:response.status,bodyKind:'not-read',errorCode:null,authFailureKind:null,message:null};
 if (response.ok) return info;
 let reader;
 try {
  reader = response.clone().body?.getReader();
  if (!reader) return {...info,bodyKind:'empty',message:'La respuesta HTTP no tiene cuerpo.'};
  const chunks = []; let size = 0;
  while (true) {
   const part = await reader.read(); if (part.done) break;
   size += part.value.byteLength;
   if (size > 8192) { void reader.cancel().catch(()=>{}); return {...info,bodyKind:'omitted',message:'El error excede el límite de diagnóstico; no se muestra el cuerpo.'}; }
   chunks.push(part.value);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  let message = text, code;
  try {
   const body = JSON.parse(text); info.bodyKind = 'json'; code = body?.code;
   message = [body?.message,body?.error_description,body?.error,body?.error?.message].filter(value=>typeof value === 'string').join(' ');
  } catch { info.bodyKind = 'text'; }
  // Redact configured secrets before matching even known message categories.
  for (const secret of secrets) if (secret) message = message.split(secret).join('[REDACTED]');
  info.errorCode = typeof code === 'string' && /^[A-Z0-9]{2,12}$/.test(code) ? code : null;
  if ([401,403].includes(response.status) && /browser|user.?agent/i.test(message)) {
   info.authFailureKind = 'BROWSER_USER_AGENT_BLOCK'; info.message = 'El servidor informó un bloqueo por uso desde navegador o User-Agent.';
  } else if ([401,403].includes(response.status) && /invalid api.?key|api.?key.{0,50}(?:invalid|revoked|expired|not found)/i.test(message)) {
   info.authFailureKind = 'API_KEY_REJECTED'; info.message = 'El servidor informó una API key inválida, vencida o revocada; comprobar su vigencia y proyecto.';
  } else if (response.status === 401 && /jwt|token/i.test(message)) {
   info.authFailureKind = 'JWT_REJECTED'; info.message = 'El servidor informó un rechazo de JWT o token.';
  } else if (response.status === 401) {
   info.authFailureKind = 'AUTHENTICATION_REJECTED_UNSPECIFIED'; info.message = 'El servidor rechazó la autenticación sin una causa específica reconocible. Un 401 solo no prueba un bloqueo por User-Agent.';
  } else info.message = 'Error HTTP del servidor. El cuerpo original se conserva para el SDK, pero no se imprime por seguridad.';
  return info;
 } catch { return {...info,bodyKind:'unreadable',message:'No se pudo inspeccionar el cuerpo del error; la respuesta original no fue modificada.'}; }
 finally { reader?.releaseLock(); }
}
