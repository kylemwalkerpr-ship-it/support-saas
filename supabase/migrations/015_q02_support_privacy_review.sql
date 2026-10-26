-- Candidate additive read capability ONLY. Unapplied. Caller must independently
-- verify current Clerk session + authoritative deployment membership first.
create function public.support_privacy_review(p_site text, p_tenant text, p_subject text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  if p_site is null or p_tenant is null or p_subject is null
    or p_site !~ '^[A-Za-z0-9_-]{1,128}$' or p_tenant !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_subject !~ '^user_[A-Za-z0-9_-]{1,123}$'
    then raise exception 'Privacy authorization denied'; end if;
  select jsonb_build_object('epoch',epoch,'state',state,'scopes',scopes,'disclosure',disclosure)
    into result from public.support_privacy_consents
    where site=p_site and tenant=p_tenant and subject=p_subject;
  return coalesce(result, jsonb_build_object('epoch',0,'state','withdrawn',
    'scopes',jsonb_build_array(),'disclosure','q02-support-v1'));
end $$;
revoke all on function public.support_privacy_review(text,text,text) from public, anon, authenticated;
grant execute on function public.support_privacy_review(text,text,text) to service_role;
