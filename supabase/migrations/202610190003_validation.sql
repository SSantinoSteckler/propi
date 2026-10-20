alter table properties add constraint property_location_length check(length(city) between 2 and 120 and length(province) between 2 and 120 and length(neighborhood)<=120 and length(address)<=240);
alter table profiles add constraint profile_location_length check(length(city)<=120 and length(province)<=120 and length(agency)<=120 and length(license)<=120 and length(jurisdiction)<=160 and length(responsible_broker)<=200 and length(website)<=2000);
create or replace function public.submit_review(p_token text,p_name text,p_rating integer,p_body text,p_consent boolean,p_honeypot text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare req public.review_requests; rid uuid; begin
 if p_consent is distinct from true or p_honeypot is distinct from '' then raise exception 'Consentimiento requerido o solicitud inválida'; end if;
 select * into req from public.review_requests where token=p_token and consumed_at is null and expires_at>now() for update;
 if req.id is null then raise exception 'El enlace expiró o ya fue utilizado.'; end if;
 insert into public.reviews(owner_id,request_id,display_name,rating,body,consent_at) values(req.owner_id,req.id,p_name,p_rating,p_body,now()) returning id into rid;
 update public.review_requests set consumed_at=now() where id=req.id; return rid; end $$;
