-- EXPAND only. Never execute remotely without review/authorization.
-- Replaces the UNAPPLIED incompatible draft, not an installed migration.
-- The original public.billing_apply_sync body, signature and ACL are unchanged.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';

-- Refuse unknown/customized function bodies rather than cloning unsafe SQL.
do $$ begin
 if (select md5(regexp_replace(prosrc,'\s','','g')) from pg_proc where oid='public.billing_apply_sync(uuid,uuid,jsonb,jsonb)'::regprocedure) is distinct from '91e719765a07c550b5cf73056fd02e84' then raise exception 'Baseline SQL inesperada: public.billing_apply_sync. Revisar antes de migrar'; end if;
 if (select md5(regexp_replace(prosrc,'\s','','g')) from pg_proc where oid='private.effective_plan(uuid)'::regprocedure) is distinct from 'a37e97f2d04160e421f8e17e6af1376e' then raise exception 'Baseline SQL inesperada: private.effective_plan. Revisar antes de migrar'; end if;
 if (select md5(regexp_replace(prosrc,'\s','','g')) from pg_proc where oid='public.billing_get_entitlements(uuid)'::regprocedure) is distinct from '21e180c3eb6d1c0cd4059f770a5c9d4e' then raise exception 'Baseline SQL inesperada: public.billing_get_entitlements. Revisar antes de migrar'; end if;
end $$;

-- Capture the exact installed definitions; no assumptions about a CLI rollback.
create table private.billing_expand_backup (
 identity text primary key, definition text not null, captured_at timestamptz not null default now()
);
revoke all on private.billing_expand_backup from public,anon,authenticated,service_role;
insert into private.billing_expand_backup(identity,definition)
select p.oid::regprocedure::text,pg_get_functiondef(p.oid) from pg_proc p
where p.oid in ('public.billing_apply_sync(uuid,uuid,jsonb,jsonb)'::regprocedure,
 'private.effective_plan(uuid)'::regprocedure,'public.billing_get_entitlements(uuid)'::regprocedure);
create table private.billing_rollout (
 singleton boolean primary key default true check(singleton), contracted boolean not null default false
);
insert into private.billing_rollout default values;
revoke all on private.billing_rollout from public,anon,authenticated,service_role;

-- Constant defaults are metadata-only on supported Supabase PostgreSQL versions.
-- Unknown sellers stay explicitly legacy. No data backfill or index build here.
alter table public.billing_agreements add column environment text not null default 'legacy', add column seller_id text;
alter table public.subscription_payments add column environment text not null default 'legacy', add column seller_id text;
alter table public.billing_webhook_events add column environment text not null default 'legacy', add column seller_id text;
alter table public.billing_agreements add constraint billing_production_scope check(
 (environment='legacy' and seller_id is null) or
 (environment='production' and seller_id ~ '^[1-9][0-9]{0,19}$' and seller_id is not null and seller_id<>'3779671542')) not valid;
alter table public.subscription_payments add constraint payment_production_scope check(
 (environment='legacy' and seller_id is null) or
 (environment='production' and seller_id ~ '^[1-9][0-9]{0,19}$' and seller_id is not null and seller_id<>'3779671542')) not valid;
alter table public.billing_webhook_events add constraint event_production_scope check(
 (environment='legacy' and seller_id is null) or
 (environment='production' and seller_id ~ '^[1-9][0-9]{0,19}$' and seller_id is not null and seller_id<>'3779671542')) not valid;

create table private.billing_test_account (
 singleton boolean primary key default true check(singleton),
 owner_id uuid not null unique references public.profiles(id), enabled boolean not null default true
);
revoke all on private.billing_test_account from public,anon,authenticated,service_role;
create function private.guard_test_account() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'No se puede reasignar la cuenta de prueba'; end if;
 if tg_op='UPDATE' then
  if new.owner_id<>old.owner_id then raise exception 'No se puede reasignar la cuenta de prueba'; end if;
  return new;
 end if;
 if not exists(select 1 from public.profiles where id=new.owner_id and not published)
 or exists(select 1 from public.properties where owner_id=new.owner_id)
 or exists(select 1 from public.collections where owner_id=new.owner_id)
 or exists(select 1 from public.billing_agreements where owner_id=new.owner_id)
 or exists(select 1 from public.subscriptions where owner_id=new.owner_id and plan<>'free')
 then raise exception 'La cuenta de prueba debe ser nueva, privada y sin facturación'; end if;
 return new;
