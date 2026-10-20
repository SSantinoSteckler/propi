import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { handleWebhook, type WebhookNotice } from '../src/lib/mercadopago/webhook-handler';
import { processBillingEvent, type BillingEvent, type EventDependencies } from '../src/lib/billing/event-processing';
import { createAdminFetch } from '../src/lib/supabase/admin-transport';
import { BillingError } from '../src/lib/billing/domain';
import type { Agreement, MPInvoice, MPSubscription } from '../src/lib/billing/types';
const secret='isolated-webhook-secret-not-real';
const agreement={id:'local-agreement',owner_id:'owner-from-database',external_reference:'opaque-reference',provider_subscription_id:'subscription-123'} as Agreement;
const subscription={id:'subscription-123',external_reference:agreement.external_reference,status:'authorized'} as MPSubscription;
const invoice={id:'invoice-123',preapproval_id:subscription.id,payment:{id:'payment-123'}} as MPInvoice;
function request(type='subscription_preapproval',id=subscription.id,options:{requestId?:string;bodyId?:string;timestamp?:number;extraSignature?:string;extraBody?:object}={}) {
 const requestId=options.requestId||'request-123';const ts=String(options.timestamp??Date.now());
 const signature=createHmac('sha256',secret).update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex');
 return new Request(`https://propi.example/api/mercadopago/webhook?data.id=${id}`,{method:'POST',headers:{'content-type':'application/json','x-request-id':requestId,'x-signature':`ts=${ts},v1=${signature}${options.extraSignature||''}`},body:JSON.stringify({type,data:{id:options.bodyId||id},...options.extraBody})});
}
function harness() {
 const events=new Map<string,BillingEvent>();let syncCount=0,subscriptionReads=0,invoiceReads=0;const owners:string[]=[];
 const locks=new Set<string>();
 const dependencies:EventDependencies={
  lock:async(key,work)=>{if(locks.has(key))throw new BillingError('IN_PROGRESS');locks.add(key);try{return await work();}finally{locks.delete(key);}},
  load:async key=>({...events.get(key)!}),
  update:async(key,values)=>{Object.assign(events.get(key)!,values);},
  subscription:async()=>{subscriptionReads++;return subscription;},invoice:async()=>{invoiceReads++;return invoice;},
  invoicesForPayment:async()=>[invoice],findBySubscription:async()=>agreement,findByReference:async()=>agreement,
  synchronize:async(a)=>{syncCount++;owners.push(a.owner_id);},
 };
 const deliver=async(notice:WebhookNotice)=>{
  if(!events.has(notice.key))events.set(notice.key,{event_key:notice.key,event_type:notice.type,resource_id:notice.resourceId,processing_status:'pending',attempts:0});
  await processBillingEvent(notice.key,dependencies);
 };
 return {events,dependencies,deliver,counts:()=>({syncCount,subscriptionReads,invoiceReads,owners})};
}
test('notificación firmada consulta el recurso canónico y usa el propietario guardado',async()=>{
 const h=harness();const response=await handleWebhook(request(undefined,undefined,{extraBody:{user_id:'attacker',status:'approved',plan:'pro'}}),secret,h.deliver);
 expect(response.status).toBe(200);expect(h.counts()).toMatchObject({syncCount:1,subscriptionReads:1,owners:[agreement.owner_id]});
 expect([...h.events.values()][0]).toMatchObject({processing_status:'processed',attempts:1});
 expect(response.headers.get('cache-control')).toBe('no-store');
});
test('duplicar el mismo webhook no repite sincronización ni reinicia intentos',async()=>{
 const h=harness();expect((await handleWebhook(request(),secret,h.deliver)).status).toBe(200);expect((await handleWebhook(request(),secret,h.deliver)).status).toBe(200);
 expect(h.events.size).toBe(1);expect(h.counts().syncCount).toBe(1);expect([...h.events.values()][0].attempts).toBe(1);
});
test('evento de factura recurrente recupera correlación aunque llegue antes que la suscripción',async()=>{
 const h=harness();h.dependencies.findBySubscription=async()=>null;let reference:string|undefined;
 h.dependencies.findByReference=async(value)=>{reference=value;return agreement;};
 expect((await handleWebhook(request('subscription_authorized_payment','invoice-123'),secret,h.deliver)).status).toBe(200);
 expect(reference).toBe(agreement.external_reference);expect(h.counts()).toMatchObject({invoiceReads:1,subscriptionReads:1,syncCount:1});
});
test('evento payment se correlaciona mediante su factura y suscripción',async()=>{
 const h=harness();expect((await handleWebhook(request('payment','payment-123'),secret,h.deliver)).status).toBe(200);expect(h.counts().syncCount).toBe(1);
});
test('error temporal conserva el evento para reintento y no se marca como procesado',async()=>{
 const h=harness();h.dependencies.synchronize=async()=>{throw new BillingError('PROVIDER_UNAVAILABLE',503);};
 expect((await handleWebhook(request(),secret,h.deliver)).status).toBe(503);
 expect([...h.events.values()][0]).toMatchObject({processing_status:'failed',attempts:1});
 h.dependencies.synchronize=async()=>{};
 expect((await handleWebhook(request(),secret,h.deliver)).status).toBe(200);expect([...h.events.values()][0]).toMatchObject({processing_status:'processed',attempts:2});
});
test('firma, timestamp vencido, cuerpo discordante y firma malformada no alcanzan la base',async()=>{
 let deliveries=0;const deliver=async()=>{deliveries++;};
 expect((await handleWebhook(request(),undefined,deliver)).status).toBe(503);
 expect((await handleWebhook(request(),'wrong-secret',deliver)).status).toBe(401);
 expect((await handleWebhook(request(undefined,undefined,{timestamp:Date.now()-600000}),secret,deliver)).status).toBe(401);
 expect((await handleWebhook(request(undefined,undefined,{bodyId:'other'}),secret,deliver)).status).toBe(400);
 expect((await handleWebhook(request(undefined,undefined,{extraSignature:'=unexpected'}),secret,deliver)).status).toBe(401);
 expect(deliveries).toBe(0);
});
test('plan y temas desconocidos no activan Premium ni consultan pagos',async()=>{
 const h=harness();expect((await handleWebhook(request('subscription_preapproval_plan','plan-123'),secret,h.deliver)).status).toBe(200);
 expect([...h.events.values()][0].processing_status).toBe('ignored');expect(h.counts().syncCount).toBe(0);
 const unknown=await handleWebhook(request('unknown_topic'),secret,h.deliver);expect(unknown.status).toBe(200);expect(await unknown.json()).toMatchObject({ignored:true});expect(h.events.size).toBe(1);
});
test('recursos ambiguos o ajenos no se sincronizan',async()=>{
 const h=harness();h.dependencies.invoicesForPayment=async()=>[{...invoice,payment:{id:'another-payment'}}];
 expect((await handleWebhook(request('payment','payment-123'),secret,h.deliver)).status).toBe(502);expect(h.counts().syncCount).toBe(0);
});
test('sb_secret se envía al REST de Supabase sin Bearer y con User-Agent de servidor',async()=>{
 let calls=0;
 const send:typeof fetch=async(_input,options)=>{calls++;const headers=new Headers(options?.headers);expect(headers.get('apikey')).toBe('sb_secret_fixture');expect(headers.has('authorization')).toBe(false);expect(headers.get('user-agent')).toContain('propi-billing-server');return Response.json([]);};
 const fetcher=createAdminFetch('https://database.supabase.co','sb_secret_fixture',send);
 await fetcher('https://database.supabase.co/rest/v1/billing_webhook_events',{headers:{Authorization:'Bearer sb_secret_fixture'}});
 await expect(fetcher('https://other.example/rest/v1/events')).rejects.toThrow('INVALID_ADMIN_DESTINATION');expect(calls).toBe(1);
});
