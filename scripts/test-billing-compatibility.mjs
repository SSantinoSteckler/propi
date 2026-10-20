// Actual Git/current TypeScript executed against disposable PostgreSQL, not a
// hand-written approximation of the old server. Network is fully replaced.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import ts from 'typescript';
const require=createRequire(import.meta.url);
let serverSequence=0;
const ident=s=>{if(!/^[a-z_][a-z0-9_]*$/.test(s))throw new Error('Unexpected SQL identifier');return `"${s}"`;};

function database(pg) {
 async function execute(sql,params=[]) {
  await pg.exec('savepoint simulated_http;set local role service_role');
  try { const result=await pg.query(sql,params);await pg.exec('reset role;release savepoint simulated_http');return {data:result.rows,error:null}; }
  catch(error){await pg.exec('rollback to savepoint simulated_http;release savepoint simulated_http;reset role');console.error('SQL de fixture falló:',error.message,sql);return {data:null,error};}
 }
 return {
  rpc:async(name,args={})=>{const entries=Object.entries(args);const r=await execute(`select public.${ident(name)}(${entries.map(([k],i)=>`${ident(k)} => $${i+1}`).join(',')})`,entries.map(([,v])=>v!==null&&typeof v==='object'?JSON.stringify(v):v));return {...r,data:r.data?.[0]?.[name]??null};},
  from(table) {
   const filters=[],orders=[];let mode='select',payload,options={},projection='*',limit,one=false,optional=false;
   const q={select:(p='*')=>{projection=p;return q;},eq:(k,v)=>{filters.push([k,'=',v]);return q;},neq:(k,v)=>{filters.push([k,'<>',v]);return q;},lte:(k,v)=>{filters.push([k,'<=',v]);return q;},in:(k,v)=>{filters.push([k,'in',v]);return q;},or:expression=>{filters.push([null,'or',expression]);return q;},order:(k,o={})=>{orders.push(`${ident(k)} ${o.ascending===false?'desc':'asc'}`);return q;},limit:n=>{limit=Number(n);return q;},single:()=>{one=true;return q;},maybeSingle:()=>{one=true;optional=true;return q;},insert:body=>{mode='insert';payload=body;return q;},update:body=>{mode='update';payload=body;return q;},upsert:(body,o)=>{mode='insert';payload=body;options=o;return q;},then(resolve,reject){return run().then(resolve,reject);}};
   async function run(){
    const params=[],bind=v=>{params.push(v);return `$${params.length}`;};
    function split(s){let depth=0,start=0;const out=[];for(let i=0;i<s.length;i++){if(s[i]==='(')depth++;if(s[i]===')')depth--;if(s[i]===','&&!depth){out.push(s.slice(start,i));start=i+1;}}out.push(s.slice(start));return out;}
    function expression(s){const group=/^(and|or)\((.*)\)$/.exec(s);if(group)return `(${split(group[2]).map(expression).join(group[1]==='and'?' and ':' or ')})`;const [col,op,...value]=s.split('.');if(op==='is'&&value.join('.')==='null')return `${ident(col)} is null`;assert.equal(op,'eq');return `${ident(col)}=${bind(value.join('.'))}`;}
    const where=()=>filters.length?' where '+filters.map(([k,op,v])=>op==='or'?`(${split(v).map(expression).join(' or ')})`:op==='in'?`${ident(k)} in (${v.map(bind).join(',')})`:`${ident(k)}${op}${bind(v)}`).join(' and '):'';
    let sql;
    if(mode==='insert') {const entries=Object.entries(payload);sql=`insert into public.${ident(table)}(${entries.map(([k])=>ident(k)).join(',')}) values(${entries.map(([,v])=>bind(v)).join(',')})`;if(options.onConflict)sql+=` on conflict(${ident(options.onConflict)}) do nothing`;sql+=' returning *';}
    else if(mode==='update')sql=`update public.${ident(table)} set ${Object.entries(payload).map(([k,v])=>`${ident(k)}=${bind(v)}`).join(',')}${where()} returning *`;
    else sql=`select ${projection==='*'?'*':projection.split(',').map(ident).join(',')} from public.${ident(table)}${where()}${orders.length?' order by '+orders.join(','):''}${limit!==undefined?' limit '+limit:''}`;
    const r=await execute(sql,params);
    if(!r.error&&one){if(r.data.length!==1&&!(optional&&r.data.length===0))return {data:null,error:new Error('Expected one row')};r.data=r.data[0]??null;}return r;
   }
   return q;
  }
 };
}