end $$;
create trigger billing_test_account_guard before insert or update or delete on private.billing_test_account for each row execute function private.guard_test_account();
revoke all on function private.guard_test_account() from public,anon,authenticated,service_role;
create function public.billing_is_test_owner(p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.billing_test_account where owner_id=p_owner) $$;
revoke all on function public.billing_is_test_owner(uuid) from public,anon,authenticated;
grant execute on function public.billing_is_test_owner(uuid) to service_role;

-- Physical separation is necessary: an old service_role cron has no scope filter
-- and bypasses RLS. It must never see fictitious agreements or webhook events.
create table public.billing_test_agreements (like public.billing_agreements including all);
alter table public.billing_test_agreements alter column environment set default 'test', alter column seller_id set default '3779671542';
-- LIKE copies CHECKs, not FKs. Remove only the cloned production CHECK.
alter table public.billing_test_agreements drop constraint billing_production_scope;
alter table public.billing_test_agreements add foreign key(owner_id) references public.profiles(id) on delete cascade,
 add constraint test_agreement_scope check(environment='test' and seller_id is not distinct from '3779671542');
create table public.billing_test_payments (like public.subscription_payments including all);
alter table public.billing_test_payments alter column environment set default 'test', alter column seller_id set default '3779671542';
alter table public.billing_test_payments drop constraint payment_production_scope;
alter table public.billing_test_payments add foreign key(agreement_id,owner_id) references public.billing_test_agreements(id,owner_id) on delete cascade,
 add constraint test_payment_scope check(environment='test' and seller_id is not distinct from '3779671542');
create table public.billing_test_webhook_events (like public.billing_webhook_events including all);
alter table public.billing_test_webhook_events alter column environment set default 'test', alter column seller_id set default '3779671542';
alter table public.billing_test_webhook_events drop constraint event_production_scope;
alter table public.billing_test_webhook_events add constraint test_event_scope check(environment='test' and seller_id is not distinct from '3779671542');
alter table public.billing_test_agreements enable row level security;
alter table public.billing_test_payments enable row level security;
alter table public.billing_test_webhook_events enable row level security;
revoke all on public.billing_test_agreements,public.billing_test_payments,public.billing_test_webhook_events from public,anon,authenticated;
grant all on public.billing_test_agreements,public.billing_test_payments,public.billing_test_webhook_events to service_role;
grant select on public.billing_test_agreements,public.billing_test_payments to authenticated;
create policy billing_test_owner_read on public.billing_test_agreements for select to authenticated using(owner_id=(select auth.uid()));
create policy payment_test_owner_read on public.billing_test_payments for select to authenticated using(owner_id=(select auth.uid()));

create function private.billing_scope_allowed(p_owner uuid,p_environment text,p_seller text) returns boolean language sql stable security definer set search_path='' as $$
 select case when p_environment='test' then p_seller is not distinct from '3779671542'
  and exists(select 1 from private.billing_test_account where owner_id=p_owner and enabled)
 when p_environment='legacy' then p_seller is null and not exists(select 1 from private.billing_test_account where owner_id=p_owner)
 when p_environment='production' then p_seller is not null and p_seller ~ '^[1-9][0-9]{0,19}$' and p_seller<>'3779671542'
  and not exists(select 1 from private.billing_test_account where owner_id=p_owner)
 else false end $$;
