// Isolated native Node process: avoids Playwright's CJS/ESM interop for auth-js.
// Executes the actual transport source with the installed SDK and no network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

const root = resolve('src');
const allowed = new Set([
 'lib/supabase/admin-transport.ts', 'lib/supabase/admin-diagnostics.ts',
 'lib/billing/domain.ts', 'lib/billing/catalog.json',
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
console.log(JSON.stringify({sdkRpcPassed:true,requests:calls}));
