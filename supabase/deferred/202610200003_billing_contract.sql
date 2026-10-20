-- CONTRACT, MANUAL AND DEFERRED. Not in migrations/: db push must not run this.
-- Run only after the exact Production SHA is verified and all old deployments,
-- queued work and rollback targets have been retired. Review/authorize separately.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';
do $$ begin
 if exists(select 1 from public.billing_agreements where creation_state<>'failed' and (environment='legacy' or seller_id is null))
 or exists(select 1 from public.subscription_payments where environment='legacy' or seller_id is null)
 or exists(select 1 from public.billing_webhook_events where processing_status in ('pending','failed') and (environment='legacy' or seller_id is null))
 then raise exception 'Contract bloqueado: hay registros legacy sin reconciliar'; end if;
end $$;
update private.billing_rollout set contracted=true where singleton;
-- Preserve RPC signature and ACL. No recursion: v2 uses a separate private core.
create or replace function public.billing_apply_sync(p_id uuid,p_token uuid,p_snapshot jsonb,p_payments jsonb) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_snapshot->>'environment' is null or p_snapshot->>'seller_id' is null then raise exception 'Servidor antiguo retirado'; end if;
 return public.billing_apply_sync_v2(p_id,p_token,p_snapshot,p_payments);
end $$;
notify pgrst, 'reload schema';
commit;
