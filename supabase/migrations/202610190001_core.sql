create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 first_name text not null default '' check(length(first_name)<=80), last_name text not null default '' check(length(last_name)<=80),
 username text unique check(username ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(username) between 3 and 48 and username not in ('dashboard','login','registro','recuperar','actualizar-clave','onboarding','c','r','api','ejemplo','privacidad','terminos','assets')),
 bio text not null default '' check(length(bio)<=600), city text not null default '', province text not null default '',
 whatsapp text not null default '', agency text not null default '', professional_mode text not null default 'independiente' check(professional_mode in ('independiente','corredor','colaborador')),
 license text not null default '', jurisdiction text not null default '', responsible_broker text not null default '',
 instagram text not null default '' check(instagram ~ '^@?[a-zA-Z0-9._]*$'), website text not null default '' check(website='' or website ~ '^https://'),
 color text not null default '#24594c' check(color ~ '^#[0-9a-fA-F]{6}$'), avatar_path text, cover_path text,
 published boolean not null default false, show_closed boolean not null default false,
 onboarding_step integer not null default 1 check(onboarding_step between 1 and 4), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(avatar_path is null or split_part(avatar_path,'/',1)=id::text), check(cover_path is null or split_part(cover_path,'/',1)=id::text)
);
create table public.agent_settings (owner_id uuid primary key references profiles on delete cascade, notification_reviews boolean not null default true, updated_at timestamptz not null default now());
create table public.subscriptions (owner_id uuid primary key references profiles on delete cascade, plan text not null default 'free' check(plan in ('free','pro')), provider text, provider_subscription_id text unique, created_at timestamptz not null default now());
create table public.properties (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references profiles on delete cascade,
 slug text not null default encode(extensions.gen_random_bytes(12),'hex') check(slug ~ '^[a-z0-9-]+$'),
 title text not null check(length(title) between 5 and 160), description text not null check(length(description) between 20 and 8000),
 type text not null check(type in ('departamento','casa','PH','terreno','local','oficina','otro')), operation text not null check(operation in ('venta','alquiler')),
 price numeric not null check(price>0), currency text not null check(currency in ('ARS','USD')),
 province text not null, city text not null, neighborhood text not null default '', address text not null default '', show_address boolean not null default false,
 total_area numeric not null check(total_area>0), covered_area numeric not null default 0 check(covered_area>=0 and covered_area<=total_area),
 rooms integer not null default 0 check(rooms>=0), bedrooms integer not null default 0 check(bedrooms>=0), bathrooms integer not null default 0 check(bathrooms>=0), garages integer not null default 0 check(garages>=0), age integer check(age>=0),
 status text not null default 'borrador' check(status in ('borrador','disponible','reservada','vendida','alquilada','pausada')), archived boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_id,slug), unique(id,owner_id)
);
create index properties_owner_status on properties(owner_id,status,archived);
create table public.property_images (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(), property_id uuid not null,
 path text not null unique, alt text not null default '' check(length(alt)<=300), position integer not null default 0 check(position>=0),
 foreign key(property_id,owner_id) references properties(id,owner_id) on delete cascade, check(split_part(path,'/',1)=owner_id::text)
);
create index property_images_order on property_images(property_id,position);
create table public.collections (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references profiles on delete cascade,
 token text not null unique default encode(extensions.gen_random_bytes(32),'hex'), name text not null check(length(name) between 3 and 120), description text not null default '' check(length(description)<=600),
 active boolean not null default true, created_at timestamptz not null default now(), unique(id,owner_id)
);
create index collections_owner on collections(owner_id,active);
create table public.collection_properties (
 collection_id uuid not null, property_id uuid not null, owner_id uuid not null default auth.uid(), position integer not null default 0,
 primary key(collection_id,property_id), foreign key(collection_id,owner_id) references collections(id,owner_id) on delete cascade,
 foreign key(property_id,owner_id) references properties(id,owner_id) on delete cascade
);
create table public.review_requests (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references profiles on delete cascade,
 token text not null unique default encode(extensions.gen_random_bytes(32),'hex'), created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 days', consumed_at timestamptz,
 unique(id,owner_id)
);
create index review_requests_owner_created on review_requests(owner_id,created_at);
create table public.reviews (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles on delete cascade, request_id uuid not null unique references review_requests,
 display_name text not null check(length(display_name) between 2 and 80), rating integer not null check(rating between 1 and 5), body text not null check(length(body) between 20 and 2000),
 consent_at timestamptz not null, response text check(length(response)<=2000), status text not null default 'published' check(status in ('published','moderated')), verified boolean not null default false,
 verification_note text, created_at timestamptz not null default now()
);
create index reviews_owner_created on reviews(owner_id,created_at);
create table public.review_reports (id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references profiles on delete cascade, review_id uuid not null references reviews on delete cascade, reason text not null check(length(reason) between 10 and 1000), created_at timestamptz not null default now(), unique(owner_id,review_id));
create table public.analytics_events (id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles on delete cascade, kind text not null check(kind in ('portfolio','property','collection','whatsapp','social')), property_id uuid references properties on delete set null, collection_id uuid references collections on delete set null, created_at timestamptz not null default now());
create index analytics_owner_date on analytics_events(owner_id,created_at desc);
create table private.event_limits (key text primary key, expires_at timestamptz not null);

