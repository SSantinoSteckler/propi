-- SQL Editor/postgres. READ ONLY. Run only after a separately authorized migration.
-- An error is diagnostic, not a reason to rerun DDL blindly.
begin transaction read only;
select table_schema,table_name,column_name,data_type,column_default,is_nullable
from information_schema.columns
where ((table_schema='public' and table_name in ('billing_agreements','subscription_payments','billing_webhook_events') and column_name in ('environment','seller_id'))
 or (table_schema='private' and table_name='billing_test_account')) order by table_schema,table_name,column_name;
select schemaname,tablename,indexname,indexdef from pg_indexes
where tablename in ('billing_test_account','billing_test_agreements','billing_test_payments','billing_test_webhook_events') order by indexname;
select n.nspname as schema_name,c.relname as table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where t.tgname in ('billing_test_account_guard','billing_agreement_scope','billing_payment_scope','billing_test_agreement_scope','billing_test_payment_scope','billing_event_scope') order by t.tgname;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
 p.prosecdef,pg_get_userbyid(p.proowner) as owner,p.proacl,p.proconfig
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('billing_apply_sync','billing_apply_sync_v2','billing_get_entitlements','billing_is_test_owner'))
 or (n.nspname='private' and p.proname in ('billing_apply_production','billing_apply_test','effective_plan','billing_scope_allowed','guard_test_account','guard_billing_scope','guard_payment_scope'))
order by n.nspname,p.proname;

select
 has_function_privilege('service_role','public.billing_apply_sync(uuid,uuid,jsonb,jsonb)','EXECUTE') as server_can_sync,
 not has_function_privilege('authenticated','public.billing_apply_sync(uuid,uuid,jsonb,jsonb)','EXECUTE') as browser_cannot_sync,
 has_function_privilege('service_role','public.billing_apply_sync_v2(uuid,uuid,jsonb,jsonb)','EXECUTE') as server_can_sync_v2,
 not has_function_privilege('authenticated','public.billing_apply_sync_v2(uuid,uuid,jsonb,jsonb)','EXECUTE') as browser_cannot_sync_v2,
 not has_function_privilege('service_role','private.billing_apply_production(uuid,uuid,jsonb,jsonb)','EXECUTE') as server_cannot_bypass_wrapper,
 not has_table_privilege('service_role','private.billing_test_account','INSERT') as server_cannot_designate_test_owner,
 not has_table_privilege('authenticated','private.billing_test_account','SELECT') as browser_cannot_read_registry,
 not has_function_privilege('authenticated','public.billing_is_test_owner(uuid)','EXECUTE') as browser_cannot_enumerate_test_owner;
select contracted from private.billing_rollout;
select identity,captured_at from private.billing_expand_backup order by identity;
select count(*) as designated_test_accounts from private.billing_test_account;

-- Immediately after expansion: legacy only, seller_id NULL; no seller is verified.
select environment,seller_id,count(*) as rows from public.billing_agreements group by environment,seller_id order by environment,seller_id;
select environment,seller_id,count(*) as rows from public.subscription_payments group by environment,seller_id order by environment,seller_id;
select environment,seller_id,count(*) as rows from public.billing_webhook_events group by environment,seller_id order by environment,seller_id;
select count(*) as test_agreements from public.billing_test_agreements;
select count(*) as test_payments from public.billing_test_payments;
select count(*) as test_events from public.billing_test_webhook_events;
select count(*) as scope_anomalies from public.billing_agreements a
where not private.billing_scope_allowed(a.owner_id,a.environment,a.seller_id);
select count(*) as payment_scope_anomalies from public.subscription_payments p join public.billing_agreements a on a.id=p.agreement_id
where p.owner_id<>a.owner_id or p.environment<>a.environment
 or (p.seller_id is distinct from a.seller_id and not (p.environment='legacy' and p.seller_id is null));

-- Compare aggregates/permissions with the saved BEFORE output. Time-based access
-- may also expire naturally, and legitimate traffic can change row counts.
select 'profiles' as resource,count(*) as rows from public.profiles
union all select 'subscriptions',count(*) from public.subscriptions
union all select 'properties',count(*) from public.properties
union all select 'billing_agreements',count(*) from public.billing_agreements
union all select 'subscription_payments',count(*) from public.subscription_payments
union all select 'billing_webhook_events',count(*) from public.billing_webhook_events;
select plan,provider,count(*) as rows from public.subscriptions group by plan,provider order by plan,provider;
select status,creation_state,count(*) as rows from public.billing_agreements group by status,creation_state order by status,creation_state;
select status,verified,currency,count(*) as rows,sum(amount) as amount from public.subscription_payments group by status,verified,currency order by status,verified,currency;
select processing_status,count(*) as rows from public.billing_webhook_events group by processing_status order by processing_status;
select private.effective_plan(p.id) as effective_plan,count(*) as rows from public.profiles p group by private.effective_plan(p.id) order by effective_plan;
select n.nspname,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where (n.nspname='public' and c.relname in ('profiles','properties','subscriptions','billing_agreements','subscription_payments','billing_webhook_events','billing_test_agreements','billing_test_payments','billing_test_webhook_events'))
 or (n.nspname='private' and c.relname='billing_test_account');
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('profiles','properties','subscriptions','billing_agreements','subscription_payments','billing_webhook_events','billing_test_agreements','billing_test_payments','billing_test_webhook_events')
order by tablename,policyname;
commit;
