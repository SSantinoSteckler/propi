import { test, expect } from '@playwright/test';
import { inspectAdminConfig, assertAdminConfig, adminRequestHeaders, inspectHttpResponse } from '../scripts/billing-diagnostics.mjs';
const url='https://billing-test.supabase.co';
test('diagnóstico rechaza claves públicas antes de conectar a Supabase',()=>{
 const config=inspectAdminConfig({NEXT_PUBLIC_SUPABASE_URL:url,SUPABASE_SECRET_KEY:'sb_publishable_not-real'},[]);
 expect(()=>assertAdminConfig(config)).toThrow('clave pública');
});
test('diagnóstico detecta clave legacy de otro proyecto sin imprimir el JWT',()=>{
 const key=`header.${Buffer.from(JSON.stringify({role:'service_role',ref:'other-project'})).toString('base64url')}.signature`;
 const config=inspectAdminConfig({NEXT_PUBLIC_SUPABASE_URL:url,SUPABASE_SECRET_KEY:key},[]);
 expect(config.legacyProjectMatchesUrl).toBe(false);expect(()=>assertAdminConfig(config)).toThrow('otro proyecto');
 expect(JSON.stringify(config)).not.toContain(key);
});
test('diagnóstico detecta una clave heredada que reemplaza .env.local',()=>{
 const config=inspectAdminConfig({NEXT_PUBLIC_SUPABASE_URL:url,SUPABASE_SECRET_KEY:'sb_secret_inherited'},[{path:'.env.local',contents:`NEXT_PUBLIC_SUPABASE_URL=${url}\nSUPABASE_SECRET_KEY=sb_secret_local\n`}]);
 expect(config.variables.SUPABASE_SECRET_KEY.differsFromEnvLocal).toBe(true);
 expect(()=>assertAdminConfig(config)).toThrow('reemplaza');
 expect(JSON.stringify(config)).not.toContain('sb_secret_local');
 expect(JSON.stringify(config)).not.toContain('sb_secret_inherited');
});
test('transporte administrativo elimina Bearer de secret en SELECT y RPC y conserva otros encabezados',()=>{
 for(const path of ['/rest/v1/billing_plan_registry','/rest/v1/rpc/billing_acquire_lock']) {
  const headers=adminRequestHeaders(`${url}${path}`,{headers:{Authorization:'Bearer sb_secret_fixture',apikey:'wrong',Prefer:'return=representation'}},'sb_secret_fixture',url);
  expect(headers.get('apikey')).toBe('sb_secret_fixture');expect(headers.has('authorization')).toBe(false);expect(headers.get('prefer')).toBe('return=representation');
 }
});
test('transporte no envía credenciales a otro origen ni a un endpoint ajeno',()=>{
 for(const target of ['https://other.supabase.co/rest/v1/billing_plan_registry',`${url}/auth/v1/user`]) expect(()=>adminRequestHeaders(target,{},'sb_secret_fixture',url)).toThrow('destino ajeno');
});
test('clave con espacios, saltos o comillas se rechaza sin emitir sus caracteres',()=>{
 for(const key of [' sb_secret_bad','sb_secret_bad ','sb_secret_\nbad','sb_secret_"bad"','sb_secret_\u200bbad']) {
  const config=inspectAdminConfig({NEXT_PUBLIC_SUPABASE_URL:url,SUPABASE_SECRET_KEY:key},[]);
  expect(()=>assertAdminConfig(config)).toThrow('contiene espacios');expect(JSON.stringify(config)).not.toContain('sb_secret_');
 }
});
test('URL configurada debe ser el origen y no un endpoint REST duplicado',()=>{
 for(const badUrl of [`${url}/rest/v1`,`${url}/rest/v1/billing_plan_registry`,`${url}?apikey=not-real`]) {
  const config=inspectAdminConfig({NEXT_PUBLIC_SUPABASE_URL:badUrl,SUPABASE_SECRET_KEY:'sb_secret_fixture'},[]);
  expect(()=>assertAdminConfig(config)).toThrow('origen HTTPS');
 }
});
test('inspección sanitiza la respuesta sin consumir ni cambiar status o cuerpo del SDK',async()=>{
 const key='sb_secret_fixture';const body=JSON.stringify({message:`Invalid API key: ${key}`});
 const response=new Response(body,{status:401,headers:{'Content-Type':'application/json'}});
 const diagnostic=await inspectHttpResponse(response,[key]);
 expect(diagnostic.httpStatus).toBe(401);expect(diagnostic.authFailureKind).toBe('API_KEY_REJECTED');expect(JSON.stringify(diagnostic)).not.toContain(key);
 expect(response.status).toBe(401);expect(response.bodyUsed).toBe(false);expect(await response.text()).toBe(body);
});
test('un User-Agent de navegador recibido no se reenvía desde el administrador Node',()=>{
 const headers=adminRequestHeaders(`${url}/rest/v1/billing_plan_registry`,{headers:{'User-Agent':'Mozilla/5.0 Chrome/123 Safari/537.36'}},'sb_secret_fixture',url);
 expect(headers.get('user-agent')).toMatch(/^propi-billing-admin\/1\.0 Node\.js\//);expect(headers.get('user-agent')).not.toMatch(/Mozilla|Chrome|Safari/);
});