create function private.bootstrap_user() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.profiles(id) values(new.id); insert into public.subscriptions(owner_id) values(new.id); insert into public.agent_settings(owner_id) values(new.id); return new; end $$;
create trigger bootstrap_user after insert on auth.users for each row execute function private.bootstrap_user();

create function private.enforce_limits() returns trigger language plpgsql security definer set search_path='' as $$
declare current_plan text; n integer;
begin
 if auth.uid() is not null and new.owner_id<>auth.uid() then raise exception 'No tenés permisos sobre este recurso.'; end if;
 if tg_op='UPDATE' and new.owner_id<>old.owner_id then raise exception 'No se puede cambiar el propietario'; end if;
 if tg_op='UPDATE' and tg_table_name='collections' then if new.token<>old.token then raise exception 'El token no se puede modificar'; end if; end if;
 select plan into current_plan from public.subscriptions where owner_id=new.owner_id for update;
 if tg_table_name='properties' then
   if current_plan='free' and not new.archived and new.status in ('disponible','reservada','vendida','alquilada') then
     select count(*) into n from public.properties where owner_id=new.owner_id and id<>new.id and not archived and status in ('disponible','reservada','vendida','alquilada');
     if n>=5 then raise exception 'Alcanzaste el límite de 5 propiedades publicadas del plan Free.'; end if;
   end if;
 elsif tg_table_name='collections' then
   if current_plan='free' and new.active then
     select count(*) into n from public.collections where owner_id=new.owner_id and id<>new.id and active;
     if n>=1 then raise exception 'Alcanzaste el límite de 1 colección activa del plan Free.'; end if;
   end if;
 end if; return new; end $$;
create trigger property_limits before insert or update on properties for each row execute function private.enforce_limits();
create trigger collection_limits before insert or update on collections for each row execute function private.enforce_limits();
create function private.profile_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare current_plan text;
begin
 if new.id<>old.id then raise exception 'Propietario inválido'; end if;
 select plan into current_plan from public.subscriptions where owner_id=new.id for update;
 if current_plan='free' and (new.color<>'#24594c' or new.cover_path is not null) then raise exception 'La personalización de color y portada requiere Pro.'; end if;
 if new.published and (length(new.first_name)<2 or length(new.last_name)<2 or new.username is null or length(new.city)<2 or length(new.province)<2 or new.whatsapp !~ '^\+?[1-9][0-9]{9,14}$') then raise exception 'Completá tus datos de perfil antes de publicar.'; end if;
 if new.published and new.professional_mode in ('corredor','colaborador') and (new.license='' or new.jurisdiction='' or (new.professional_mode='colaborador' and new.responsible_broker='')) then raise exception 'Completá la identificación profesional y la jurisdicción.'; end if;
 new.updated_at=now(); return new; end $$;
create trigger profile_guard before update on profiles for each row execute function private.profile_guard();
create function private.image_guard() returns trigger language plpgsql security definer set search_path='' as $$ begin
 perform 1 from public.properties where id=new.property_id for update;
 if (select count(*) from public.property_images where property_id=new.property_id and id<>new.id)>=15 then raise exception 'El límite es de 15 imágenes por propiedad.'; end if; return new; end $$;
create trigger image_guard before insert or update on property_images for each row execute function private.image_guard();

do $$ declare t text; begin
 foreach t in array array['profiles','agent_settings','properties','property_images','collections','collection_properties','review_requests','reviews','review_reports','analytics_events','subscriptions'] loop
 execute format('alter table public.%I enable row level security',t);
 end loop;
 foreach t in array array['agent_settings','properties','property_images','collections','collection_properties'] loop
 execute format('create policy owner_all on public.%I for all to authenticated using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()))',t);
 end loop; end $$;
