import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { checkoutUrl, validatePlan, validateSubscription, verifyInvoice, nextBillingMonth } from '../src/lib/billing/domain';
import { reservedCreation } from '../src/lib/billing/creation';
import { verifyWebhook } from '../src/lib/mercadopago/webhooks';
import { billingRequest, subscribeSchema, cancelSchema } from '../src/lib/billing/http';
import { POST as webhook } from '../src/app/api/mercadopago/webhook/route';
import { GET as cron } from '../src/app/api/billing/reconcile/route';
import { SITE_URL } from '../src/lib/config';
import type { Agreement, MPInvoice, MPPayment, MPPlan, MPSubscription } from '../src/lib/billing/types';
const recurring={frequency:1,frequency_type:'months',transaction_amount:14900,currency_id:'ARS'};
const agreement={id:'local-id',owner_id:'owner',external_reference:'opaque-reference',provider_subscription_id:'subscription',catalog_plan_id:'plan',amount:14900,currency:'ARS'} as Agreement;
const subscription:MPSubscription={id:'subscription',collector_id:101,payer_id:202,external_reference:agreement.external_reference,status:'authorized',last_modified:'2026-10-19T10:00:00Z',auto_recurring:recurring};
const invoice:MPInvoice={id:55,preapproval_id:subscription.id,external_reference:agreement.external_reference,transaction_amount:14900,currency_id:'ARS',debit_date:'2026-10-19T00:00:00-03:00',last_modified:'2026-10-19T10:00:00Z',status:'processed',payment:{id:88,status:'approved'}};
const payment:MPPayment={id:88,collector_id:101,payer:{id:202},status:'approved',transaction_amount:14900,currency_id:'ARS',date_approved:'2026-10-19T10:00:00Z',date_last_updated:'2026-10-19T10:00:00Z'};
const verify=(i=invoice,p:MPPayment|null=payment)=>verifyInvoice(i,p,subscription,agreement,'101');
const now=Date.parse('2026-10-19T10:00:00Z'), secret='unit-test-secret';
const sign=(ts=String(now),id='ABC123',request='request-123')=>`ts=${ts},v1=${createHmac('sha256',secret).update(`id:${id.toLowerCase()};request-id:${request};ts:${ts};`).digest('hex')}`;

