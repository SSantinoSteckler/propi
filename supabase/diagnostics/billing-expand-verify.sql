-- PASO 2. SOLO LECTURA. Ejecutar sólo si billing-expand-inventory.sql dio todo OK.
-- No llama RPCs de escritura. No crea usuarios, acuerdos ni cobros; no modifica
-- sesiones de usuarios ni roles. Retorna únicamente comparaciones y agregados.
-- No sustituye un snapshot anterior: la conservación histórica se informa como
-- NO_DEMOSTRABLE si no existe una captura previa independiente.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '15s';
set local lock_timeout = '2s';
with
original_function as (
 select pg_get_functiondef('public.billing_apply_sync(uuid,uuid,jsonb,jsonb)'::regprocedure) as definition
),
function_backup as (
 select definition from private.billing_expand_backup
 where identity in ('public.billing_apply_sync(uuid,uuid,jsonb,jsonb)','billing_apply_sync(uuid,uuid,jsonb,jsonb)')
),
real_users as (
 select p.id,
 case when exists(select 1 from public.subscriptions s where s.owner_id=p.id and s.plan='pro' and s.provider is distinct from 'mercadopago')
 or exists(select 1 from public.billing_agreements a join public.subscription_payments b on b.agreement_id=a.id
 where a.owner_id=p.id and a.creation_state='ready' and a.status in ('authorized','paused','cancelled','canceled')
 and b.verified and b.status='approved' and b.currency=a.currency and b.amount=a.amount
 and b.coverage_start<=now() and b.coverage_end>now()) then 'pro' else 'free' end as original_expected_plan,
 private.effective_plan(p.id) as current_plan,
 public.billing_get_entitlements(p.id) as entitlements
 from public.profiles p where not exists(select 1 from private.billing_test_account t where t.owner_id=p.id)
),
tests as (
 select 'billing_test_account' as name,count(*) as rows from private.billing_test_account
 union all select 'billing_test_agreements',count(*) from public.billing_test_agreements
 union all select 'billing_test_payments',count(*) from public.billing_test_payments
 union all select 'billing_test_webhook_events',count(*) from public.billing_test_webhook_events
),
scope_violations as (
 select 'acuerdos_originales' as name,count(*) as anomalies from public.billing_agreements a
 where not private.billing_scope_allowed(a.owner_id,a.environment,a.seller_id)
 union all select 'pagos_originales',count(*) from public.subscription_payments p
 left join public.billing_agreements a on a.id=p.agreement_id
 where a.id is null or a.owner_id is distinct from p.owner_id
 or not (p.environment='legacy' and p.seller_id is null
 or p.environment='production' and p.seller_id is not null and p.seller_id ~ '^[1-9][0-9]{0,19}$' and p.seller_id<>'3779671542')
 or (p.environment='production' and (a.environment<>'production' or p.seller_id is distinct from a.seller_id))
 union all select 'eventos_originales',count(*) from public.billing_webhook_events e
 where not (e.environment='legacy' and e.seller_id is null
 or e.environment='production' and e.seller_id is not null and e.seller_id ~ '^[1-9][0-9]{0,19}$' and e.seller_id<>'3779671542')
 union all select 'acuerdos_test',count(*) from public.billing_test_agreements a
 where a.environment<>'test' or a.seller_id is distinct from '3779671542'
 or not exists(select 1 from private.billing_test_account t where t.owner_id=a.owner_id)
 union all select 'pagos_test',count(*) from public.billing_test_payments p
 left join public.billing_test_agreements a on a.id=p.agreement_id and a.owner_id=p.owner_id
 where a.id is null or p.environment<>'test' or p.seller_id is distinct from '3779671542'
 union all select 'eventos_test',count(*) from public.billing_test_webhook_events e
 where e.environment<>'test' or e.seller_id is distinct from '3779671542'
),
ledger as (
 select 'billing_agreements' as resource,environment,seller_id,count(*) as rows from public.billing_agreements group by environment,seller_id
 union all select 'subscription_payments',environment,seller_id,count(*) from public.subscription_payments group by environment,seller_id
 union all select 'billing_webhook_events',environment,seller_id,count(*) from public.billing_webhook_events group by environment,seller_id
),
checks(section,name,result,detail) as (
 select '01 EXPAND','contract_no_ejecutado',
 case when (select count(*)=1 and bool_and(not contracted) from private.billing_rollout) then 'OK' else 'REVISAR' end,
 (select jsonb_build_object('filas',count(*),'contracted',bool_or(contracted)) from private.billing_rollout)
 union all
 select '01 EXPAND','tres_respaldos_de_funciones',case when count(*)=3 and count(distinct identity)=3 then 'OK' else 'REVISAR' end,
 jsonb_build_object('cantidad',count(*),'captura_inicial',min(captured_at)) from private.billing_expand_backup
 union all
 select '02 RPC ANTIGUA','definicion_identica_al_respaldo',case when
 (select count(*)=1 from function_backup) and (select min(definition) from function_backup)=(select definition from original_function)
 then 'OK' else 'REVISAR' end,jsonb_build_object('firma','public.billing_apply_sync(uuid,uuid,jsonb,jsonb)','compatibilidad','acf6420992e41790fa3952f0ad933f4f96378ce3')
 union all
 select '03 TEST SIN INICIAR',name,case when rows=0 then 'OK' else 'REVISAR' end,
 jsonb_build_object('filas',rows,'esperado_en_esta_etapa',0) from tests
 union all
 select '04 INTEGRIDAD',name,case when anomalies=0 then 'OK' else 'REVISAR' end,
 jsonb_build_object('anomalias',anomalies) from scope_violations
 union all
 select '05 PREMIUM','usuarios_reales_con_formula_anterior',case when count(*) filter(where current_plan is distinct from original_expected_plan)=0 then 'OK' else 'REVISAR' end,
 jsonb_build_object('usuarios_evaluados',count(*),'diferencias',count(*) filter(where current_plan is distinct from original_expected_plan),'instante',now()) from real_users
 union all
 select '05 PREMIUM','rpc_lectura_coherente',case when count(*) filter(where
 entitlements->>'plan' is distinct from current_plan or entitlements->>'premium' is distinct from (current_plan='pro')::text)=0
 then 'OK' else 'REVISAR' end,jsonb_build_object('usuarios_evaluados',count(*),'diferencias',count(*) filter(where
 entitlements->>'plan' is distinct from current_plan or entitlements->>'premium' is distinct from (current_plan='pro')::text)) from real_users
 union all
 select '06 DATOS','distribucion_legacy_produccion','INFORMATIVO',
 (select coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) from ledger l)
 union all
 select '06 DATOS','suscripciones_actuales','INFORMATIVO',
 (select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from (select plan,provider,count(*) as rows from public.subscriptions group by plan,provider) s)
 union all
 select '06 DATOS','acuerdos_actuales','INFORMATIVO',
 (select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from (select status,creation_state,count(*) as rows from public.billing_agreements group by status,creation_state) a)
 union all
 select '06 DATOS','pagos_actuales','INFORMATIVO',
 (select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from (select status,verified,currency,count(*) as rows,sum(amount) as amount from public.subscription_payments group by status,verified,currency) p)
 union all
 select '06 DATOS','sin_comparacion_historica','NO_DEMOSTRABLE',
 jsonb_build_object('motivo','El backup guarda funciones, no una copia de los registros anteriores. Comparar con export o captura previa para demostrar igualdad histórica.')
 union all
 select '07 LIMITES','operacion_http_y_mercado_pago','NO_EJECUTADA',
 jsonb_build_object('motivo','Esta auditoría sólo lee PostgreSQL. No inicia checkout, no procesa webhooks, no sincroniza ni cancela suscripciones.')
)
select section as seccion,name as comprobacion,result as resultado,detail as detalle
from checks order by section,name;
commit;