function server(pg,ref,sellerId,site='https://local-billing.example',catalogOverride) {
 const instance=++serverSequence;
 const db=database(pg),cache=new Map(),subscriptions=new Map(),invoices=new Map(),payments=new Map(),calls=[];let sequence=0;
 const stamp=()=>new Date(Date.now()-60000+(sequence++)).toISOString();
 const recurring={frequency:1,frequency_type:'months',transaction_amount:14900,currency_id:'ARS'};
 class ProviderError extends Error {constructor(status){super('PROVIDER_UNAVAILABLE');this.providerStatus=status;}}
 async function mp(path,method='GET',body) {
  calls.push({path,method});const url=new URL(path,'https://provider.invalid');
  if(path==='/users/me')return {id:Number(sellerId),site_id:'MLA',tags:sellerId==='3779671542'?['test_user']:[]};
  if(path==='/preapproval_plan/catalog')return {id:'catalog',collector_id:Number(sellerId),status:'active',reason:'Propi Premium',back_url:`${site}/dashboard/billing/return`,auto_recurring:recurring};
  if(path==='/preapproval'&&method==='POST'){const id=`sub-${sellerId}-${instance}-${++sequence}`,s={id,collector_id:Number(sellerId),payer_id:202,external_reference:body.external_reference,status:'pending',auto_recurring:structuredClone(body.auto_recurring || recurring),last_modified:stamp(),init_point:`https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=${id}`};subscriptions.set(id,s);return structuredClone(s);}
  if(url.pathname==='/preapproval/search')return {results:[...subscriptions.values()],paging:{total:subscriptions.size}};
  if(url.pathname.startsWith('/preapproval/')){const id=url.pathname.split('/').at(-1),s=subscriptions.get(id);if(!s)throw new ProviderError(404);if(method==='PUT')Object.assign(s,body,{last_modified:stamp()});return structuredClone(s);}
  if(url.pathname==='/authorized_payments/search'){
   // Preserve historical provider fixtures for old Git binaries. The current
   // server must obey the real endpoint's rejected `limit` and default page 12.
   if(!ref&&url.searchParams.has('limit'))throw new ProviderError(400);
   const result=[...invoices.values()].filter(i=>url.searchParams.has('payment_id')?String(i.payment.id)===url.searchParams.get('payment_id'):i.preapproval_id===url.searchParams.get('preapproval_id'));
   const offset=Number(url.searchParams.get('offset')||0),limit=ref?100:12;
   return {results:structuredClone(result.slice(offset,offset+limit)),paging:{offset,limit,total:result.length}};
  }
  if(url.pathname.startsWith('/authorized_payments/'))return structuredClone(invoices.get(url.pathname.split('/').at(-1)));
  if(url.pathname.startsWith('/v1/payments/'))return structuredClone(payments.get(url.pathname.split('/').at(-1)));
  throw new Error('Unexpected provider request blocked');
 }
 function load(file) {
  if(cache.has(file))return cache.get(file).exports;
  const source=ref?execFileSync('git',['show',`${ref}:${file}`],{encoding:'utf8'}):readFileSync(file,'utf8');
  if(file.endsWith('.json'))return file==='src/lib/billing/catalog.json'&&catalogOverride ? structuredClone(catalogOverride) : JSON.parse(source);
  const module={exports:{}};cache.set(file,module);
  function resolve(spec) {
   if(spec==='server-only')return {};
   if(spec.startsWith('node:')||spec==='zod')return require(spec);
   let target=spec.startsWith('@/')?'src/'+spec.slice(2):posix.normalize(posix.join(posix.dirname(file),spec));
   if(target==='src/lib/supabase/admin')return {adminDb:()=>db};
   if(target==='src/lib/mercadopago/client')return {mp,ProviderError,withProviderBudget:work=>work()};
   if(target==='src/lib/config')return {SITE_URL:site};
   if(!target.startsWith('src/lib/')&&!target.startsWith('src/app/'))throw new Error('Unexpected module blocked');
   if(!target.endsWith('.json'))target+='.ts';return load(target);
  }
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',compiled)(resolve,module,module.exports);
  return module.exports;
 }
 function approve(id,status='approved') {
  const s=subscriptions.get(id);Object.assign(s,{status:'authorized',last_modified:stamp()});
  const pid=String(instance*100000+(++sequence)),iid=String(instance*100000+(++sequence)),date=stamp();
  const amount=s.auto_recurring.transaction_amount;
  const invoice={id:iid,preapproval_id:id,external_reference:s.external_reference,transaction_amount:amount,currency_id:'ARS',debit_date:date,last_modified:date,status:'processed',payment:{id:pid,status}};
  invoices.set(iid,invoice);payments.set(pid,{id:pid,collector_id:Number(sellerId),payer:{id:202},status,transaction_amount:amount,currency_id:'ARS',date_approved:status==='approved'?date:undefined,date_last_updated:date});return invoice;
 }
 return {db,load,calls,subscriptions,invoices,payments,approve,stamp};
}

