-- READ ONLY. Does not authorize Contract or prove all old Vercel deployments retired.
begin transaction read only;
select contracted from private.billing_rollout;
select count(*) as agreements_requiring_canonical_verification from public.billing_agreements
where creation_state<>'failed' and (environment='legacy' or seller_id is null);
select count(*) as payments_requiring_canonical_verification from public.subscription_payments
where environment='legacy' or seller_id is null;
select count(*) as pending_events_requiring_canonical_verification from public.billing_webhook_events
where processing_status in ('pending','failed') and (environment='legacy' or seller_id is null);
select count(*) as retained_failed_legacy_agreements from public.billing_agreements
where creation_state='failed' and environment='legacy';
commit;
