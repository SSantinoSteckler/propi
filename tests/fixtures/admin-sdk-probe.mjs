// Isolated native Node process: avoids Playwright's CJS/ESM interop for auth-js.
// Executes the actual transport source with the installed SDK and no network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import * as zod from 'zod';
import ts from 'typescript';

const root = resolve('src');
const allowed = new Set([
 'lib/supabase/admin-transport.ts', 'lib/supabase/admin-diagnostics.ts',
 'lib/billing/domain.ts', 'lib/billing/catalog.json',
 'app/api/events/route.ts', 'lib/config.ts',
].map(file => resolve(root,file)));
const cache = new Map();
function load(filename) {
 if (!allowed.has(filename)) throw new Error('Unexpected module blocked by isolated SDK probe');
 if (cache.has(filename)) return cache.get(filename).exports;
 const module = {exports:{}}; cache.set(filename,module);
 const source = readFileSync(filename,'utf8');
 if (filename.endsWith('.json')) { module.exports=JSON.parse(source); return module.exports; }
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const localRequire=name=>{
  if(name==='@supabase/supabase-js')return {createClient};
  if(name==='node:crypto')return {createHmac};
  if(name==='zod')return zod;
  if (!name.startsWith('.')) throw new Error('Unexpected dependency blocked by SDK probe');
  return load(resolve(dirname(filename),name.endsWith('.json')?name:`${name}.ts`));
 };
 new Function('require','exports','module',js)(localRequire,module.exports,module);
 return module.exports;
}
const {createAdminFetch}=load(resolve(root,'lib/supabase/admin-transport.ts'));
const key='sb_secret_fixture_not_real'; let calls=0;
const send=async(input,options)=>{
 calls++;
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 const headers=new Headers(options.headers);
 assert.equal(url.origin,'https://database.example');
 assert.equal(url.pathname,'/rest/v1/rpc/billing_is_test_owner');
 assert.equal(options.method,'POST');
 assert.equal(headers.get('apikey'),key);
 assert.equal(headers.has('authorization'),false);
 assert.ok(headers.get('user-agent').startsWith('propi-billing-server/'));
 return Response.json(true);
};
const db=createClient('https://database.example',key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer user-session-fixture'},fetch:createAdminFetch('https://database.example',key,send)}});
const result=await db.rpc('billing_is_test_owner',{p_owner:'11111111-1111-4111-8111-111111111111'});
assert.equal(result.error,null);assert.equal(result.data,true);assert.equal(calls,1);
// The actual analytics handler must use the same safe transport for both key formats.
// Every outgoing request is replaced; no credentials, DB or external API is used.
const names=['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SECRET_KEY','NEXT_PUBLIC_SITE_URL'];
const before=Object.fromEntries(names.map(name=>[name,process.env[name]]));
const originalFetch=globalThis.fetch;
try {
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://database.example';
 process.env.NEXT_PUBLIC_SITE_URL='https://propi.example';
 const {POST}=load(resolve(root,'app/api/events/route.ts'));
 for(const adminKey of [key,'fixture.payload.signature']) {
  process.env.SUPABASE_SECRET_KEY=adminKey;
  let analyticsCalls=0;
  globalThis.fetch=async(input,options)=>{
   analyticsCalls++;
   const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
   const headers=new Headers(options.headers);
   assert.equal(url.href,'https://database.example/rest/v1/rpc/record_event');
   assert.equal(headers.get('apikey'),adminKey);
   assert.equal(headers.get('authorization'),adminKey.startsWith('sb_secret_')?null:`Bearer ${adminKey}`);
   assert.ok(headers.get('user-agent').startsWith('propi-billing-server/'));
   const body=JSON.parse(options.body);
   assert.match(body.p_fingerprint,/^[a-f0-9]{64}$/);
   assert.equal(body.p_username,'agent-fixture');
   return Response.json(null);
  };
  const response=await POST(new Request('https://propi.example/api/events',{
   method:'POST',headers:{origin:'https://propi.example','user-agent':'Mozilla/5.0','content-type':'application/json'},
   body:JSON.stringify({username:'agent-fixture',kind:'portfolio'}),
  }));
  assert.equal(response.status,204);assert.equal(analyticsCalls,1);
 }
} finally {
 globalThis.fetch=originalFetch;
 for(const name of names)if(before[name]===undefined)delete process.env[name];else process.env[name]=before[name];
}
console.log(JSON.stringify({sdkRpcPassed:true,requests:calls}));
