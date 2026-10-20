-- Run in the project's Supabase SQL Editor. Read-only: no DDL or data changes.
-- Existence alone does not prove that every statement of a migration ran.
select
 to_regclass('public.billing_plan_registry') is not null as registry_exists,
 to_regclass('public.billing_agreements') is not null as agreements_exist,
 to_regclass('public.subscription_payments') is not null as payments_exist,
 to_regclass('public.billing_webhook_events') is not null as webhook_events_exist,
 to_regclass('private.billing_locks') is not null as locks_exist,
 to_regclass('private.billing_rates') is not null as rates_exist,
 to_regprocedure('public.billing_acquire_lock(text,integer)') is not null as acquire_lock_exists,
 to_regprocedure('public.billing_release_lock(text,uuid)') is not null as release_lock_exists,
 to_regprocedure('public.billing_get_entitlements(uuid)') is not null as entitlements_exist,
 to_regprocedure('public.billing_apply_sync(uuid,uuid,jsonb,jsonb)') is not null as apply_sync_exists,
 case when to_regclass('public.billing_plan_registry') is not null then
  has_table_privilege('service_role',to_regclass('public.billing_plan_registry'),'SELECT')
  and has_table_privilege('service_role',to_regclass('public.billing_plan_registry'),'INSERT')
  and has_table_privilege('service_role',to_regclass('public.billing_plan_registry'),'UPDATE')
 end as service_role_registry_permissions,
 case when to_regprocedure('public.billing_acquire_lock(text,integer)') is not null then
  has_function_privilege('service_role',to_regprocedure('public.billing_acquire_lock(text,integer)'),'EXECUTE')
 end as service_role_acquire_lock_permission;
