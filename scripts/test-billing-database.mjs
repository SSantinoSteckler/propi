import assert from 'node:assert/strict';
export async function billingTests({pg, A, B, user, admin, scalar, fails, test, insert}) {
 await test('billing: SQL de diagnóstico comprueba objetos y permisos sin modificar datos',async()=>{
  const {readFile}=await import('node:fs/promises');
  const before=await scalar('select count(*)::int from billing_plan_registry');
  const result=await pg.query(await readFile('supabase/diagnostics/billing.sql','utf8'));
  for(const [name,value] of Object.entries(result.rows[0])) assert.equal(value,true,name);
  assert.equal(await scalar('select count(*)::int from billing_plan_registry'),before);
  assert.equal(await scalar('select count(*)::int from private.billing_locks'),0);
 });
 const json = (x) => `'${JSON.stringify(x).replaceAll("'", "''")}'::jsonb`;
 async function setup(owner=A) {
  const a = (await pg.query(`insert into billing_agreements(owner_id,catalog_plan_id,amount,currency,seller_id,environment) values('${owner}','catalog-plan',14900,'ARS','101','production') returning *`)).rows[0];
  const token = await scalar(`select billing_acquire_lock('billing:${owner}')`);
  const snapshot = {environment:'production',seller_id:'101',id:`mp-${owner}`,external_reference:a.external_reference,status:'authorized',updated_at:'2026-10-19T10:00:00Z',next_payment_date:null};
  const payment = {invoice_id:`invoice-${owner}`,payment_id:`payment-${owner}`,preapproval_id:snapshot.id,amount:14900,currency:'ARS',status:'approved',invoice_status:'processed',verified:true,paid_at:new Date().toISOString(),coverage_start:new Date(Date.now()-86400000).toISOString(),coverage_end:new Date(Date.now()+86400000).toISOString(),updated_at:'2026-10-19T10:00:00Z'};
  const apply = async (payments=[],s=snapshot,t=token) => scalar(`select billing_apply_sync('${a.id}','${t}',${json(s)},${json(payments)})`);
  return {a,token,snapshot,payment,apply};
 }
 const plan = (owner=A) => scalar(`select private.effective_plan('${owner}')`);
 await test('billing: bandeja de webhooks deduplica sin reiniciar eventos procesados',async()=>{
  const notification="insert into billing_webhook_events(event_key,event_type,resource_id) values('request-resource','subscription_preapproval','sub-id') on conflict(event_key) do nothing";
  await pg.exec(notification);
  await pg.exec("update billing_webhook_events set processing_status='processed',attempts=1 where event_key='request-resource'");
  await pg.exec(notification);
  assert.equal(await scalar('select count(*)::int from billing_webhook_events'),1);
  assert.equal(await scalar('select processing_status from billing_webhook_events'),'processed');
  assert.equal(await scalar('select attempts from billing_webhook_events'),1);
 });
 await test('billing: pago verificado no habilita Premium con suscripción todavía pendiente',async()=>{
  const x=await setup();await x.apply([x.payment],{...x.snapshot,status:'pending'});assert.equal(await plan(),'free');
  await x.apply([x.payment]);assert.equal(await plan(),'pro');
 });
 await test('billing: autorización y pago pendiente/rechazado no habilitan Premium',async()=>{
  const x=await setup(); await x.apply(); assert.equal(await plan(),'free');
  await x.apply([{...x.payment,status:'pending',verified:false}]); assert.equal(await plan(),'free');
  await x.apply([{...x.payment,status:'rejected',verified:false}]); assert.equal(await plan(),'free');
 });
 await test('billing: primer pago aprobado, duplicados y renovación',async()=>{
  const x=await setup(); await x.apply([x.payment]); assert.equal(await plan(),'pro');
  await x.apply([x.payment]); assert.equal(await scalar('select count(*)::int from subscription_payments'),1);
  await x.apply([{...x.payment,invoice_id:'renewal',payment_id:'renewal-payment',coverage_end:new Date(Date.now()+32*86400000).toISOString()}]);
  assert.equal(await plan(),'pro'); assert.equal(await scalar('select count(*)::int from subscription_payments'),2);
 });
 await test('billing: cancelación conserva cobertura pagada y un reembolso la revoca',async()=>{
  const x=await setup(); await x.apply([x.payment]);
  await x.apply([x.payment],{...x.snapshot,status:'cancelled',updated_at:'2026-10-20T10:00:00Z'}); assert.equal(await plan(),'pro');
  await x.apply([{...x.payment,status:'refunded',verified:false,updated_at:'2026-10-21T10:00:00Z'}],{...x.snapshot,status:'cancelled',updated_at:'2026-10-21T10:00:00Z'});
  assert.equal(await plan(),'free');
 });
 await test('billing: renovación fallida no borra cobertura vigente, vencimiento sin cron',async()=>{
  const x=await setup(); await x.apply([x.payment]);
  await x.apply([{...x.payment,invoice_id:'failed-renewal',payment_id:'failed-payment',status:'rejected',verified:false}]); assert.equal(await plan(),'pro');
  await pg.exec(`update subscription_payments set coverage_start=now()-interval '2 months',coverage_end=now()-interval '1 day' where verified`);
  assert.equal(await plan(),'free');
  await user(A); assert.equal((await scalar('select get_user_entitlements()')).plan,'free');
 });
 await test('billing: versiones viejas no revierten cancelaciones ni reembolsos',async()=>{
  const x=await setup(); await x.apply([x.payment]);
  const cancelled={...x.snapshot,status:'cancelled',updated_at:'2026-10-21T10:00:00Z'};
  await x.apply([{...x.payment,status:'refunded',verified:false,updated_at:cancelled.updated_at}],cancelled);
  assert.equal(await x.apply([x.payment]),false); assert.equal(await plan(),'free');
  assert.equal(await x.apply([x.payment],{...x.snapshot,updated_at:'2026-10-22T10:00:00Z'}),false);
  await x.apply([x.payment],cancelled); assert.equal(await plan(),'free');
 });
 await test('billing: locks excluyentes, lease vencido y escrituras cercadas',async()=>{
  const x=await setup(); assert.equal(await scalar(`select billing_acquire_lock('billing:${A}')`),null);
  await pg.exec(`update private.billing_locks set expires_at=now()-interval '1 second' where key='billing:${A}'`);
  const replacement=await scalar(`select billing_acquire_lock('billing:${A}')`); assert.notEqual(replacement,x.token);
  await fails(`select billing_apply_sync('${x.a.id}','${x.token}',${json(x.snapshot)},'[]')`,/Lease vencido/);
  await pg.exec(`select billing_release_lock('billing:${A}','${x.token}')`);
  assert.equal(await scalar(`select billing_acquire_lock('billing:${A}')`),null);
  assert.equal(await x.apply([],x.snapshot,replacement),true);
 });
 await test('billing: reserva única impide contrataciones duplicadas y conserva intentos inciertos',async()=>{
  const x=await setup();
  await fails(`insert into billing_agreements(owner_id,catalog_plan_id,amount,currency,seller_id,environment) values('${A}','plan',14900,'ARS','101','production')`,/unique/i);
  await pg.exec(`update billing_agreements set creation_state='uncertain' where id='${x.a.id}'`);
  await fails(`insert into billing_agreements(owner_id,catalog_plan_id,amount,currency,seller_id,environment) values('${A}','plan',14900,'ARS','101','production')`,/unique/i);
 });
 await test('billing: RLS aísla facturación y deniega cambios de plan y eventos',async()=>{
  const x=await setup(); await x.apply([x.payment]); const y=await setup(B); await y.apply([y.payment]);
  await user(A); assert.equal(await scalar('select count(*)::int from billing_agreements'),1); assert.equal(await scalar('select count(*)::int from subscription_payments'),1);
  assert.equal(await scalar(`select count(*)::int from billing_agreements where owner_id='${B}'`),0);
  await fails("update billing_agreements set status='authorized'",/permission denied/i);
  await fails('delete from subscription_payments',/permission denied/i);
  await fails('select * from billing_webhook_events',/permission denied/i);
  await fails('select * from billing_plan_registry',/permission denied/i);
  await fails(`select billing_get_entitlements('${B}')`,/permission denied/i);
  await fails(`select billing_acquire_lock('billing:${B}')`,/permission denied/i);
  await fails(`select billing_apply_sync('${y.a.id}','${y.token}',${json(y.snapshot)},'[]')`,/permission denied/i);
  await user(null); await fails('select * from billing_agreements',/permission denied/i); await fails('select get_user_entitlements()',/permission denied/i);
 });
 await test('billing: factura y propietario deben pertenecer al mismo acuerdo',async()=>{
  const x=await setup(); const y=await setup(B);
  await fails(`insert into subscription_payments(agreement_id,owner_id,provider_invoice_id,amount,currency,status,invoice_status,provider_updated_at) values('${x.a.id}','${B}','other',14900,'ARS','approved','processed',now())`,/foreign key/i);
  await fails(`select billing_apply_sync('${x.a.id}','${x.token}',${json({...x.snapshot,external_reference:y.a.external_reference})},'[]')`,/Referencia ajena/);
  await fails(`select billing_apply_sync('${x.a.id}','${x.token}',${json(x.snapshot)},${json([{...x.payment,preapproval_id:y.snapshot.id}])})`,/Factura ajena/);
 });
 await test('billing: downgrade preserva publicaciones, permite edición y bloquea nuevas',async()=>{
  const x=await setup(); await x.apply([x.payment]); await user(A);
  await pg.exec(insert(71)); await pg.exec(insert(72)); await pg.exec("update profiles set color='#123456'");
  await admin(); await x.apply([{...x.payment,status:'refunded',verified:false,updated_at:'2026-10-20T10:00:00Z'}]); await user(A);
  assert.equal(await scalar('select count(*)::int from properties'),6);
  await pg.exec("update properties set title='Edición después de vencer' where slug='test-property-72'");
  await pg.exec("update profiles set bio='Perfil conservado después de vencer'");
  await fails(insert(73),/límite de 5/i); await fails("update profiles set color='#ffffff'",/requiere Pro/i);
 });
 await test('billing: rate limiting privilegiado es persistente',async()=>{
  assert.equal(await scalar("select billing_rate_limit('example',1,60)"),true);
  assert.equal(await scalar("select billing_rate_limit('example',1,60)"),false);
 });
}
