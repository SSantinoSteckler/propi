// Imported only by the administrative command tests in an isolated Node process.
// All network requests are intercepted; unexpected endpoints fail closed.
import { readFile, writeFile } from 'node:fs/promises';
const file = process.env.BILLING_PLAN_TEST_STATE;
if (!file) throw new Error('Missing isolated test state');
globalThis.fetch = async (input, options = {}) => {
 const url = new URL(typeof input === 'string' ? input : input.url);
 const state = JSON.parse(await readFile(file, 'utf8'));
 const method = options.method || 'GET';
 const body = options.body ? JSON.parse(options.body) : null;
 const respond = async (data, status = 200) => {
  await writeFile(file, JSON.stringify(state));
  return new Response(status === 204 ? null : JSON.stringify(data), {status, headers:{'Content-Type':'application/json'}});
 };
 state.requests = (state.requests || 0) + 1;
 if (url.origin === 'https://billing-test.supabase.co') {
  if (state.captureTransport) state.transport = {method,path:url.pathname,userAgent:new Headers(options.headers).get('user-agent')};
  if (state.captureAuth) {
   const headers = new Headers(options.headers);
   const key = process.env.SUPABASE_SECRET_KEY;
   (state.requestAuthentication ||= []).push({apiKeyMatchesConfigured:headers.get('apikey') === key,authorizationHeaderPresent:headers.has('authorization'),authorizationMatchesConfiguredBearer:headers.get('authorization') === `Bearer ${key}`});
  }
  if (url.pathname === '/rest/v1/rpc/billing_acquire_lock') return respond('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  if (url.pathname === '/rest/v1/rpc/billing_release_lock') return respond(null);
  if (url.pathname === '/rest/v1/billing_plan_registry') {
   if (state.scenario === 'db-browser') return respond({message:'Forbidden use of secret API key in browser'},401);
   if (state.scenario === 'db-invalid-api-key') return respond({message:`Invalid API key: ${process.env.SUPABASE_SECRET_KEY}`},401);
   if (state.scenario === 'db-unknown-401') return respond({message:`private-provider-detail ${process.env.SUPABASE_SECRET_KEY}`},401);
   const errors = {
    'db-table-missing':['PGRST205',404], 'db-function-missing':['PGRST202',404],
    'db-permissions':['42501',403], 'db-credentials':['PGRST301',401], 'db-other':['23505',409],
   };
   if (method === 'GET' && state.scenario === 'db-connection') {
    await writeFile(file,JSON.stringify(state));
    throw Object.assign(new Error('private-provider-detail'),{cause:{code:'EACCES'}});
   }
   if (method === 'GET' && errors[state.scenario]) {
    const [code,status] = errors[state.scenario];
    return respond({code,message:'private-provider-detail test-secret-not-real'},status);
   }
   if (method === 'GET') return respond(state.registry ? [state.registry] : []);
   state.registryWrites = (state.registryWrites || 0) + 1;
   if (method === 'POST') { state.registry ||= {key:'premium',provider_plan_id:null,creation_started:false}; return respond(null, 204); }
   if (method === 'PATCH') {
    if (url.searchParams.get('creation_started') === 'eq.false' && state.registry.creation_started) return respond([]);
    Object.assign(state.registry, body);
    return respond(url.searchParams.has('select') ? [{key:'premium'}] : null, url.searchParams.has('select') ? 200 : 204);
   }
  }
 }
 if (url.origin === 'https://api.mercadopago.com') {
  if (url.pathname === '/users/me' && method === 'GET') return respond({id:101,site_id:'MLA',tags:state.scenario === 'real-account' ? [] : ['test_user']});
  if (url.pathname === '/preapproval_plan' && method === 'POST') {
   state.creates = (state.creates || 0) + 1;
   state.plan = {...body,id:'test-plan-123',collector_id:101,status:'active'};
   if (state.scenario === 'ambiguous') {
    await writeFile(file,JSON.stringify(state));
    throw new Error('network timeout simulated by test');
   }
   return respond(state.plan);
  }
  if (url.pathname === '/preapproval_plan/test-plan-123' && method === 'GET') {
   if (state.scenario === 'verification-failure' && !state.failedOnce) { state.failedOnce = true; return respond({},503); }
   return respond(state.plan);
  }
 }
 throw new Error('Unexpected network operation blocked by isolated test fixture');
};
