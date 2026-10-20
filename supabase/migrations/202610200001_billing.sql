-- Billing keeps the existing account/subscriptions relationship and manual grants.
create table public.billing_agreements (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
 external_reference text not null unique default encode(extensions.gen_random_bytes(32),'hex'),
 provider_subscription_id text unique, catalog_plan_id text not null,
 amount numeric(14,2) not null check(amount>0), currency text not null check(currency='ARS'),
 status text not null default 'pending' check(status in ('pending','authorized','paused','cancelled','canceled')),
 creation_state text not null default 'creating' check(creation_state in ('creating','ready','uncertain','failed')),
 checkout_url text, recovery_offset integer not null default 0 check(recovery_offset>=0), provider_updated_at timestamptz, next_payment_date timestamptz,
 last_synced_at timestamptz, sync_error boolean not null default false,
 reconcile_after timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,owner_id)
);
create unique index billing_one_open_agreement on public.billing_agreements(owner_id)
 where status not in ('cancelled','canceled') and creation_state<>'failed';
create index billing_reconcile_due on public.billing_agreements(reconcile_after);
create table public.subscription_payments (
 id uuid primary key default gen_random_uuid(), agreement_id uuid not null, owner_id uuid not null,
 provider_invoice_id text not null unique, provider_payment_id text unique,
 amount numeric(14,2) not null check(amount>=0), currency text not null,
 status text not null, invoice_status text not null, verified boolean not null default false,
 paid_at timestamptz, coverage_start timestamptz, coverage_end timestamptz,
 provider_updated_at timestamptz not null, created_at timestamptz not null default now(),
 foreign key(agreement_id,owner_id) references public.billing_agreements(id,owner_id) on delete cascade,
 check(coverage_end is null or coverage_end>coverage_start)
);
create index billing_payment_owner on public.subscription_payments(owner_id,created_at desc);
create index billing_payment_coverage on public.subscription_payments(agreement_id,coverage_end) where verified and status='approved';
create table public.billing_webhook_events (
 event_key text primary key, event_type text not null, resource_id text not null,
 processing_status text not null default 'pending' check(processing_status in ('pending','processed','failed','ignored')),
 attempts integer not null default 0, processed_at timestamptz, retry_after timestamptz not null default now(), created_at timestamptz not null default now()
);
create table private.billing_locks (key text primary key, token uuid not null, expires_at timestamptz not null);
create table private.billing_rates (key text primary key, window_start timestamptz not null, hits integer not null);
create table public.billing_plan_registry (key text primary key check(key='premium'), provider_plan_id text unique, creation_started boolean not null default false, created_at timestamptz not null default now());
alter table public.billing_plan_registry enable row level security;
revoke all on public.billing_plan_registry from public,anon,authenticated;
grant all on public.billing_plan_registry to service_role;
alter table public.billing_agreements enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.billing_webhook_events enable row level security;
revoke all on public.billing_agreements,public.subscription_payments,public.billing_webhook_events from anon,authenticated;
grant select on public.billing_agreements,public.subscription_payments to authenticated;
grant all on public.billing_agreements,public.subscription_payments,public.billing_webhook_events to service_role;
create policy billing_owner_read on public.billing_agreements for select to authenticated using(owner_id=(select auth.uid()));
create policy payment_owner_read on public.subscription_payments for select to authenticated using(owner_id=(select auth.uid()));

-- Runtime entitlement: never depends on a cron updating a cached plan at expiry.
create function private.effective_plan(p_owner uuid) returns text language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.subscriptions s where s.owner_id=p_owner and s.plan='pro' and s.provider is distinct from 'mercadopago')
 or exists(select 1 from public.billing_agreements a join public.subscription_payments p on p.agreement_id=a.id
 where a.owner_id=p_owner and a.creation_state='ready' and a.status in ('authorized','paused','cancelled','canceled')
 and p.verified and p.status='approved' and p.currency=a.currency and p.amount=a.amount
 and p.coverage_start<=now() and p.coverage_end>now()) then 'pro' else 'free' end $$;
revoke all on function private.effective_plan(uuid) from public,anon,authenticated;
create function public.get_user_entitlements() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('plan',private.effective_plan(auth.uid()),'premium',private.effective_plan(auth.uid())='pro') where auth.uid() is not null $$;
revoke all on function public.get_user_entitlements() from public,anon;
grant execute on function public.get_user_entitlements() to authenticated;

