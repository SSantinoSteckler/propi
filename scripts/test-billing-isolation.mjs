import assert from 'node:assert/strict';

export async function isolationTests({pg,A,B,user,admin,scalar,fails,test}) {
 const C='99999999-9999-4999-8999-999999999999';
 const json=x=>`'${JSON.stringify(x).replaceAll("'","''")}'::jsonb`;
 async function designate() {
  await pg.exec(`insert into auth.users(id,email) values('${C}','aislamiento@example.invalid');
   insert into private.billing_test_account(owner_id) values('${C}')`);
 }
 async function agreement(owner=C,environment='test',seller='3779671542') {
  return (await pg.query(`insert into ${environment==='test'?'billing_test_agreements':'billing_agreements'}(owner_id,catalog_plan_id,amount,currency,environment,seller_id)
   values('${owner}','catalog',14900,'ARS','${environment}','${seller}') returning *`)).rows[0];
 }
 async function apply(a,overrides={}) {
  const token=await scalar(`select billing_acquire_lock('billing:${a.owner_id}')`);
  const snapshot={id:`mp-${a.id}`,external_reference:a.external_reference,status:'authorized',updated_at:new Date().toISOString(),environment:a.environment,seller_id:a.seller_id,...overrides};
  const payment={invoice_id:`invoice-${a.id}`,payment_id:`payment-${a.id}`,preapproval_id:snapshot.id,amount:14900,currency:'ARS',status:'approved',invoice_status:'processed',verified:true,paid_at:new Date().toISOString(),coverage_start:new Date(Date.now()-1000).toISOString(),coverage_end:new Date(Date.now()+86400000).toISOString(),updated_at:new Date().toISOString()};
  return {sql:`select billing_apply_sync_v2('${a.id}','${token}',${json(snapshot)},${json([payment])})`,payment};
 }
 const plan=owner=>scalar(`select private.effective_plan('${owner}')`);
 await test('aislamiento: solo SQL administrativo puede designar un único usuario ficticio nuevo',async()=>{
  await user(A); await fails(`insert into private.billing_test_account(owner_id) values('${A}')`,/permission denied/i);
  await admin(); await pg.exec('set role service_role'); await fails(`insert into private.billing_test_account(owner_id) values('${A}')`,/permission denied/i);
  await admin(); await fails(`insert into private.billing_test_account(owner_id) values('${A}')`,/nueva, privada/);
  await designate();
  await fails(`insert into private.billing_test_account(owner_id) values('${B}')`,/nueva, privada|unique/i);
  await fails(`update private.billing_test_account set owner_id='${B}'`,/reasignar/);
  await fails('delete from private.billing_test_account',/reasignar/);
 });
 await test('aislamiento: pago ficticio aprobado habilita solo al usuario designado sin cambiar usuarios reales',async()=>{
  await designate();
  const before=(await pg.query(`select row_to_json(s) as row from subscriptions s where owner_id in ('${A}','${B}') order by owner_id`)).rows;
  const a=await agreement(),x=await apply(a);
  await pg.exec('set role service_role');await pg.exec(x.sql);await admin();
  assert.equal(await plan(C),'pro');assert.equal(await plan(A),'free');assert.equal(await plan(B),'free');
  assert.deepEqual((await pg.query(`select row_to_json(s) as row from subscriptions s where owner_id in ('${A}','${B}') order by owner_id`)).rows,before);
  assert.equal(await scalar(`select count(*)::int from billing_test_payments where environment='test' and seller_id='3779671542' and owner_id='${C}'`),1);
  assert.equal(await scalar('select count(*)::int from subscription_payments'),0);
  await user(A);assert.equal(await scalar('select count(*)::int from billing_test_payments'),0);
  await admin();await pg.exec('update private.billing_test_account set enabled=false');assert.equal(await plan(C),'free');
 });
 await test('aislamiento: PostgreSQL rechaza acuerdos ficticios para cuentas reales y vendedor ficticio en producción',async()=>{
  await designate();
  await fails(`insert into billing_agreements(owner_id,catalog_plan_id,amount,currency,environment,seller_id) values('${A}','catalog',14900,'ARS','test','3779671542')`,/Ámbito/);
  await fails(`insert into billing_agreements(owner_id,catalog_plan_id,amount,currency,environment,seller_id) values('${A}','catalog',14900,'ARS','production','3779671542')`,/Ámbito/);
  await fails(`insert into billing_agreements(owner_id,catalog_plan_id,amount,currency,environment,seller_id) values('${C}','catalog',14900,'ARS','production','101')`,/Ámbito/);
  assert.equal(await plan(A),'free');
 });
 await test('aislamiento: snapshots ficticios no modifican acuerdos reales y ámbito/propietario son inmutables',async()=>{
  await designate();const real=await agreement(A,'production','101'),fake=await agreement();
  const x=await apply(real,{environment:'test',seller_id:'3779671542'});
  await fails(x.sql,/Ámbito|Acuerdo inexistente/);assert.equal(await plan(A),'free');
  assert.equal(await scalar(`select count(*)::int from subscription_payments where owner_id='${A}'`),0);
  await fails(`update billing_test_agreements set owner_id='${A}' where id='${fake.id}'`,/inmutable/);
  await fails(`update billing_test_agreements set environment='production',seller_id='101' where id='${fake.id}'`,/inmutable/);
  await fails(`insert into subscription_payments(agreement_id,owner_id,provider_invoice_id,amount,currency,status,invoice_status,verified,provider_updated_at) values('${fake.id}','${A}','injected',14900,'ARS','approved','processed',true,now())`,/Factura ajena/);
 });
 await test('aislamiento: consultas de reconciliación de producción excluyen acuerdos y eventos ficticios',async()=>{
  await designate();await agreement();await agreement(A,'production','101');
  await pg.exec("insert into billing_test_webhook_events(event_key,event_type,resource_id) values('test-key','payment','test-resource');insert into billing_webhook_events(event_key,event_type,resource_id,environment,seller_id) values('real-key','payment','real-resource','production','101')");
  assert.equal(await scalar("select count(*)::int from billing_agreements where environment='production' and (seller_id='101' or seller_id is null)"),1);
  assert.equal(await scalar("select event_key from billing_webhook_events where environment='production' and (seller_id='101' or seller_id is null)"),'real-key');
  // Even the UNFILTERED queries used by the real old cron see no fictitious rows.
  assert.equal(await scalar('select count(*)::int from billing_agreements'),1);
  assert.equal(await scalar('select count(*)::int from billing_webhook_events'),1);
  await user(A);await fails(`select billing_is_test_owner('${C}')`,/permission denied/);
  await fails(`select billing_apply_sync_v2(null,null,'{}','[]')`,/permission denied/);
  await fails('select * from billing_test_webhook_events',/permission denied/);
  await admin();await pg.exec('set role service_role');await fails(`select private.billing_apply_test(null,null,'{}','[]')`,/permission denied/);
 });
}
