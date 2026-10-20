-- SQL Editor/postgres. READ ONLY. Does not apply or rehearse the migration.
-- Save results locally for comparison; aggregate counts can change with traffic.
begin transaction read only;
select current_database() as database_name, current_user as executor,
 current_setting('server_version') as postgres_version;

select
 to_regclass('public.billing_agreements') is not null as agreements_exist,
 to_regclass('public.subscription_payments') is not null as payments_exist,
 to_regclass('public.billing_webhook_events') is not null as events_exist,
 to_regprocedure('public.billing_apply_sync(uuid,uuid,jsonb,jsonb)') is not null as sync_exists,
 to_regprocedure('private.effective_plan(uuid)') is not null as plan_exists,
 to_regclass('private.billing_test_account') is not null as isolation_table_already_exists,
 to_regprocedure('private.billing_apply_production(uuid,uuid,jsonb,jsonb)') is not null as internal_sync_already_exists;

-- Zero rows expected for new columns before a first installation.
select table_schema,table_name,column_name,data_type,column_default,is_nullable
from information_schema.columns
where table_schema='public' and table_name in ('billing_agreements','subscription_payments','billing_webhook_events')
 and column_name in ('environment','seller_id') order by table_name,column_name;

-- No email, user UUID, external reference, token or card data is returned.
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
-- Useful for detecting changes to effective access without exposing account IDs.
select private.effective_plan(p.id) as effective_plan,count(*) as rows
from public.profiles p group by private.effective_plan(p.id) order by effective_plan;

select n.nspname as schema_name,c.relname as table_name,c.relrowsecurity as rls_enabled,
 pg_size_pretty(pg_total_relation_size(c.oid)) as total_size
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('profiles','properties','subscriptions','billing_agreements','subscription_payments','billing_webhook_events');
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('profiles','properties','subscriptions','billing_agreements','subscription_payments','billing_webhook_events')
order by tablename,policyname;

-- Save original definitions/ACLs for a reviewed compensating migration.
-- Function source may contain custom code: keep output private.
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
 pg_get_userbyid(p.proowner) as owner,p.prosecdef,p.proacl,p.proconfig,
 pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('billing_apply_sync','billing_get_entitlements'))
 or (n.nspname='private' and p.proname='effective_plan') order by n.nspname,p.proname;

-- Only session metadata, no query text or personal data. Waiting locks indicate
-- a reason to postpone DDL; absence does not guarantee zero interruption.
select l.relation::regclass as relation,l.mode,l.granted,count(*) as sessions
from pg_locks l where l.relation in
 (to_regclass('public.profiles'),to_regclass('public.billing_agreements'),to_regclass('public.subscription_payments'),to_regclass('public.billing_webhook_events'))
group by l.relation,l.mode,l.granted order by relation,mode;
commit;