export async function compatibilityTests({pg,A,B,test,scalar}) {
 const refs=['origin/main'];
 try{execFileSync('git',['rev-parse','--verify','origin/staging'],{stdio:'ignore'});refs.push('origin/staging');}catch{/* The optional staging branch may have been retired. */}
 if(process.env.BILLING_DEPLOYED_COMMIT){assert.match(process.env.BILLING_DEPLOYED_COMMIT,/^[a-f0-9]{7,40}$/i);refs.push(process.env.BILLING_DEPLOYED_COMMIT);}
 const unique=new Map();for(const ref of refs){const sha=execFileSync('git',['rev-parse',`${ref}^{commit}`],{encoding:'utf8'}).trim();unique.set(sha,ref);}
 for(const [sha,ref] of unique)await test(`compatibilidad: servidor real ${ref} (${sha.slice(0,8)}) y nuevo comparten Expand`,async()=>{
  const hasIsolation=execFileSync('git',['show',`${sha}:src/lib/billing/runtime.ts`],{encoding:'utf8'}).includes('billing_apply_sync_v2');
  const names=['MERCADOPAGO_ENVIRONMENT','MERCADOPAGO_SELLER_ID','BILLING_TEST_USER_ID','MERCADOPAGO_ACCESS_TOKEN','MERCADOPAGO_PRO_PLAN_ID','MERCADOPAGO_WEBHOOK_SECRET','SUPABASE_SECRET_KEY','VERCEL','VERCEL_ENV'];
  const saved=Object.fromEntries(names.map(n=>[n,process.env[n]]));
  try {
   Object.assign(process.env,{MERCADOPAGO_ENVIRONMENT:'production',MERCADOPAGO_SELLER_ID:'101',MERCADOPAGO_ACCESS_TOKEN:'isolated-fixture-not-real',MERCADOPAGO_PRO_PLAN_ID:'catalog',MERCADOPAGO_WEBHOOK_SECRET:'fixture-webhook-secret',SUPABASE_SECRET_KEY:'isolated-fixture-not-real'});
   delete process.env.VERCEL;delete process.env.VERCEL_ENV;delete process.env.BILLING_TEST_USER_ID;
   const old=server(pg,sha,'101'),modern=server(pg,null,'101'),runtime=old.load('src/lib/billing/runtime.ts'),v2=modern.load('src/lib/billing/runtime.ts');
   const checkout=await runtime.subscribe(A,'buyer@example.invalid');assert.match(checkout.checkout_url,/mercadopago/);
   const a=(await pg.query(`select * from billing_agreements where owner_id='${A}'`)).rows[0];
   assert.equal(a.environment,hasIsolation?'production':'legacy');assert.equal(a.seller_id,hasIsolation?'101':null);
   assert.equal((await runtime.getUserEntitlements(A)).premium,false);
   const invoice=old.approve(a.provider_subscription_id);
   const requestId='compat-request',ts=String(Date.now()),id=a.provider_subscription_id,secret=process.env.MERCADOPAGO_WEBHOOK_SECRET;
   const signature=createHmac('sha256',secret).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex');
   const route=old.load('src/app/api/mercadopago/webhook/route.ts');
   const notice=()=>new Request(`https://local-billing.example/api/mercadopago/webhook?data.id=${id}`,{method:'POST',headers:{'content-type':'application/json','x-request-id':requestId,'x-signature':`ts=${ts},v1=${signature}`},body:JSON.stringify({type:'subscription_preapproval',data:{id}})});
   assert.equal((await route.POST(notice())).status,200);assert.equal((await route.POST(notice())).status,200);
   assert.equal((await runtime.getUserEntitlements(A)).premium,true);
   assert.equal(await scalar(`select count(*)::int from subscription_payments where owner_id='${A}'`),1);
   await pg.exec(`update billing_agreements set reconcile_after=now()-interval '1 second' where id='${a.id}'`);
   assert.equal((await runtime.reconcile()).failed,0);
   assert.equal((await runtime.cancel(A)).canceled,true);
   assert.equal((await runtime.getUserEntitlements(A)).premium,true);
   assert.equal(await scalar(`select environment from billing_agreements where id='${a.id}'`),hasIsolation?'production':'legacy');
   // New server performs its own real subscription and verified promotion.
   await v2.subscribe(B,'second-buyer@example.invalid');
   const b=(await pg.query(`select * from billing_agreements where owner_id='${B}'`)).rows[0];modern.approve(b.provider_subscription_id);
   await v2.synchronize(B);assert.equal((await v2.getUserEntitlements(B)).premium,true);
   // Execute the current Route Handler too, not only its processing helper.
   const modernRequestId='modern-http',modernTs=String(Date.now()),modernId=b.provider_subscription_id;
   const modernSignature=createHmac('sha256',secret).update(`id:${modernId};request-id:${modernRequestId};ts:${modernTs};`).digest('hex');
   const modernRoute=modern.load('src/app/api/mercadopago/webhook/route.ts');
   assert.equal((await modernRoute.POST(new Request(`https://local-billing.example/api/mercadopago/webhook?data.id=${modernId}`,{method:'POST',headers:{'content-type':'application/json','x-request-id':modernRequestId,'x-signature':`ts=${modernTs},v1=${modernSignature}`},body:JSON.stringify({type:'subscription_preapproval',data:{id:modernId}})}))).status,200);
   const key='modern-event';await pg.exec(`insert into billing_webhook_events(event_key,event_type,resource_id,environment,seller_id) values('${key}','subscription_preapproval','${b.provider_subscription_id}','production','101')`);
   await v2.processEvent(key);assert.equal(await scalar(`select processing_status from billing_webhook_events where event_key='${key}'`),'processed');
   await pg.exec(`update billing_agreements set reconcile_after=now()-interval '1 second' where id='${b.id}'`);
   // Share canonical provider state for legacy recovery of A during the new cron.
   for(const kind of ['subscriptions','invoices','payments'])for(const [id,value] of old[kind])modern[kind].set(id,value);
   assert.equal((await v2.reconcile()).failed,0);
   await v2.synchronize(A);
   assert.equal(await scalar(`select environment from billing_agreements where id='${a.id}'`),'production');
   assert.equal(await scalar(`select seller_id from billing_agreements where id='${a.id}'`),'101');
   // Old binaries still operate on resources promoted by the new binary.
   for(const kind of ['subscriptions','invoices','payments'])for(const [id,value] of modern[kind])old[kind].set(id,value);
   await runtime.synchronize(A);assert.equal((await runtime.getUserEntitlements(A)).premium,true);
   assert.equal((await v2.cancel(B)).canceled,true);
   assert.equal((await runtime.cancel(B)).canceled,true);
   assert.equal((await v2.getUserEntitlements(B)).premium,true);
   // Test server is physically invisible to either old or new production cron.
   const C='99999999-9999-4999-8999-999999999999';
   await pg.exec(`insert into auth.users(id,email) values('${C}','compat-fiction@example.invalid');insert into private.billing_test_account(owner_id) values('${C}')`);
   Object.assign(process.env,{MERCADOPAGO_ENVIRONMENT:'test',MERCADOPAGO_SELLER_ID:'3779671542',BILLING_TEST_USER_ID:C});
   const fake=server(pg,null,'3779671542'),trial=fake.load('src/lib/billing/runtime.ts');
   const before=(await pg.query(`select row_to_json(s) as row from subscriptions s where owner_id in ('${A}','${B}') order by owner_id`)).rows;
   const realLedger=async()=>({agreements:(await pg.query('select row_to_json(a) as row from billing_agreements a order by id')).rows,payments:(await pg.query('select row_to_json(p) as row from subscription_payments p order by id')).rows,events:(await pg.query('select row_to_json(e) as row from billing_webhook_events e order by event_key')).rows});
   const ledgerBefore=await realLedger();
   await assert.rejects(trial.subscribe(A,'buyer@example.invalid'),/TEST_USER_ONLY/);
   await trial.subscribe(C,'fiction-buyer@example.invalid');
   const c=(await pg.query(`select * from billing_test_agreements where owner_id='${C}'`)).rows[0];fake.approve(c.provider_subscription_id);await trial.synchronize(C);
   const fakeId=c.provider_subscription_id,fakeTs=String(Date.now()),fakeRequest='test-http';
   const fakeSignature=createHmac('sha256',secret).update(`id:${fakeId};request-id:${fakeRequest};ts:${fakeTs};`).digest('hex');
   const fakeRoute=fake.load('src/app/api/mercadopago/webhook/route.ts');
   assert.equal((await fakeRoute.POST(new Request(`https://local-billing.example/api/mercadopago/webhook?data.id=${fakeId}`,{method:'POST',headers:{'content-type':'application/json','x-request-id':fakeRequest,'x-signature':`ts=${fakeTs},v1=${fakeSignature}`},body:JSON.stringify({type:'subscription_preapproval',data:{id:fakeId}})}))).status,200);
   assert.equal(await scalar('select count(*)::int from billing_test_webhook_events'),1);
   assert.equal((await trial.getUserEntitlements(C)).premium,true);
   await assert.rejects(trial.reconcile(),/TEST_RECONCILIATION_DISABLED/);
   await assert.rejects(trial.cancel(A),/TEST_USER_ONLY/);
   assert.equal((await trial.cancel(C)).canceled,true);
   assert.deepEqual((await pg.query(`select row_to_json(s) as row from subscriptions s where owner_id in ('${A}','${B}') order by owner_id`)).rows,before);
   assert.deepEqual(await realLedger(),ledgerBefore);
   Object.assign(process.env,{MERCADOPAGO_ENVIRONMENT:'production',MERCADOPAGO_SELLER_ID:'101'});delete process.env.BILLING_TEST_USER_ID;
   const count=old.calls.length;await runtime.reconcile();
   assert.equal(old.calls.slice(count).some(call=>call.path.includes(c.provider_subscription_id)),false);
   assert.equal(await scalar(`select count(*)::int from billing_agreements where owner_id='${C}'`),0);
   assert.equal(invoice.preapproval_id,a.provider_subscription_id);
   console.log(`  Git verificado: ${ref}=${sha}; proveedor simulado, SQL real en memoria`);
  } finally {for(const name of names)if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}
 });
}

