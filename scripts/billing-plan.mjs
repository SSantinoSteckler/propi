import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { BillingDatabaseError, databaseResult, inspectAdminConfig, assertAdminConfig, adminRequestHeaders, nodeRuntime, userAgentType, inspectHttpResponse } from './billing-diagnostics.mjs';
const runtime = nodeRuntime();
const require = createRequire(import.meta.url);
const loadedEnv = require('@next/env').loadEnvConfig(process.cwd());
const catalog = JSON.parse(await readFile(new URL('../src/lib/billing/catalog.json', import.meta.url), 'utf8'));
const args = process.argv.slice(2);
if (args.includes('--help')) {
 console.log('billing:plan [--dry-run | --diagnose | --verify-seller | --create | --adopt ID]. --diagnose solo lee el registro de Supabase. --dry-run no hace llamadas externas. --verify-seller solo consulta /users/me. Sin opciones solamente valida un plan existente. --create crea un plan explícitamente; nunca cobra ni crea suscripciones.');
 process.exit(0);
}
const create = args.length === 1 && args[0] === '--create';
const preview = args.length === 1 && args[0] === '--dry-run';
const verifySeller = args.length === 1 && args[0] === '--verify-seller';
const diagnose = args.length === 1 && args[0] === '--diagnose';
const adopt = args.length === 2 && args[0] === '--adopt' ? args[1] : null;
if (args.length && !create && !adopt && !preview && !verifySeller && !diagnose) throw new Error('Usá --help para consultar las opciones.');
const required = ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SECRET_KEY','MERCADOPAGO_ACCESS_TOKEN','NEXT_PUBLIC_SITE_URL'];
function returnUrl(value) {
 const site = new URL(value);
 if (site.protocol !== 'https:' || site.username || site.password || site.port || site.pathname !== '/' || site.search || site.hash || ['localhost','127.0.0.1','[::1]'].includes(site.hostname)) throw new Error('NEXT_PUBLIC_SITE_URL debe ser un origen HTTPS público, sin ruta.');
 return `${site.origin}/dashboard/billing/return`;
}
const planBody = (backUrl) => ({reason:catalog.name,auto_recurring:{frequency:catalog.frequency,frequency_type:catalog.frequencyType,transaction_amount:catalog.amount,currency_id:catalog.currency},back_url:backUrl});
if (preview) {
 const missing = required.filter(name => !process.env[name]?.trim());
 let backUrl = null;
 try { if (process.env.NEXT_PUBLIC_SITE_URL) backUrl = returnUrl(process.env.NEXT_PUBLIC_SITE_URL); }
 catch { missing.push('NEXT_PUBLIC_SITE_URL (origen HTTPS inválido)'); }
 console.log(JSON.stringify({mode:'preview',externalRequests:0,accessTokenConfigured:Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()),missing,request:{method:'POST',url:'https://api.mercadopago.com/preapproval_plan',body:planBody(backUrl)},idSavedIn:'public.billing_plan_registry',environmentVariable:'MERCADOPAGO_PRO_PLAN_ID'},null,2));
 process.exit(0);
}
let db, lease, networkCode = null, authenticationHeaders = null, transportDiagnostics = null;
async function api(path, body) {
 const response = await fetch(`https://api.mercadopago.com${path}`, {
  method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
  headers: {Authorization:`Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`, 'Content-Type':'application/json'},
  body: body ? JSON.stringify(body) : undefined,
 });
 if (!response.ok) throw new Error(`Mercado Pago respondió HTTP ${response.status}. No se muestran datos sensibles.`);
 return response.json();
}
function check(result, operation = 'billing_plan_registry') { return databaseResult(result,operation,networkCode,transportDiagnostics?.response); }
function connectAdmin() {
 const config = inspectAdminConfig(process.env,loadedEnv.loadedEnvFiles);
 assertAdminConfig(config);
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async (input,options) => {
  networkCode = null;
  const key = process.env.SUPABASE_SECRET_KEY;
  const headers = adminRequestHeaders(input,options,key,process.env.NEXT_PUBLIC_SUPABASE_URL);
  const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const method = options?.method || (input instanceof Request ? input.method : 'GET');
  if (diagnose && (method !== 'GET' || target.pathname !== '/rest/v1/billing_plan_registry')) throw new Error('El diagnóstico solo admite GET del registro administrativo.');
  authenticationHeaders = {apiKeyHeaderMatchesConfigured:headers.get('apikey') === key,authorizationHeaderPresent:headers.has('authorization'),secretKeyUsedAsBearer:key.startsWith('sb_secret_') && headers.get('authorization') === `Bearer ${key}`};
  transportDiagnostics = {runtime,method,endpoint:`${target.origin}${target.pathname}`,queryParameterNames:[...target.searchParams.keys()],restEndpointCorrect:target.pathname === '/rest/v1/billing_plan_registry',userAgent:{type:userAgentType(headers.get('user-agent')),value:headers.get('user-agent'),incomingHeaderType:userAgentType(new Headers(options?.headers).get('user-agent'))},response:null};
  try {
   const response = await fetch(input,{...options,headers,signal:AbortSignal.timeout(10000),redirect:'error'});
   if (diagnose) transportDiagnostics.response = await inspectHttpResponse(response,[key]);
   return response;
  }
  catch (error) {
   const rawCode = error.cause?.code || error.code || (error.name === 'TimeoutError' ? 'ETIMEDOUT' : 'NETWORK_ERROR');
   networkCode = ['EACCES','EPERM','ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT'].includes(rawCode) ? rawCode : 'NETWORK_ERROR';
   throw error;
  }
 }}});
}
function report(error) {
 if (error instanceof BillingDatabaseError) console.error(JSON.stringify({...error.diagnostic,message:error.message},null,2));
 else console.error(error instanceof Error && !/fetch|network|connect/i.test(error.message) ? error.message : 'Error de comunicación. Revisá el registro antes de reintentar una creación.');
}
if (diagnose) {
 console.log(JSON.stringify({mode:'diagnose',readOnly:true,runtime,configuration:inspectAdminConfig(process.env,loadedEnv.loadedEnvFiles)},null,2));
 try {
  db = connectAdmin();
  const registry = check(await db.from('billing_plan_registry').select('key,provider_plan_id,creation_started').eq('key','premium').maybeSingle(),'SELECT public.billing_plan_registry');
  console.log(JSON.stringify({registryAccessible:true,projectKeyValidatedByApi:true,authenticationHeaders,transport:transportDiagnostics,registryRowExists:Boolean(registry),registeredPlanId:registry?.provider_plan_id || null,creationStarted:registry?.creation_started || false,mutations:0,mercadoPagoRequests:0},null,2));
 } catch (error) {
  console.log(JSON.stringify({authenticationHeaders,transport:transportDiagnostics,projectKeyValidatedByApi:transportDiagnostics?.response?.httpStatus === 401 ? false : null,mutations:0,mercadoPagoRequests:0},null,2));
  report(error); process.exitCode = 1;
 }
 process.exit(process.exitCode || 0);
}
if (verifySeller) {
 try {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  // Next omits already-set process variables from file.env; inspect the local
  // assignment too, so an inherited real-account token cannot bypass this guard.
  const localContents = loadedEnv.loadedEnvFiles.find(file => file.path === '.env.local')?.contents || '';
  const localMatch = localContents.match(/^\s*(?:export\s+)?MERCADOPAGO_ACCESS_TOKEN\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\r\n]*))/m);
  const localToken = localMatch ? (localMatch[1] ?? localMatch[2] ?? localMatch[3]).trim() : undefined;
  if (!token?.trim()) throw new Error('Falta configurar MERCADOPAGO_ACCESS_TOKEN.');
  if (localToken && localToken !== token) throw new Error('El token del entorno difiere de .env.local. Se cancela la consulta para evitar usar otra cuenta.');
  const seller = await api('/users/me');
  const testUser = Array.isArray(seller.tags) && seller.tags.includes('test_user');
  const confirmed = Boolean(seller.id && seller.site_id === 'MLA' && testUser);
  console.log(JSON.stringify({source:localToken ? '.env.local' : 'environment',method:'GET',endpoint:'/users/me',id:seller.id,site_id:seller.site_id,test_user_tag_present:testUser,argentineTestAccountConfirmed:confirmed,resourcesCreated:0},null,2));
  if (!confirmed) { console.error('No se confirmó una cuenta de prueba argentina. No crear el plan: contrastá el User ID con Cuentas de prueba en Mercado Pago Developers.'); process.exitCode = 1; }
 } catch {
  console.error('No se pudo verificar el vendedor. Revisá la conexión y que el token de .env.local no esté reemplazado por otra variable de entorno. No se crearon recursos.');
  process.exitCode = 1;
 }
 process.exit(process.exitCode || 0);
}
try {
 for (const name of required)
  if (!process.env[name]) throw new Error(`Falta configurar ${name}.`);
 const backUrl = returnUrl(process.env.NEXT_PUBLIC_SITE_URL);
 db = connectAdmin();
 // Read-only preflight: fail on table/credential errors before taking a lock
 // or inserting the administrative registry row. Re-read under the lock below.
 let registry = check(await db.from('billing_plan_registry').select('*').eq('key','premium').maybeSingle(),'SELECT public.billing_plan_registry') || {};
 if (create || adopt) {
  lease = check(await db.rpc('billing_acquire_lock',{p_key:'billing-plan',p_seconds:120}),'RPC billing_acquire_lock');
  if (!lease) throw new Error('Ya hay otro proceso administrando el plan.');
  check(await db.from('billing_plan_registry').upsert({key:'premium'},{onConflict:'key',ignoreDuplicates:true}),'UPSERT public.billing_plan_registry');
  registry = check(await db.from('billing_plan_registry').select('*').eq('key','premium').maybeSingle(),'SELECT public.billing_plan_registry (locked)') || {};
 }
 const configured = process.env.MERCADOPAGO_PRO_PLAN_ID || registry.provider_plan_id;
 if (process.env.MERCADOPAGO_PRO_PLAN_ID && registry.provider_plan_id && process.env.MERCADOPAGO_PRO_PLAN_ID !== registry.provider_plan_id && !adopt) throw new Error('El ID configurado difiere del registro. Revisá y usá --adopt ID explícitamente.');
 const seller = await api('/users/me');
 if (!seller.id || seller.site_id !== 'MLA') throw new Error('Las credenciales deben corresponder a un vendedor argentino.');
 let id = adopt || configured;
 let plan;
 if (!id) {
  if (!create) throw new Error('No hay plan registrado. Ejecutá --create solo cuando quieras crear el plan, o --adopt ID para registrar uno existente.');
  if (registry.creation_started) throw new Error('Hubo un intento anterior. Revisá los planes en Mercado Pago y registrá el ID con --adopt; no se repite un POST ambiguo.');
  // Persist before the external mutation: timeout/crash never causes a duplicate POST.
  const claimed = check(await db.from('billing_plan_registry').update({creation_started:true}).eq('key','premium').eq('creation_started',false).select('key'),'UPDATE billing_plan_registry.creation_started');
  if (claimed.length !== 1) throw new Error('Otro proceso ya inició la creación.');
  plan = await api('/preapproval_plan',planBody(backUrl));
  id = plan.id;
  if (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('El proveedor no devolvió un ID válido. Revisá los planes antes de reintentar.');
  // Preserve the returned ID before the verification GET, which can time out.
  check(await db.from('billing_plan_registry').update({provider_plan_id:id}).eq('key','premium'),'UPDATE billing_plan_registry.provider_plan_id');
  console.log(`ID del plan creado y guardado: ${id}. Se verificará ahora con Mercado Pago.`);
 }
 if (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('ID de plan inválido.');
 plan = await api(`/preapproval_plan/${encodeURIComponent(id)}`);
 const r = plan.auto_recurring;
 if (String(plan.collector_id) !== String(seller.id) || plan.reason !== catalog.name || plan.status !== 'active' || plan.back_url !== backUrl || !r || Number(r.transaction_amount) !== catalog.amount || r.currency_id !== catalog.currency || r.frequency !== 1 || r.frequency_type !== 'months' || r.free_trial || r.repetitions || r.end_date) throw new Error('El plan no coincide con el catálogo, el vendedor o la URL de retorno de Propi.');
 if (create || adopt) check(await db.from('billing_plan_registry').update({provider_plan_id:id,creation_started:true}).eq('key','premium'),'UPDATE billing_plan_registry (validated)');
 console.log(`Plan validado. Configurá MERCADOPAGO_PRO_PLAN_ID=${id} en el servidor correspondiente. No se creó ninguna suscripción ni se realizó un cobro.`);
} catch (error) {
 report(error);
 process.exitCode = 1;
} finally {
 if (db && lease) await db.rpc('billing_release_lock',{p_key:'billing-plan',p_token:lease});
}