test('firma oficial acepta segundos/milisegundos y normaliza ID',()=>{
 expect(verifyWebhook(sign(),'request-123','ABC123',secret,now)).toBe(true);
 expect(verifyWebhook(sign(String(now/1000)),'request-123','abc123',secret,now)).toBe(true);
});
test('firma rechaza manipulación, replay vencido y parámetros duplicados',()=>{
 expect(verifyWebhook(sign(),'request-123','other',secret,now)).toBe(false);
 expect(verifyWebhook(sign(),'request-456','ABC123',secret,now)).toBe(false);
 expect(verifyWebhook(sign(),'request-123','ABC123','wrong-secret',now)).toBe(false);
 expect(verifyWebhook(sign(),'request-123','ABC123',secret,now+300001)).toBe(false);
 expect(verifyWebhook(`${sign()},ts=${now}`,'request-123','ABC123',secret,now)).toBe(false);
 expect(verifyWebhook(null,'request-123','ABC123',secret,now)).toBe(false);
});
test('checkout solamente admite HTTPS oficial de suscripciones',()=>{
 expect(checkoutUrl('https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=abc')).toContain('preapproval_id=abc');
 for(const url of ['http://www.mercadopago.com.ar/subscriptions/checkout','https://evil.test/subscriptions/checkout','https://www.mercadopago.com.ar.evil.test/subscriptions/checkout','https://user:secret@www.mercadopago.com.ar/subscriptions/checkout','https://www.mercadopago.com.ar/other']) expect(()=>checkoutUrl(url)).toThrow();
});
test('valida plan configurado, precio, vendedor, moneda y periodicidad',()=>{
 const plan:MPPlan={id:'plan',collector_id:101,status:'active',reason:'Propi Premium',back_url:'https://propi.example/dashboard/billing/return',auto_recurring:recurring};
 expect(()=>validatePlan(plan,'101',plan.back_url)).not.toThrow();
 for(const changed of [{...plan,collector_id:999},{...plan,back_url:'https://evil.test'},{...plan,auto_recurring:{...recurring,transaction_amount:1}},{...plan,auto_recurring:{...recurring,currency_id:'USD'}},{...plan,auto_recurring:{...recurring,free_trial:{frequency:1}}}]) expect(()=>validatePlan(changed,'101',plan.back_url)).toThrow();
});
test('rechaza correlación ajena y estados desconocidos',()=>{
 expect(()=>validateSubscription(subscription,agreement,'101')).not.toThrow();
 expect(()=>validateSubscription({...subscription,external_reference:'other'},agreement,'101')).toThrow();
 expect(()=>validateSubscription({...subscription,status:'approved'},agreement,'101')).toThrow();
 expect(()=>verify({...invoice,preapproval_id:'other'})).toThrow();
 expect(()=>verify(invoice,{...payment,collector_id:999})).toThrow();
 expect(()=>verify(invoice,{...payment,payer:{id:999}})).toThrow();
});
test('pago inicial aprobado habilita evidencia con cobertura mensual derivada',()=>{
 const result=verify(); expect(result.verified).toBe(true); expect(result.coverage_start).toBe('2026-10-19T03:00:00.000Z'); expect(result.coverage_end).toBe('2026-11-19T03:00:00.000Z');
});
test('autorización, programación y pago pendiente o rechazado no son cobros aprobados',()=>{
 expect(verify(invoice,null).verified).toBe(false);
 expect(verify({...invoice,status:'scheduled',payment:undefined},null).verified).toBe(false);
 for(const status of ['pending','in_process','rejected','cancelled','refunded','charged_back']) expect(verify(invoice,{...payment,status}).verified).toBe(false);
});
test('importe distinto, moneda, reembolso o fecha inválida no conceden cobertura',()=>{
 for(const changed of [{...payment,transaction_amount:1},{...payment,currency_id:'USD'},{...payment,transaction_amount_refunded:100},{...payment,date_approved:undefined},{...payment,date_approved:'invalid'}]) expect(verify(invoice,changed).verified).toBe(false);
 expect(verify({...invoice,transaction_amount:1}).verified).toBe(false);
});
test('mes calendario respeta fin de mes, año bisiesto y zona horaria',()=>{
 expect(nextBillingMonth('2024-01-31T23:00:00-03:00')).toBe('2024-03-01T02:00:00.000Z');
 expect(nextBillingMonth('2025-01-31T00:00:00-03:00')).toBe('2025-02-28T03:00:00.000Z');
 expect(nextBillingMonth('2026-12-31T12:00:00Z')).toBe('2027-01-31T12:00:00.000Z');
 expect(()=>nextBillingMonth('invalid')).toThrow();
});
test('creación persiste reserva antes del proveedor y guarda resultado',async()=>{
 const calls:string[]=[];
 const result=await reservedCreation({reserve:async()=>{calls.push('reserve');return agreement;},create:async(a)=>{expect(a.external_reference).toBe(agreement.external_reference);calls.push('provider');return subscription;},persist:async(a,s)=>{expect(s.id).toBe('subscription');calls.push('persist');return {checkout:'official'};},failed:async()=>{calls.push('failed');}});
 expect(calls).toEqual(['reserve','provider','persist']); expect(result.checkout).toBe('official');
});
test('respuesta ambigua no repite POST y conserva reserva para reconciliación',async()=>{
 let calls=0, uncertain=false;
 await expect(reservedCreation({reserve:async()=>agreement,create:async()=>{calls++;throw new Error('timeout');},persist:async()=>null,failed:async(a)=>{expect(a.id).toBe(agreement.id);uncertain=true;}})).rejects.toThrow('timeout');
 expect(calls).toBe(1); expect(uncertain).toBe(true);
});
test('reserva concurrente rechazada no llega al proveedor',async()=>{
 let reserved=false, providerCalls=0;
 const execute=()=>reservedCreation({reserve:async()=>{if(reserved)throw new Error('unique reservation');reserved=true;return agreement;},create:async()=>{providerCalls++;return subscription;},persist:async()=>true,failed:async()=>{}});
 const results=await Promise.allSettled([execute(),execute()]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1); expect(providerCalls).toBe(1);
});
test('endpoints rechazan sesión ausente y origen externo sin consultar proveedor',async()=>{
 expect((await billingRequest(new Request(`${SITE_URL}/api/billing/status`),'status')).status).toBe(401);
 expect((await billingRequest(new Request(`${SITE_URL}/api/billing/subscribe`,{method:'POST',headers:{origin:SITE_URL}}),'subscribe')).status).toBe(401);
 expect((await billingRequest(new Request(`${SITE_URL}/api/billing/cancel`,{method:'POST',headers:{origin:'https://evil.test'}}),'cancel')).status).toBe(403);
});
test('los cuerpos no admiten otra cuenta, plan ni precio y cancelar exige confirmación',()=>{
 const valid={payer_email:'comprador@example.invalid'};
 expect(subscribeSchema.safeParse(valid).success).toBe(true);
 for(const injected of [{user_id:'other'},{plan_id:'other'},{price:1},{amount:1}]) expect(subscribeSchema.safeParse({...valid,...injected}).success).toBe(false);
 expect(cancelSchema.safeParse({confirm:false}).success).toBe(false);
 expect(cancelSchema.safeParse({confirm:true,user_id:'other'}).success).toBe(false);
});
test('webhook inválido y cron sin autorización no acceden a Supabase',async()=>{
 const oldSecret=process.env.MERCADOPAGO_WEBHOOK_SECRET, oldCron=process.env.CRON_SECRET;
 try{
  process.env.MERCADOPAGO_WEBHOOK_SECRET=secret; process.env.CRON_SECRET='x'.repeat(32);
  expect((await webhook(new Request(`${SITE_URL}/api/mercadopago/webhook?data.id=123`,{method:'POST',body:'{}'}))).status).toBe(401);
  expect((await cron(new Request(`${SITE_URL}/api/billing/reconcile`))).status).toBe(401);
  delete process.env.CRON_SECRET;
  expect((await cron(new Request(`${SITE_URL}/api/billing/reconcile`))).status).toBe(503);
 }finally{
  if(oldSecret===undefined)delete process.env.MERCADOPAGO_WEBHOOK_SECRET;else process.env.MERCADOPAGO_WEBHOOK_SECRET=oldSecret;
  if(oldCron===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=oldCron;
 }
});
