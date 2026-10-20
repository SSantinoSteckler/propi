-- PASO 1. SOLO LECTURA. No ejecuta Expand, Contract, RPC de escritura ni NOTIFY.
-- Ejecutar completo en SQL Editor como postgres. Cada fila debe indicar OK.
-- Si hay REVISAR, detenerse y compartir el resultado; no repetir migraciones.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '15s';
set local lock_timeout = '2s';
with
expected_tables(schema_name,table_name) as (values
 ('public','billing_agreements'),('public','subscription_payments'),('public','billing_webhook_events'),
 ('public','billing_test_agreements'),('public','billing_test_payments'),('public','billing_test_webhook_events'),
 ('private','billing_expand_backup'),('private','billing_rollout'),('private','billing_test_account')
),
tables as (
 select e.*,c.oid,c.relrowsecurity,c.relkind from expected_tables e
 left join pg_namespace n on n.nspname=e.schema_name
 left join pg_class c on c.relnamespace=n.oid and c.relname=e.table_name
),
expected_columns(schema_name,table_name,column_name,type_name,not_null) as (values
 ('public','billing_agreements','environment','text',true),('public','billing_agreements','seller_id','text',false),
 ('public','subscription_payments','environment','text',true),('public','subscription_payments','seller_id','text',false),
 ('public','billing_webhook_events','environment','text',true),('public','billing_webhook_events','seller_id','text',false),
 ('public','billing_test_agreements','environment','text',true),('public','billing_test_agreements','seller_id','text',false),
 ('public','billing_test_payments','environment','text',true),('public','billing_test_payments','seller_id','text',false),
 ('public','billing_test_webhook_events','environment','text',true),('public','billing_test_webhook_events','seller_id','text',false),
 ('private','billing_expand_backup','identity','text',true),('private','billing_expand_backup','definition','text',true),('private','billing_expand_backup','captured_at','timestamp with time zone',true),
 ('private','billing_rollout','singleton','boolean',true),('private','billing_rollout','contracted','boolean',true),
 ('private','billing_test_account','singleton','boolean',true),('private','billing_test_account','owner_id','uuid',true),('private','billing_test_account','enabled','boolean',true)
),
-- Manifest of audited function bodies is inserted below, without exposing source.
expected_functions(signature,body_hash,access_mode) as (values
 ('public.get_user_entitlements()','972b54de5378830ac5545fffe125fafd','client'),
 ('public.billing_apply_sync(uuid,uuid,jsonb,jsonb)','91e719765a07c550b5cf73056fd02e84','server'),
 ('public.billing_apply_sync_v2(uuid,uuid,jsonb,jsonb)','fb388225d76f7d7447532a295d2f36a5','server'),
 ('public.billing_get_entitlements(uuid)','4afc022318d5762735a4b0bd3dd292c7','server'),
 ('public.billing_is_test_owner(uuid)','413c66abc7adfcd8eaaea9b0ee8202e2','server'),
 ('private.effective_plan(uuid)','79d546bb0875b3840947a1d28e16380d','private'),
 ('private.billing_scope_allowed(uuid,text,text)','42cf78da89c92bf6322fc5fd925110ff','private'),
 ('private.guard_test_account()','cce60e5bbad1f8e4bdda688cb23e3237','private'),
 ('private.guard_billing_scope()','13d3a0bd300efd3af1f0b4cface1a7a8','private'),
 ('private.guard_payment_scope()','8f9614d178ef244dc8d522f3d763d4bf','private'),
 ('private.guard_event_scope()','7b34269553d7a9e8359a5ae9689ab098','private'),
 ('private.billing_apply_production(uuid,uuid,jsonb,jsonb)','91e719765a07c550b5cf73056fd02e84','private'),
 ('private.billing_apply_test(uuid,uuid,jsonb,jsonb)','7d2d33e3b05ef2563c54f6af659a266e','private')
),
functions as (
 select e.*,p.oid,p.prosrc,p.prosecdef,p.proconfig,p.proowner,p.proacl,p.prorettype,p.proargnames
 from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)
),
clients as (select oid,rolname from pg_roles where rolname in ('anon','authenticated')),
server_role as (select oid from pg_roles where rolname='service_role'),
expected_triggers(schema_name,table_name,trigger_name,signature,trigger_type) as (values
 ('private','billing_test_account','billing_test_account_guard','private.guard_test_account()',31),
 ('public','billing_agreements','billing_agreement_scope','private.guard_billing_scope()',23),
 ('public','billing_test_agreements','billing_test_agreement_scope','private.guard_billing_scope()',23),
 ('public','subscription_payments','billing_payment_scope','private.guard_payment_scope()',23),
 ('public','billing_test_payments','billing_test_payment_scope','private.guard_payment_scope()',23),
 ('public','billing_webhook_events','billing_event_scope','private.guard_event_scope()',23)
),
checks(category,check_name,ok,details) as (
 select '01 OBJETOS',schema_name||'.'||table_name,coalesce(relkind='r',false),jsonb_build_object('existe',oid is not null) from tables
 union all
 select '02 COLUMNAS',e.schema_name||'.'||e.table_name||'.'||e.column_name,
 coalesce(format_type(a.atttypid,a.atttypmod)=e.type_name and a.attnotnull=e.not_null,false),
 jsonb_build_object('tipo',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull)
 from expected_columns e join tables t using(schema_name,table_name)
 left join pg_attribute a on a.attrelid=t.oid and a.attname=e.column_name and not a.attisdropped
 union all
 select '03 FUNCIONES',signature,coalesce(oid is not null and md5(regexp_replace(prosrc,'\s','','g'))=body_hash
 and prosecdef and 'search_path=""'=any(proconfig),false),
 jsonb_build_object('existe',oid is not null,'cuerpo_auditado',md5(regexp_replace(prosrc,'\s','','g'))=body_hash,'security_definer',prosecdef,'search_path',proconfig)
 from functions
 union all
 select '04 FIRMA RPC','public.billing_apply_sync',coalesce(p.prorettype='boolean'::regtype
 and p.proargnames=array['p_id','p_token','p_snapshot','p_payments']::text[],false),
 jsonb_build_object('argumentos',p.proargnames,'retorno',format_type(p.prorettype,null))
 from functions p where signature='public.billing_apply_sync(uuid,uuid,jsonb,jsonb)'
 union all
 select '05 TRIGGERS',e.trigger_name,coalesce(t.oid is not null and not t.tgisinternal
 and t.tgenabled in ('O','A') and t.tgfoid=to_regprocedure(e.signature) and t.tgtype=e.trigger_type,false),
 jsonb_build_object('tabla',e.schema_name||'.'||e.table_name,'habilitado',t.tgenabled,'tipo',t.tgtype)
 from expected_triggers e join tables r using(schema_name,table_name)
 left join pg_trigger t on t.tgrelid=r.oid and t.tgname=e.trigger_name
 union all
 select '06 PERMISOS RPC',f.signature,coalesce(
 (select count(*)=2 and bool_and(case when f.access_mode='client' and c.rolname='authenticated' then has_function_privilege(c.oid,f.oid,'EXECUTE') else not has_function_privilege(c.oid,f.oid,'EXECUTE') end) from clients c)
 and (case when access_mode='server' then (select has_function_privilege(s.oid,f.oid,'EXECUTE') from server_role s)
 when access_mode='private' then (select not has_function_privilege(s.oid,f.oid,'EXECUTE') from server_role s)
 else true end)
 and not exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
 where a.privilege_type='EXECUTE' and a.grantee<>f.proowner
 and not (access_mode in ('server','client') and a.grantee=(select oid from server_role))
 and not (access_mode='client' and a.grantee=(select oid from pg_roles where rolname='authenticated'))),false),
 jsonb_build_object('acceso_esperado',access_mode,'propietario',pg_get_userbyid(f.proowner))
 from functions f
 union all
 select '07 RLS',schema_name||'.'||table_name,coalesce(relrowsecurity,false),jsonb_build_object('rls',relrowsecurity)
 from tables where schema_name='public'
 union all
 select '08 TABLAS PRIVADAS',t.schema_name||'.'||t.table_name,coalesce(t.oid is not null and
 (select count(*)=3 and bool_and(not has_table_privilege(r.oid,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege(r.oid,t.oid,'SELECT,INSERT,UPDATE,REFERENCES')) from pg_roles r where rolname in ('anon','authenticated','service_role')),false),
 jsonb_build_object('criterio','sin privilegios directos de anon, authenticated ni service_role')
 from tables t where schema_name='private'
 union all
 select '09 TABLAS TEST',t.table_name,coalesce(t.oid is not null and
 (select count(*)=2 and bool_and(
 not has_table_privilege(c.oid,t.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege(c.oid,t.oid,'INSERT,UPDATE,REFERENCES')
 and (case when c.rolname='authenticated' and t.table_name in ('billing_test_agreements','billing_test_payments')
 then has_table_privilege(c.oid,t.oid,'SELECT') else not has_any_column_privilege(c.oid,t.oid,'SELECT') end)) from clients c)
 and (select has_table_privilege(s.oid,t.oid,'SELECT') and has_table_privilege(s.oid,t.oid,'INSERT')
 and has_table_privilege(s.oid,t.oid,'UPDATE') and has_table_privilege(s.oid,t.oid,'DELETE') from server_role s),false),
 jsonb_build_object('clientes_sin_escritura',true,'lectura_autenticada','solo dueño de acuerdos/pagos; eventos privados')
 from tables t where table_name like 'billing_test_%' and schema_name='public'
 union all
 select '10 POLICIES TEST',t.table_name,coalesce(
 case when t.table_name='billing_test_webhook_events' then (select count(*)=0 from pg_policy p where p.polrelid=t.oid)
 else (select count(*)=1 and bool_and(p.polcmd='r' and p.polpermissive and p.polroles=array[(select oid from pg_roles where rolname='authenticated')]
 and lower(regexp_replace(pg_get_expr(p.polqual,p.polrelid),'\s','','g')) in ('(owner_id=(selectauth.uid()asuid))','(owner_id=(selectauth.uid()))')) from pg_policy p where p.polrelid=t.oid) end,false),
 (select coalesce(jsonb_agg(jsonb_build_object('nombre',p.polname,'operacion',p.polcmd,'predicado',pg_get_expr(p.polqual,p.polrelid))),'[]'::jsonb) from pg_policy p where p.polrelid=t.oid)
 from tables t where schema_name='public' and table_name in ('billing_test_agreements','billing_test_payments','billing_test_webhook_events')
 union all
 select '11 INDICES TEST',t.table_name,coalesce(t.oid is not null and
 (select count(*)>0 and bool_and(i.indisvalid and i.indisready) from pg_index i where i.indrelid=t.oid),false),
 (select jsonb_build_object('cantidad',count(*),'validos',bool_and(i.indisvalid and i.indisready)) from pg_index i where i.indrelid=t.oid)
 from tables t where t.schema_name='public' and t.table_name like 'billing_test_%'
 union all
 select '12 CHECKS DE AMBITO',c.constraint_name,coalesce(k.contype='c',false),
 jsonb_build_object('definicion',pg_get_constraintdef(k.oid),'validado',k.convalidated,'nota','NOT VALID en checks de tablas originales es intencional')
 from (values ('billing_agreements','billing_production_scope'),('subscription_payments','payment_production_scope'),('billing_webhook_events','event_production_scope'),
 ('billing_test_agreements','test_agreement_scope'),('billing_test_payments','test_payment_scope'),('billing_test_webhook_events','test_event_scope')) c(table_name,constraint_name)
 join tables t on t.schema_name='public' and t.table_name=c.table_name
 left join pg_constraint k on k.conrelid=t.oid and k.conname=c.constraint_name
 union all
 select '13 DEFAULTS',t.table_name||'.environment',coalesce(pg_get_expr(d.adbin,d.adrelid)=
 case when t.table_name like 'billing_test_%' then '''test''::text' else '''legacy''::text' end,false),
 jsonb_build_object('default',pg_get_expr(d.adbin,d.adrelid))
 from tables t left join pg_attribute a on a.attrelid=t.oid and a.attname='environment' and not a.attisdropped
 left join pg_attrdef d on d.adrelid=t.oid and d.adnum=a.attnum where t.schema_name='public'
 union all
 select '13 DEFAULTS',t.table_name||'.seller_id',coalesce(case when t.table_name like 'billing_test_%'
 then pg_get_expr(d.adbin,d.adrelid)='''3779671542''::text' else d.oid is null end,false),
 jsonb_build_object('default',pg_get_expr(d.adbin,d.adrelid))
 from tables t left join pg_attribute a on a.attrelid=t.oid and a.attname='seller_id' and not a.attisdropped
 left join pg_attrdef d on d.adrelid=t.oid and d.adnum=a.attnum where t.schema_name='public'
 union all
 select '14 ROLES','clientes_sin_bypass_rls',count(*)=2 and bool_and(not r.rolsuper and not r.rolbypassrls),
 jsonb_agg(jsonb_build_object('rol',r.rolname,'superuser',r.rolsuper,'bypass_rls',r.rolbypassrls))
 from pg_roles r where r.rolname in ('anon','authenticated')
 union all
 select '14 ROLES','service_role_con_bypass_rls',coalesce((select rolbypassrls and not rolsuper from pg_roles where rolname='service_role'),false),null::jsonb
 union all
 select '15 FOREIGN KEYS',r.table_name||' -> '||r.target,
 coalesce(exists(select 1 from pg_constraint k where k.contype='f' and k.conrelid=t.oid and k.confrelid=to_regclass(r.target) and k.convalidated),false),
 jsonb_build_object('destino',r.target)
 from (values ('billing_test_agreements','public.profiles'),('billing_test_payments','public.billing_test_agreements'),('billing_test_account','public.profiles')) r(table_name,target)
 join tables t on t.table_name=r.table_name
 union all
 select '16 CLAVES',t.schema_name||'.'||t.table_name||'.primary_key',
 coalesce(exists(select 1 from pg_index i where i.indrelid=t.oid and i.indisprimary and i.indisvalid and i.indisready),false),null::jsonb
 from tables t
 union all
 select '16 CLAVES','billing_test_account.owner_id_unique',
 coalesce(exists(select 1 from pg_constraint k where k.conrelid=to_regclass('private.billing_test_account') and k.contype='u'
 and pg_get_constraintdef(k.oid)='UNIQUE (owner_id)'),false),null::jsonb
)
select category as seccion,case when bool_and(coalesce(ok,false)) then 'OK' else 'REVISAR' end as resultado,
 count(*) as controles,
 coalesce(jsonb_agg(check_name order by check_name) filter(where not coalesce(ok,false)),'[]'::jsonb) as revisar,
 jsonb_agg(jsonb_build_object('comprobacion',check_name,'resultado',case when ok then 'OK' else 'REVISAR' end,'detalle',details) order by check_name) as detalle
from checks group by category order by category;
commit;