create function public.billing_acquire_lock(p_key text,p_seconds integer default 90) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid:=gen_random_uuid(); acquired uuid; begin
 insert into private.billing_locks(key,token,expires_at) values(p_key,t,now()+make_interval(secs=>least(greatest(p_seconds,5),120)))
 on conflict(key) do update set token=excluded.token,expires_at=excluded.expires_at where private.billing_locks.expires_at<now()
 returning token into acquired; return acquired; end $$;
create function public.billing_release_lock(p_key text,p_token uuid) returns void language sql security definer set search_path='' as $$
 delete from private.billing_locks where key=p_key and token=p_token $$;
create function public.billing_rate_limit(p_key text,p_limit integer,p_seconds integer) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; begin
 insert into private.billing_rates values(p_key,now(),1) on conflict(key) do update
 set window_start=case when private.billing_rates.window_start<now()-make_interval(secs=>p_seconds) then now() else private.billing_rates.window_start end,
 hits=case when private.billing_rates.window_start<now()-make_interval(secs=>p_seconds) then 1 else private.billing_rates.hits+1 end returning hits into n;
 delete from private.billing_rates where window_start<now()-interval '2 days'; return n<=p_limit; end $$;

-- Fenced writes: a worker whose lease expired cannot change billing state.
create function public.billing_apply_sync(p_id uuid,p_token uuid,p_snapshot jsonb,p_payments jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare a public.billing_agreements; x jsonb; v timestamptz; begin
 select * into a from public.billing_agreements where id=p_id for update;
 if a.id is null then raise exception 'Acuerdo inexistente'; end if;
 perform 1 from private.billing_locks where key='billing:'||a.owner_id and token=p_token and expires_at>now() for update;
 if not found then raise exception 'Lease vencido'; end if;
 if a.external_reference is distinct from p_snapshot->>'external_reference' then raise exception 'Referencia ajena'; end if;
 if coalesce(p_snapshot->>'id','')='' then raise exception 'ID requerido'; end if;
 if a.provider_subscription_id is not null and a.provider_subscription_id<>p_snapshot->>'id' then raise exception 'Suscripción ajena'; end if;
 v:=(p_snapshot->>'updated_at')::timestamptz;
 if v is null then raise exception 'Versión requerida'; end if;
 if a.provider_updated_at>v or (a.status in ('cancelled','canceled') and p_snapshot->>'status' not in ('cancelled','canceled')) then return false; end if;
 update public.billing_agreements set provider_subscription_id=p_snapshot->>'id',status=p_snapshot->>'status',creation_state='ready',
 provider_updated_at=v,checkout_url=coalesce(p_snapshot->>'checkout_url',checkout_url),next_payment_date=(p_snapshot->>'next_payment_date')::timestamptz,last_synced_at=now(),sync_error=false,
 reconcile_after=now()+interval '1 hour',updated_at=now() where id=a.id;
 for x in select value from jsonb_array_elements(p_payments) loop
   if x->>'preapproval_id' is distinct from p_snapshot->>'id' then raise exception 'Factura ajena'; end if;
   insert into public.subscription_payments(agreement_id,owner_id,provider_invoice_id,provider_payment_id,amount,currency,status,invoice_status,verified,paid_at,coverage_start,coverage_end,provider_updated_at)
   values(a.id,a.owner_id,x->>'invoice_id',x->>'payment_id',(x->>'amount')::numeric,x->>'currency',x->>'status',x->>'invoice_status',(x->>'verified')::boolean,
   (x->>'paid_at')::timestamptz,(x->>'coverage_start')::timestamptz,(x->>'coverage_end')::timestamptz,(x->>'updated_at')::timestamptz)
   on conflict(provider_invoice_id) do update set provider_payment_id=excluded.provider_payment_id,amount=excluded.amount,currency=excluded.currency,
   status=excluded.status,invoice_status=excluded.invoice_status,verified=excluded.verified,paid_at=excluded.paid_at,coverage_start=excluded.coverage_start,
   coverage_end=excluded.coverage_end,provider_updated_at=excluded.provider_updated_at
   where public.subscription_payments.agreement_id=excluded.agreement_id and public.subscription_payments.provider_updated_at<=excluded.provider_updated_at;
 end loop;
 update public.subscriptions set provider='mercadopago',provider_subscription_id=p_snapshot->>'id',plan=private.effective_plan(a.owner_id) where owner_id=a.owner_id;
 return true; end $$;

-- The original professional validation is preserved; only entitlement lookup changes.
create or replace function private.profile_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare current_plan text; begin
 if new.id<>old.id then raise exception 'Propietario inválido'; end if;
 perform 1 from public.subscriptions where owner_id=new.id for update;
 current_plan:=private.effective_plan(new.id);
 if current_plan='free' and ((new.color<>old.color and new.color<>'#24594c') or (new.cover_path is distinct from old.cover_path and new.cover_path is not null)) then raise exception 'La personalización de color y portada requiere Pro.'; end if;
 if new.published and (length(new.first_name)<2 or length(new.last_name)<2 or new.username is null or length(new.city)<2 or length(new.province)<2 or new.whatsapp !~ '^\+?[1-9][0-9]{9,14}$') then raise exception 'Completá tus datos de perfil antes de publicar.'; end if;
 if new.published and new.professional_mode in ('corredor','colaborador') and (new.license='' or new.jurisdiction='' or (new.professional_mode='colaborador' and new.responsible_broker='')) then raise exception 'Completá la identificación profesional y la jurisdicción.'; end if;
 new.updated_at=now();return new; end $$;
create or replace function private.enforce_limits() returns trigger language plpgsql security definer set search_path='' as $$
declare current_plan text;n integer;was_live boolean:=false;is_live boolean;cap integer;begin
 if auth.uid() is not null and new.owner_id<>auth.uid() then raise exception 'No tenés permisos sobre este recurso.'; end if;
 if tg_op='UPDATE' and new.owner_id<>old.owner_id then raise exception 'No se puede cambiar el propietario'; end if;
 if tg_table_name='collections' then
   if tg_op='UPDATE' and new.token<>old.token then raise exception 'El token no se puede modificar'; end if;
 end if;
 perform 1 from public.subscriptions where owner_id=new.owner_id for update;
 current_plan:=private.effective_plan(new.owner_id);
 if tg_table_name='properties' then
   is_live:=not new.archived and new.status in ('disponible','reservada','vendida','alquilada');
   if tg_op='UPDATE' then was_live:=not old.archived and old.status in ('disponible','reservada','vendida','alquilada');end if;
   if is_live and not was_live then
     select count(*) into n from public.properties where owner_id=new.owner_id and id<>new.id and not archived and status in ('disponible','reservada','vendida','alquilada');
     cap:=case when current_plan='pro' then 1000 else 5 end;
     if n>=cap then raise exception 'Alcanzaste el límite de % propiedades publicadas del plan %.',cap,current_plan;end if;
   end if;
 else
   if tg_op='UPDATE' then was_live:=old.active;end if;
   if new.active and not was_live then
     select count(*) into n from public.collections where owner_id=new.owner_id and id<>new.id and active;
     cap:=case when current_plan='pro' then 1000 else 1 end;
     if n>=cap then raise exception 'Alcanzaste el límite de % colección activa del plan %.',cap,current_plan;end if;
   end if;
 end if;return new;end $$;

revoke all on function public.billing_acquire_lock(text,integer),public.billing_release_lock(text,uuid),public.billing_rate_limit(text,integer,integer),public.billing_apply_sync(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.billing_acquire_lock(text,integer),public.billing_release_lock(text,uuid),public.billing_rate_limit(text,integer,integer),public.billing_apply_sync(uuid,uuid,jsonb,jsonb) to service_role;

create function public.billing_get_entitlements(p_owner uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('plan',private.effective_plan(p_owner),'premium',private.effective_plan(p_owner)='pro',
 'access_until',(select max(p.coverage_end) from public.subscription_payments p join public.billing_agreements a on a.id=p.agreement_id
 where a.owner_id=p_owner and a.creation_state='ready' and a.status in ('authorized','paused','cancelled','canceled') and p.verified and p.status='approved'
 and p.amount=a.amount and p.currency=a.currency and p.coverage_start<=now() and p.coverage_end>now())) $$;
revoke all on function public.billing_get_entitlements(uuid) from public,anon,authenticated;
grant execute on function public.billing_get_entitlements(uuid) to service_role;
