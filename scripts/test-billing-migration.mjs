import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Runs ONLY in the disposable PGlite engine, before/after applying isolation.
export async function testBillingMigration(pg,sql) {
 const owner='88888888-8888-4888-8888-888888888888';
 await pg.exec(`insert into auth.users(id,email) values('${owner}','legacy-migration@example.invalid')`);
 const a=(await pg.query(`insert into billing_agreements(owner_id,catalog_plan_id,amount,currency,status,creation_state,provider_subscription_id)
  values('${owner}','legacy-catalog',14900,'ARS','authorized','ready','legacy-subscription') returning *`)).rows[0];
 await pg.exec(`insert into subscription_payments(agreement_id,owner_id,provider_invoice_id,amount,currency,status,invoice_status,verified,coverage_start,coverage_end,provider_updated_at)
  values('${a.id}','${owner}','legacy-invoice',14900,'ARS','approved','processed',true,now()-interval '1 day',now()+interval '20 days',now())`);
 const scalar=async query=>Object.values((await pg.query(query)).rows[0])[0];
 const oldDefinition=await scalar("select pg_get_functiondef('public.billing_apply_sync(uuid,uuid,jsonb,jsonb)'::regprocedure)");
 const oldAcl=await scalar("select proacl::text from pg_proc where oid='public.billing_apply_sync(uuid,uuid,jsonb,jsonb)'::regprocedure");
 assert.equal(await scalar(`select private.effective_plan('${owner}')`),'pro');
 await pg.exec(await readFile('supabase/diagnostics/billing-isolation-before.sql','utf8'));
 // Unexpected custom SQL must fail before any schema changes or unsafe cloning.
 await pg.exec(`create or replace function public.billing_apply_sync(p_id uuid,p_token uuid,p_snapshot jsonb,p_payments jsonb) returns boolean language plpgsql security definer set search_path='' as $$ begin return false; end $$`);
 await assert.rejects(pg.exec(sql),/Baseline SQL inesperada/);await pg.exec('rollback');
 assert.equal(await scalar("select to_regclass('private.billing_expand_backup')"),null);
 await pg.exec(oldDefinition);
 console.log('✓ divergencia de funciones previas bloquea Expand sin cambios parciales');
 // An error before COMMIT must restore the old function, schema and paid access.
 await assert.rejects(pg.exec(sql.replace(/commit;\s*$/i,'select 1 / 0;\ncommit;')),/division by zero/i);
 await pg.exec('rollback');
 assert.equal(await scalar("select to_regclass('private.billing_test_account')"),null);
 assert.equal(await scalar("select count(*)::int from information_schema.columns where table_schema='public' and table_name='billing_agreements' and column_name='environment'"),0);
 assert.equal(await scalar(`select private.effective_plan('${owner}')`),'pro');
 console.log('✓ error antes de COMMIT revierte íntegramente el esquema y conserva cobertura');
 await pg.exec(sql);
 await pg.exec(await readFile('supabase/diagnostics/billing-isolation-after.sql','utf8'));
 await pg.exec(await readFile('supabase/diagnostics/billing-contract-readiness.sql','utf8'));
 console.log('✓ consultas de diagnóstico antes/después validadas en transacciones de solo lectura');
 assert.equal(await scalar(`select private.effective_plan('${owner}')`),'pro');
 assert.equal(await scalar(`select seller_id from billing_agreements where id='${a.id}'`),null);
 assert.equal(await scalar("select pg_get_functiondef('public.billing_apply_sync(uuid,uuid,jsonb,jsonb)'::regprocedure)"),oldDefinition);
 assert.equal(await scalar("select proacl::text from pg_proc where oid='public.billing_apply_sync(uuid,uuid,jsonb,jsonb)'::regprocedure"),oldAcl);
 assert.equal(await scalar(`select environment from billing_agreements where id='${a.id}'`),'legacy');
 await pg.exec(`insert into billing_agreements(owner_id,catalog_plan_id,amount,currency,creation_state)
  values('${owner}','old-server',14900,'ARS','failed')`);
 const token=await scalar(`select billing_acquire_lock('billing:${owner}')`);
 const oldSnapshot=JSON.stringify({id:'legacy-subscription',external_reference:a.external_reference,status:'authorized',updated_at:new Date().toISOString()});
 await pg.exec(`select billing_apply_sync('${a.id}','${token}','${oldSnapshot}'::jsonb,'[]'::jsonb)`);
 assert.equal(await scalar(`select environment from billing_agreements where id='${a.id}'`),'legacy');
 assert.equal(await scalar(`select seller_id from billing_agreements where id='${a.id}'`),null);
 console.log('✓ RPC/ACL originales intactos: INSERT y sincronización antiguos funcionan sin verificar un vendedor desconocido');
 const blockedContract=await readFile('supabase/deferred/202610200003_billing_contract.sql','utf8');
 await assert.rejects(pg.exec(blockedContract),/Contract bloqueado/);
 await pg.exec('rollback');
 assert.equal(await scalar('select contracted from private.billing_rollout'),false);
 const snapshot=JSON.stringify({id:'legacy-subscription',external_reference:a.external_reference,status:'authorized',updated_at:new Date().toISOString(),environment:'production',seller_id:'101'});
 await pg.exec(`select billing_apply_sync_v2('${a.id}','${token}','${snapshot}'::jsonb,'[]'::jsonb)`);
 // Binding a canonically validated seller must not revoke old approved coverage.
 assert.equal(await scalar(`select private.effective_plan('${owner}')`),'pro');
 assert.equal(await scalar(`select seller_id from billing_agreements where id='${a.id}'`),'101');
 assert.equal(await scalar(`select amount::int from subscription_payments where agreement_id='${a.id}'`),14900);
 await pg.exec(`delete from auth.users where id='${owner}';delete from private.billing_locks where key='billing:${owner}'`);
 const contract=(await readFile('supabase/deferred/202610200003_billing_contract.sql','utf8')).replace(/^begin;$/m,'').replace(/^commit;$/m,'');
 const restore=(await readFile('supabase/rollback/billing-restore-compatibility.sql','utf8')).replace(/^begin;$/m,'').replace(/^commit;$/m,'');
 await pg.exec('begin');
 await pg.exec(contract);
 assert.equal(await scalar('select contracted from private.billing_rollout'),true);
 await assert.rejects(pg.exec(`select billing_apply_sync(null,null,'{}','[]')`),/Servidor antiguo retirado/);
 // The failed statement aborted the transaction; restore a savepoint on the next
 // independent transaction instead of committing any deferred DDL in this suite.
 await pg.exec('rollback');
 await pg.exec('begin');await pg.exec(contract);await pg.exec(restore);
 assert.equal(await scalar('select contracted from private.billing_rollout'),false);
 assert.equal(await scalar("select pg_get_functiondef('public.billing_apply_sync(uuid,uuid,jsonb,jsonb)'::regprocedure)"),oldDefinition);
 await pg.exec('rollback');
 console.log('✓ Contract diferido rechaza servidor antiguo y rollback restaura su definición exacta sin borrar datos');
 console.log('✓ migración de aislamiento conserva cobertura y datos de facturación preexistentes');
}