create policy profile_read on profiles for select to authenticated using(id=(select auth.uid()));
create policy profile_update on profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy subscription_read on subscriptions for select to authenticated using(owner_id=(select auth.uid()));
create policy request_read on review_requests for select to authenticated using(owner_id=(select auth.uid()));
create policy review_read on reviews for select to authenticated using(owner_id=(select auth.uid()));
create policy review_response on reviews for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy report_read on review_reports for select to authenticated using(owner_id=(select auth.uid()));
create policy report_insert on review_reports for insert to authenticated with check(owner_id=(select auth.uid()) and exists(select 1 from reviews where id=review_id and owner_id=(select auth.uid())));
create policy analytics_read on analytics_events for select to authenticated using(owner_id=(select auth.uid()));
revoke all on all tables in schema public from anon,authenticated;
grant select,update on profiles to authenticated;
grant select,insert,update,delete on agent_settings,properties,property_images,collections,collection_properties to authenticated;
grant select on subscriptions,review_requests,reviews,review_reports,analytics_events to authenticated;
grant update(response) on reviews to authenticated;
grant insert on review_reports to authenticated;

create function private.public_profile(p public.profiles) returns jsonb language sql stable set search_path='' as $$
select jsonb_build_object('first_name',p.first_name,'last_name',p.last_name,'username',p.username,'bio',p.bio,'city',p.city,'province',p.province,'whatsapp',p.whatsapp,'agency',p.agency,'professional_mode',p.professional_mode,'license',p.license,'jurisdiction',p.jurisdiction,'responsible_broker',p.responsible_broker,'instagram',p.instagram,'website',p.website,'color',p.color,'avatar_path',p.avatar_path,'cover_path',p.cover_path,'show_closed',p.show_closed,'published',p.published) $$;
create function private.public_property(p public.properties) returns jsonb language sql stable set search_path='' as $$
select (to_jsonb(p)-'owner_id'-'address'-'updated_at') || jsonb_build_object('address',case when p.show_address then p.address else null end,'images',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'path',i.path,'alt',i.alt,'position',i.position) order by i.position,i.id) from public.property_images i where i.property_id=p.id),'[]'::jsonb)) $$;
create function public.get_portfolio(p_username text) returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('profile',private.public_profile(a),'properties',coalesce((select jsonb_agg(private.public_property(p) order by p.created_at desc) from public.properties p where p.owner_id=a.id and not p.archived and (p.status in ('disponible','reservada') or (a.show_closed and p.status in ('vendida','alquilada')))),'[]'::jsonb),'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'display_name',r.display_name,'rating',r.rating,'body',r.body,'response',r.response,'verified',r.verified,'created_at',r.created_at) order by r.created_at desc) from public.reviews r where r.owner_id=a.id and r.status='published'),'[]'::jsonb)) from public.profiles a where a.username=p_username and a.published $$;
create function public.get_collection(p_token text) returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('collection',jsonb_build_object('name',c.name,'description',c.description,'created_at',c.created_at,'token',c.token),'profile',private.public_profile(a),'properties',coalesce((select jsonb_agg(private.public_property(p) order by cp.position) from public.collection_properties cp join public.properties p on p.id=cp.property_id where cp.collection_id=c.id and not p.archived and p.status in ('disponible','reservada','vendida','alquilada')),'[]'::jsonb)) from public.collections c join public.profiles a on a.id=c.owner_id where c.token=p_token and c.active and a.published $$;
create function public.save_collection(p_id uuid,p_name text,p_description text,p_properties uuid[],p_active boolean default true) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid; begin
 if auth.uid() is null then raise exception 'Sesión requerida'; end if;
 if exists(select 1 from unnest(p_properties) x where not exists(select 1 from public.properties p where p.id=x and p.owner_id=auth.uid())) then raise exception 'Propiedad ajena'; end if;
 if p_id is null then insert into public.collections(owner_id,name,description,active) values(auth.uid(),p_name,p_description,p_active) returning id into cid;
 else update public.collections set name=p_name,description=p_description,active=p_active where id=p_id and owner_id=auth.uid() returning id into cid; if cid is null then raise exception 'Colección no encontrada'; end if; end if;
 delete from public.collection_properties where collection_id=cid;
 insert into public.collection_properties(collection_id,property_id,owner_id,position) select cid,x,auth.uid(),ord::int from unnest(p_properties) with ordinality as t(x,ord);
 return cid; end $$;
create function public.create_review_request() returns text language plpgsql security definer set search_path='' as $$ declare t text; begin
 if auth.uid() is null then raise exception 'Sesión requerida'; end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 if (select count(*) from public.review_requests where owner_id=auth.uid() and created_at>now()-interval '1 hour')>=10 then raise exception 'Límite de 10 solicitudes por hora.'; end if;
 insert into public.review_requests(owner_id) values(auth.uid()) returning token into t; return t; end $$;
create function public.review_request_info(p_token text) returns jsonb language sql stable security definer set search_path='' as $$ select jsonb_build_object('name',p.first_name||' '||p.last_name) from public.review_requests r join public.profiles p on p.id=r.owner_id where r.token=p_token and r.consumed_at is null and r.expires_at>now() $$;
create function public.submit_review(p_token text,p_name text,p_rating integer,p_body text,p_consent boolean,p_honeypot text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare req public.review_requests; rid uuid; begin
 if p_consent is distinct from true or p_honeypot<>'' then raise exception 'Consentimiento requerido o solicitud inválida'; end if;
 select * into req from public.review_requests where token=p_token and consumed_at is null and expires_at>now() for update;
 if req.id is null then raise exception 'El enlace expiró o ya fue utilizado.'; end if;
 insert into public.reviews(owner_id,request_id,display_name,rating,body,consent_at) values(req.owner_id,req.id,p_name,p_rating,p_body,now()) returning id into rid;
 update public.review_requests set consumed_at=now() where id=req.id; return rid; end $$;
create function public.public_media(p_path text) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.profiles a where a.published and (a.avatar_path=p_path or a.cover_path=p_path)) or exists(select 1 from public.property_images i join public.properties p on p.id=i.property_id join public.profiles a on a.id=p.owner_id where i.path=p_path and a.published and not p.archived and (p.status in ('disponible','reservada') or (p.status in ('vendida','alquilada') and (a.show_closed or exists(select 1 from public.collection_properties cp join public.collections c on c.id=cp.collection_id where cp.property_id=p.id and c.active))))) $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('media','media',false,8388608,array['image/jpeg','image/png','image/webp']);
create policy media_owner on storage.objects for all to authenticated using(bucket_id='media' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy media_published on storage.objects for select to anon,authenticated using(bucket_id='media' and public.public_media(name));

create function public.public_sitemap() returns jsonb language sql stable security definer set search_path='' as $$ select coalesce(jsonb_agg(x),'[]'::jsonb) from (select '/'||username as path from public.profiles where published union all select '/'||a.username||'/propiedad/'||p.slug from public.properties p join public.profiles a on a.id=p.owner_id where a.published and not p.archived and (p.status in ('disponible','reservada') or (a.show_closed and p.status in ('vendida','alquilada')))) x $$;
create function public.record_event(p_username text,p_kind text,p_property_slug text,p_collection_token text,p_fingerprint text) returns void language plpgsql security definer set search_path='' as $$
declare aid uuid; pid uuid; cid uuid; k text;
begin
 if p_kind not in ('portfolio','property','collection','whatsapp','social') then return; end if;
 select id into aid from public.profiles where username=p_username and published; if aid is null then return; end if;
 if p_property_slug is not null then select id into pid from public.properties where owner_id=aid and slug=p_property_slug and not archived and status in ('disponible','reservada','vendida','alquilada'); if pid is null then return; end if; end if;
 if p_collection_token is not null then select id into cid from public.collections where owner_id=aid and token=p_collection_token and active; if cid is null then return; end if; end if;
 k=md5(p_fingerprint||aid::text||p_kind||coalesce(pid::text,'')||coalesce(cid::text,'')||date_trunc('hour',now())::text);
 insert into private.event_limits(key,expires_at) values(k,now()+interval '2 hours') on conflict do nothing; if not found then return; end if;
 insert into public.analytics_events(owner_id,kind,property_id,collection_id) values(aid,p_kind,pid,cid);
 delete from private.event_limits where expires_at<now(); delete from public.analytics_events where created_at<now()-interval '365 days'; end $$;

revoke all on all functions in schema public from public,anon,authenticated;
grant execute on function public.get_portfolio(text),public.get_collection(text),public.review_request_info(text),public.submit_review(text,text,integer,text,boolean,text),public.public_media(text),public.public_sitemap() to anon,authenticated;
grant execute on function public.save_collection(uuid,text,text,uuid[],boolean),public.create_review_request() to authenticated;
grant execute on function public.record_event(text,text,text,text,text) to service_role;
revoke all on all functions in schema private from public,anon,authenticated;
