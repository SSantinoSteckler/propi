import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd());
const catalog = JSON.parse(await readFile(new URL('../src/lib/billing/catalog.json', import.meta.url), 'utf8'));
const args = process.argv.slice(2);
if (args.includes('--help')) {
 console.log('billing:plan [--dry-run | --create | --adopt ID]. --dry-run no hace llamadas externas. Sin opciones solamente valida un plan existente. --create crea un plan explícitamente; nunca cobra ni crea suscripciones.');
 process.exit(0);
}
const create = args.length === 1 && args[0] === '--create';
const preview = args.length === 1 && args[0] === '--dry-run';
const adopt = args.length === 2 && args[0] === '--adopt' ? args[1] : null;
if (args.length && !create && !adopt && !preview) throw new Error('Usá --help para consultar las opciones.');
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
let db, lease;
async function api(path, body) {
 const response = await fetch(`https://api.mercadopago.com${path}`, {
  method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
  headers: {Authorization:`Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`, 'Content-Type':'application/json'},
  body: body ? JSON.stringify(body) : undefined,
 });
 if (!response.ok) throw new Error(`Mercado Pago respondió HTTP ${response.status}. No se muestran datos sensibles.`);
 return response.json();
}
function check(result) { if (result.error) throw new Error('No se pudo acceder al registro administrativo. Aplicá la migración de facturación.'); return result.data; }
try {
 for (const name of required)
  if (!process.env[name]) throw new Error(`Falta configurar ${name}.`);
 const backUrl = returnUrl(process.env.NEXT_PUBLIC_SITE_URL);
 db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
 if (create || adopt) {
  lease = check(await db.rpc('billing_acquire_lock',{p_key:'billing-plan',p_seconds:120}));
  if (!lease) throw new Error('Ya hay otro proceso administrando el plan.');
  check(await db.from('billing_plan_registry').upsert({key:'premium'},{onConflict:'key',ignoreDuplicates:true}));
 }
 const registry = check(await db.from('billing_plan_registry').select('*').eq('key','premium').maybeSingle()) || {};
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
  const claimed = check(await db.from('billing_plan_registry').update({creation_started:true}).eq('key','premium').eq('creation_started',false).select('key'));
  if (claimed.length !== 1) throw new Error('Otro proceso ya inició la creación.');
  plan = await api('/preapproval_plan',planBody(backUrl));
  id = plan.id;
  if (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('El proveedor no devolvió un ID válido. Revisá los planes antes de reintentar.');
  // Preserve the returned ID before the verification GET, which can time out.
  check(await db.from('billing_plan_registry').update({provider_plan_id:id}).eq('key','premium'));
  console.log(`ID del plan creado y guardado: ${id}. Se verificará ahora con Mercado Pago.`);
 }
 if (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('ID de plan inválido.');
 plan = await api(`/preapproval_plan/${encodeURIComponent(id)}`);
 const r = plan.auto_recurring;
 if (String(plan.collector_id) !== String(seller.id) || plan.reason !== catalog.name || plan.status !== 'active' || plan.back_url !== backUrl || !r || Number(r.transaction_amount) !== catalog.amount || r.currency_id !== catalog.currency || r.frequency !== 1 || r.frequency_type !== 'months' || r.free_trial || r.repetitions || r.end_date) throw new Error('El plan no coincide con el catálogo, el vendedor o la URL de retorno de Propi.');
 if (create || adopt) check(await db.from('billing_plan_registry').update({provider_plan_id:id,creation_started:true}).eq('key','premium'));
 console.log(`Plan validado. Configurá MERCADOPAGO_PRO_PLAN_ID=${id} en el servidor correspondiente. No se creó ninguna suscripción ni se realizó un cobro.`);
} catch (error) {
 console.error(error instanceof Error && !/fetch|network|connect/i.test(error.message) ? error.message : 'Error de comunicación. Revisá el registro antes de reintentar una creación.');
 process.exitCode = 1;
} finally {
 if (db && lease) await db.rpc('billing_release_lock',{p_key:'billing-plan',p_token:lease});
}
