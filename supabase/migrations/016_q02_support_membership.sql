-- Candidate only: no enrollment, data migration, or trust is seeded.
begin;
create table public.support_privacy_deployments (
  site text not null check (site ~ '^[A-Za-z0-9_-]{1,128}$'),
  tenant text not null check (tenant ~ '^[A-Za-z0-9_-]{1,128}$'),
  version integer not null default 1 check (version = 1),
  issuance boolean not null default false,
  primary key(site,tenant)
);
create table public.support_privacy_memberships (
  site text not null, tenant text not null,
  subject text not null check (subject ~ '^user_[A-Za-z0-9_-]{1,123}$'),
  version integer not null default 1 check (version = 1),
  status text not null check (status in ('active','suspended','revoked')),
  enrollment_reference text not null check (length(enrollment_reference) between 1 and 256),
  changed_at timestamptz not null default clock_timestamp(),
  primary key(site,tenant,subject),
  foreign key(site,tenant) references public.support_privacy_deployments(site,tenant)
);
alter table public.support_privacy_deployments enable row level security;
alter table public.support_privacy_memberships enable row level security;
revoke all on public.support_privacy_deployments, public.support_privacy_memberships from public, anon, authenticated, service_role;
-- Managed enrollment is a reviewed DBA transaction, never an application endpoint.
-- PK admits exactly one current membership; revoked rows are retained for withdrawal.
create function public.support_privacy_membership(p_site text,p_tenant text,p_subject text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare m public.support_privacy_memberships%rowtype; d public.support_privacy_deployments%rowtype;
begin
  -- Consistent lock order, held through each guarded operation. Enrollment updates
  -- serialize against consent effects; never use a cached role/profile/email.
  select * into d from public.support_privacy_deployments where site=p_site and tenant=p_tenant for share;
  if not found then return null; end if;
  select * into m from public.support_privacy_memberships where site=p_site and tenant=p_tenant and subject=p_subject for share;
  if not found then return null; end if;
  return jsonb_build_object('version',m.version,'subject',m.subject,'site',m.site,'tenant',m.tenant,
    'status',m.status,'issuance',d.issuance,'withdrawal',true);
end $$;
revoke all on function public.support_privacy_membership(text,text,text) from public, anon, authenticated;
grant execute on function public.support_privacy_membership(text,text,text) to service_role;
-- Preserve 014/015 bodies, but remove their direct application capability.
alter function public.support_privacy_transition(text,text,text,text,bigint,text[],text,text,timestamptz,timestamptz) rename to support_privacy_transition_internal;
revoke all on function public.support_privacy_transition_internal(text,text,text,text,bigint,text[],text,text,timestamptz,timestamptz) from public, anon, authenticated, service_role;
alter function public.support_privacy_review(text,text,text) rename to support_privacy_review_internal;
revoke all on function public.support_privacy_review_internal(text,text,text) from public, anon, authenticated, service_role;
create function public.support_privacy_transition(
 p_action text,p_site text,p_tenant text,p_subject text,p_expected_epoch bigint,
 p_scopes text[] default '{}',p_jti text default null,p_nonce text default null,
 p_issued_at timestamptz default null,p_expires_at timestamptz default null
) returns bigint language plpgsql security definer set search_path = pg_catalog, public as $$
declare m jsonb;
begin
  m := public.support_privacy_membership(p_site,p_tenant,p_subject);
  if m is null or p_action is null or p_action not in ('grant','withdraw','reserve') then
    raise exception 'Privacy authorization denied'; end if;
  if p_action <> 'withdraw' and (m->>'status' <> 'active' or m->>'issuance' <> 'true') then
    raise exception 'Privacy authorization denied'; end if;
  return public.support_privacy_transition_internal(p_action,p_site,p_tenant,p_subject,p_expected_epoch,p_scopes,p_jti,p_nonce,p_issued_at,p_expires_at);
end $$;
create function public.support_privacy_review(p_site text,p_tenant text,p_subject text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if public.support_privacy_membership(p_site,p_tenant,p_subject) is null then
    raise exception 'Privacy authorization denied'; end if;
  return public.support_privacy_review_internal(p_site,p_tenant,p_subject);
end $$;
revoke all on function public.support_privacy_transition(text,text,text,text,bigint,text[],text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.support_privacy_review(text,text,text) from public, anon, authenticated;
grant execute on function public.support_privacy_transition(text,text,text,text,bigint,text[],text,text,timestamptz,timestamptz), public.support_privacy_review(text,text,text) to service_role;
commit;