revoke all on function private.billing_scope_allowed(uuid,text,text) from public,anon,authenticated,service_role;
create function private.guard_billing_scope() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.owner_id<>old.owner_id or
  (old.environment<>'legacy' and new.environment<>old.environment) or
  (old.seller_id is not null and new.seller_id is distinct from old.seller_id)) then raise exception 'Ámbito de facturación inmutable'; end if;
 if (tg_table_name='billing_test_agreements' and new.environment<>'test')
 or (tg_table_name='billing_agreements' and new.environment='test')
 or not private.billing_scope_allowed(new.owner_id,new.environment,new.seller_id)
 then raise exception 'Ámbito de facturación inválido'; end if;
 if new.environment='legacy' and exists(select 1 from private.billing_rollout where contracted)
 then raise exception 'Servidor antiguo retirado'; end if;
 return new;
end $$;
create trigger billing_agreement_scope before insert or update on public.billing_agreements for each row execute function private.guard_billing_scope();
create trigger billing_test_agreement_scope before insert or update on public.billing_test_agreements for each row execute function private.guard_billing_scope();
revoke all on function private.guard_billing_scope() from public,anon,authenticated,service_role;
create function private.guard_payment_scope() returns trigger language plpgsql security definer set search_path='' as $$
declare a record; begin
 if tg_table_name='billing_test_payments' then
  select * into a from public.billing_test_agreements where id=new.agreement_id and owner_id=new.owner_id;
 else select * into a from public.billing_agreements where id=new.agreement_id and owner_id=new.owner_id; end if;
 if a.id is null then raise exception 'Factura ajena: foreign key'; end if;
 if tg_op='UPDATE' and (new.agreement_id<>old.agreement_id or new.owner_id<>old.owner_id) then raise exception 'Factura ajena'; end if;
 if not private.billing_scope_allowed(a.owner_id,a.environment,a.seller_id) then raise exception 'Ámbito de facturación inválido'; end if;
 new.environment:=a.environment;new.seller_id:=a.seller_id;return new;
end $$;
create trigger billing_payment_scope before insert or update on public.subscription_payments for each row execute function private.guard_payment_scope();
create trigger billing_test_payment_scope before insert or update on public.billing_test_payments for each row execute function private.guard_payment_scope();
revoke all on function private.guard_payment_scope() from public,anon,authenticated,service_role;

create function private.guard_event_scope() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and ((old.environment<>'legacy' and new.environment<>old.environment)
 or (old.seller_id is not null and new.seller_id is distinct from old.seller_id)) then raise exception 'Ámbito de evento inmutable'; end if;
 if new.environment='legacy' and exists(select 1 from private.billing_rollout where contracted)
 then raise exception 'Servidor antiguo retirado'; end if;
 return new;
end $$;
create trigger billing_event_scope before insert or update on public.billing_webhook_events for each row execute function private.guard_event_scope();
revoke all on function private.guard_event_scope() from public,anon,authenticated,service_role;

-- Clone the installed transaction instead of renaming/replacing the public RPC.
-- Public RPC identity, dependencies, grants and old snapshot semantics survive.
do $$ declare src text; begin
 select definition into strict src from private.billing_expand_backup where identity='billing_apply_sync(uuid,uuid,jsonb,jsonb)' or identity='public.billing_apply_sync(uuid,uuid,jsonb,jsonb)';
 execute replace(src,'FUNCTION public.billing_apply_sync(', 'FUNCTION private.billing_apply_production(');
 execute replace(replace(replace(src,'FUNCTION public.billing_apply_sync(', 'FUNCTION private.billing_apply_test('),
  'public.billing_agreements','public.billing_test_agreements'),'public.subscription_payments','public.billing_test_payments');