export async function checkoutOfferTests({pg,A,B,test,scalar}) {
 await test('precio temporal global: nuevas altas a 50, existentes intactas y restauracion a 14900',async()=>{
  const names=['MERCADOPAGO_ENVIRONMENT','MERCADOPAGO_SELLER_ID','MERCADOPAGO_ACCESS_TOKEN','MERCADOPAGO_PRO_PLAN_ID','MERCADOPAGO_WEBHOOK_SECRET','SUPABASE_SECRET_KEY','VERCEL','VERCEL_ENV'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  try {
   Object.assign(process.env,{MERCADOPAGO_ENVIRONMENT:'production',MERCADOPAGO_SELLER_ID:'1355208203',MERCADOPAGO_ACCESS_TOKEN:'launch-fixture-not-real',MERCADOPAGO_PRO_PLAN_ID:'catalog',MERCADOPAGO_WEBHOOK_SECRET:'launch-fixture-webhook',SUPABASE_SECRET_KEY:'launch-fixture-not-real'});
   delete process.env.VERCEL;delete process.env.VERCEL_ENV;
   const commercial=JSON.parse(readFileSync('src/lib/billing/catalog.json','utf8'));
   assert.equal(commercial.amount,14900);assert.equal(commercial.temporaryAmount,undefined);
   const modern=server(pg,null,'1355208203','https://local-billing.example',{...commercial,temporaryAmount:50}),runtime=modern.load('src/lib/billing/runtime.ts');
   const previous=server(pg,null,'1355208203'),normal=previous.load('src/lib/billing/runtime.ts');
   assert.equal((await normal.status(A,false)).catalog.amount,14900);
   assert.equal((await normal.status(A,false)).temporary_price,false);
   assert.equal((await runtime.status(A,false)).catalog.amount,50);
   assert.equal((await runtime.status(B,false)).catalog.amount,50);
   // Preserve a pending contract made at the original public price.
   await normal.subscribe(B,'existing-buyer@example.invalid');
   const b=(await pg.query(`select * from billing_agreements where owner_id='${B}'`)).rows[0];
   assert.equal(Number(b.amount),14900);
   assert.equal((await runtime.status(B,false)).available,false);
   const beforeConflict=modern.calls.filter(call=>call.method==='POST').length;
   await assert.rejects(runtime.subscribe(B,'existing-buyer@example.invalid'),/CHECKOUT_PRICE_CHANGED/);
   assert.equal(modern.calls.filter(call=>call.method==='POST').length,beforeConflict);
   await runtime.subscribe(A,'buyer@example.invalid');
   const a=(await pg.query(`select * from billing_agreements where owner_id='${A}'`)).rows[0];
   assert.equal(Number(a.amount),50);assert.equal(a.environment,'production');assert.equal(a.seller_id,'1355208203');
   assert.equal(modern.subscriptions.get(a.provider_subscription_id).auto_recurring.transaction_amount,50);
   await runtime.subscribe(A,'buyer@example.invalid');
   assert.equal(modern.calls.filter(call=>call.path==='/preapproval'&&call.method==='POST').length,1);
   assert.equal((await runtime.getUserEntitlements(A)).premium,false);
   const D='88888888-8888-4888-8888-888888888888';
   await pg.exec(`insert into auth.users(id,email) values('${D}','another-real-account@example.invalid')`);
   await runtime.subscribe(D,'another-buyer@example.invalid');
   assert.equal(Number(await scalar(`select amount from billing_agreements where owner_id='${D}'`)),50);
   const invoice=modern.approve(a.provider_subscription_id),id=String(invoice.id),ts=String(Date.now()),requestId='global-50-webhook';
   const signature=createHmac('sha256',process.env.MERCADOPAGO_WEBHOOK_SECRET).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex');
   const route=modern.load('src/app/api/mercadopago/webhook/route.ts');
   const notice=()=>new Request(`https://local-billing.example/api/mercadopago/webhook?data.id=${id}`,{method:'POST',headers:{'content-type':'application/json','x-request-id':requestId,'x-signature':`ts=${ts},v1=${signature}`},body:JSON.stringify({type:'subscription_authorized_payment',data:{id}})});
   assert.equal((await route.POST(notice())).status,200);assert.equal((await route.POST(notice())).status,200);
   assert.equal((await runtime.getUserEntitlements(A)).premium,true);assert.equal((await runtime.getUserEntitlements(B)).premium,false);
   assert.equal(await scalar(`select count(*)::int from subscription_payments where owner_id='${A}' and amount=50 and verified`),1);
   assert.equal(await scalar('select count(*)::int from billing_test_agreements'),0);
   // The restored current server validates paid 50 contracts against their ledger.
   for(const kind of ['subscriptions','invoices','payments'])for(const [id,value] of modern[kind])previous[kind].set(id,value);
   await normal.synchronize(A);
   assert.equal((await normal.status(A,false)).catalog.amount,14900);
   assert.equal((await normal.status(A,false)).agreement.amount,50);
   assert.equal((await normal.cancel(A)).canceled,true);assert.equal((await normal.getUserEntitlements(A)).premium,true);
   const C='99999999-9999-4999-8999-999999999999';
   await pg.exec(`insert into auth.users(id,email) values('${C}','global-price-fiction@example.invalid');insert into private.billing_test_account(owner_id) values('${C}')`);
   const before=modern.calls.length;
   await assert.rejects(runtime.subscribe(C,'fiction@example.invalid'),/BILLING_SCOPE_MISMATCH/);
   assert.equal(modern.calls.length,before);assert.equal(await scalar(`select count(*)::int from billing_agreements where owner_id='${C}'`),0);
  } finally {for(const name of names)if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}
 });
}
