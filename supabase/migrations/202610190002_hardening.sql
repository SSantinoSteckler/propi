alter table collections add constraint collection_token_entropy check(token ~ '^[a-f0-9]{64}$');
alter table review_requests add constraint request_token_entropy check(token ~ '^[a-f0-9]{64}$');
alter table properties add constraint property_slug_length check(length(slug) between 3 and 120);
alter table profiles drop constraint profiles_username_check;
alter table profiles add constraint profiles_username_check check(username ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(username) between 3 and 48 and username not in ('dashboard','login','registro','recuperar','actualizar-clave','onboarding','c','r','api','ejemplo','ejemplo-coleccion','privacidad','terminos','assets'));
create or replace function public.get_collection(p_token text) returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('collection',jsonb_build_object('name',c.name,'description',c.description,'created_at',c.created_at,'token',c.token),'profile',private.public_profile(a),'properties',coalesce((select jsonb_agg(private.public_property(p) order by cp.position) from public.collection_properties cp join public.properties p on p.id=cp.property_id where cp.collection_id=c.id and not p.archived and (p.status in ('disponible','reservada') or (a.show_closed and p.status in ('vendida','alquilada')))),'[]'::jsonb)) from public.collections c join public.profiles a on a.id=c.owner_id where c.token=p_token and c.active and a.published $$;
create or replace function public.public_media(p_path text) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.profiles a where a.published and (a.avatar_path=p_path or a.cover_path=p_path)) or exists(select 1 from public.property_images i join public.properties p on p.id=i.property_id join public.profiles a on a.id=p.owner_id where i.path=p_path and a.published and not p.archived and (p.status in ('disponible','reservada') or (a.show_closed and p.status in ('vendida','alquilada')))) $$;
create function private.property_updated() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now();return new;end $$;
create trigger property_updated before update on properties for each row execute function private.property_updated();
revoke all on function private.property_updated() from public,anon,authenticated;