end $$;
revoke all on function private.billing_apply_production(uuid,uuid,jsonb,jsonb),private.billing_apply_test(uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.billing_apply_sync_v2(p_id uuid,p_token uuid,p_snapshot jsonb,p_payments jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare a record; seller text:=p_snapshot->>'seller_id'; env text:=p_snapshot->>'environment'; begin
 if env='test' then select * into a from public.billing_test_agreements where id=p_id for update;
 elsif env='production' then select * into a from public.billing_agreements where id=p_id for update;
 else raise exception 'Ámbito de facturación inválido'; end if;
 if a.id is null then raise exception 'Acuerdo inexistente'; end if;
 perform 1 from private.billing_locks where key='billing:'||a.owner_id and token=p_token and expires_at>now() for update;
 if not found then raise exception 'Lease vencido'; end if;
 if not private.billing_scope_allowed(a.owner_id,env,seller)
 or (a.environment<>'legacy' and a.environment<>env) or (a.seller_id is not null and a.seller_id<>seller)
 or a.external_reference is distinct from p_snapshot->>'external_reference'
 or (a.provider_subscription_id is not null and a.provider_subscription_id is distinct from p_snapshot->>'id')
 then raise exception 'Ámbito de facturación inválido'; end if;
 if env='test' then return private.billing_apply_test(p_id,p_token,p_snapshot,p_payments); end if;
 -- Only v2, after provider verification, can claim an explicitly legacy seller.
 -- No historical payment gets relabelled or marked verified by this transition.
 if a.environment='legacy' then update public.billing_agreements set environment='production',seller_id=seller where id=a.id; end if;
 return private.billing_apply_production(p_id,p_token,p_snapshot,p_payments);
end $$;
revoke all on function public.billing_apply_sync_v2(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.billing_apply_sync_v2(uuid,uuid,jsonb,jsonb) to service_role;

-- Keep the original production access calculation exactly, adding a separate
-- test branch which can grant access only to the administrator-designated UUID.
create or replace function private.effective_plan(p_owner uuid) returns text language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.subscriptions s where s.owner_id=p_owner and s.plan='pro' and s.provider is distinct from 'mercadopago')
 or exists(select 1 from public.billing_agreements a join public.subscription_payments p on p.agreement_id=a.id
 where a.owner_id=p_owner and private.billing_scope_allowed(a.owner_id,a.environment,a.seller_id)
 and a.creation_state='ready' and a.status in ('authorized','paused','cancelled','canceled')
 and p.verified and p.status='approved' and p.currency=a.currency and p.amount=a.amount
 and p.coverage_start<=now() and p.coverage_end>now())
 or exists(select 1 from public.billing_test_agreements a join public.billing_test_payments p on p.agreement_id=a.id and p.owner_id=a.owner_id
 where a.owner_id=p_owner and private.billing_scope_allowed(a.owner_id,a.environment,a.seller_id)
 and a.creation_state='ready' and a.status in ('authorized','paused','cancelled','canceled')
 and p.verified and p.status='approved' and p.currency=a.currency and p.amount=a.amount
 and p.environment='test' and p.seller_id='3779671542' and p.coverage_start<=now() and p.coverage_end>now()) then 'pro' else 'free' end $$;
create or replace function public.billing_get_entitlements(p_owner uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('plan',private.effective_plan(p_owner),'premium',private.effective_plan(p_owner)='pro',
 'access_until',(select max(coverage_end) from (
 select p.coverage_end from public.subscription_payments p join public.billing_agreements a on a.id=p.agreement_id
 where a.owner_id=p_owner and private.billing_scope_allowed(a.owner_id,a.environment,a.seller_id)
 and a.creation_state='ready' and a.status in ('authorized','paused','cancelled','canceled') and p.verified and p.status='approved'
 and p.amount=a.amount and p.currency=a.currency and p.coverage_start<=now() and p.coverage_end>now()
 union all select p.coverage_end from public.billing_test_payments p join public.billing_test_agreements a on a.id=p.agreement_id and p.owner_id=a.owner_id
 where a.owner_id=p_owner and private.billing_scope_allowed(a.owner_id,a.environment,a.seller_id)
 and a.creation_state='ready' and a.status in ('authorized','paused','cancelled','canceled') and p.verified and p.status='approved'
 and p.environment='test' and p.seller_id='3779671542' and p.amount=a.amount and p.currency=a.currency and p.coverage_start<=now() and p.coverage_end>now()
 ) coverage)) $$;
notify pgrst, 'reload schema';
commit;
