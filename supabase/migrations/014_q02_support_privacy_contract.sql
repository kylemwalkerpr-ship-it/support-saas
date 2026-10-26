-- Candidate ONLY. Not applied. Separate from portal Q02. No existing rows changed.
-- Service role is a trusted authorization boundary: it MUST verify Clerk subject,
-- authoritative membership, visible granular opt-in and (for redemption) both
-- site signatures + portal session/challenge before invoking this RPC.
create table public.support_privacy_consents (
  site text not null,
  tenant text not null,
  subject text not null check (subject ~ '^user_[A-Za-z0-9_-]+$'),
  epoch bigint not null default 0 check (epoch >= 0),
  state text not null default 'withdrawn' check (state in ('active','withdrawn')),
  scopes text[] not null default '{}',
  disclosure text not null default 'q02-support-v1' check (disclosure = 'q02-support-v1'),
  changed_at timestamptz not null default clock_timestamp(),
  primary key (site, tenant, subject),
  check (scopes <@ array['preferences','derived_summary']::text[]),
  check ((state = 'active' and cardinality(scopes) > 0) or (state = 'withdrawn' and cardinality(scopes) = 0))
);
create table public.support_privacy_intents (
  jti text primary key check (jti ~ '^[A-Za-z0-9_-]{43}$'),
  site text not null,
  tenant text not null,
  subject text not null,
  epoch bigint not null,
  scopes text[] not null,
  nonce text not null check (nonce ~ '^[A-Za-z0-9_-]{43}$'),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  foreign key (site, tenant, subject) references public.support_privacy_consents(site, tenant, subject),
  unique (site, tenant, subject, nonce),
  check (expires_at > issued_at and expires_at <= issued_at + interval '120 seconds')
);
-- Durable propagation work item; delivery/signing/ack worker is deliberately absent.
create table public.support_privacy_outbox (
  site text not null, tenant text not null, subject text not null,
  epoch bigint not null, state text not null check (state in ('active','withdrawn')),
  created_at timestamptz not null default clock_timestamp(),
  primary key(site,tenant,subject,epoch),
  foreign key(site,tenant,subject) references public.support_privacy_consents(site,tenant,subject)
);
alter table public.support_privacy_outbox enable row level security;
revoke all on public.support_privacy_outbox from public, anon, authenticated, service_role;
alter table public.support_privacy_consents enable row level security;
alter table public.support_privacy_intents enable row level security;
-- No browser RLS policies; even authenticated Clerk users cannot write directly.
revoke all on public.support_privacy_consents, public.support_privacy_intents from public, anon, authenticated, service_role;

create function public.support_privacy_transition(
  p_action text, p_site text, p_tenant text, p_subject text, p_expected_epoch bigint,
  p_scopes text[] default '{}', p_jti text default null, p_nonce text default null,
  p_issued_at timestamptz default null, p_expires_at timestamptz default null
) returns bigint
language plpgsql security definer set search_path = pg_catalog, public as $$
declare c public.support_privacy_consents%rowtype; n integer;
begin
  if p_action is null or p_action not in ('grant','withdraw','reserve','consume')
    or p_site is null or p_tenant is null or p_subject is null
    or p_site !~ '^[A-Za-z0-9_-]{1,128}$' or p_tenant !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_subject !~ '^user_[A-Za-z0-9_-]{1,123}$' or p_expected_epoch is null
    or p_expected_epoch < 0 then raise exception 'Privacy authorization denied'; end if;
  -- Insert + row lock serializes first grant/withdraw and all late effects.
  insert into public.support_privacy_consents(site,tenant,subject)
    values(p_site,p_tenant,p_subject) on conflict do nothing;
  select * into strict c from public.support_privacy_consents
    where site=p_site and tenant=p_tenant and subject=p_subject for update;
  if c.epoch <> p_expected_epoch then raise exception 'Privacy authorization denied'; end if;
  if p_action = 'withdraw' then
    update public.support_privacy_consents set state='withdrawn', scopes='{}',
      epoch=epoch+1, changed_at=clock_timestamp()
      where site=p_site and tenant=p_tenant and subject=p_subject;
    -- Durable tombstone survives all stale attestations; no audit/transcript delete.
    insert into public.support_privacy_outbox(site,tenant,subject,epoch,state)
      values(p_site,p_tenant,p_subject,c.epoch+1,'withdrawn');
    return c.epoch+1;
  end if;
  if p_scopes is null or cardinality(p_scopes) not between 1 and 2
    or array_position(p_scopes,null) is not null
    or not (p_scopes <@ array['preferences','derived_summary']::text[])
    or cardinality(p_scopes) <> (select count(distinct x) from unnest(p_scopes) x)
    then raise exception 'Privacy authorization denied'; end if;
  if p_action = 'grant' then
    update public.support_privacy_consents set state='active', scopes=p_scopes,
      epoch=epoch+1, changed_at=clock_timestamp()
      where site=p_site and tenant=p_tenant and subject=p_subject;
    insert into public.support_privacy_outbox(site,tenant,subject,epoch,state)
      values(p_site,p_tenant,p_subject,c.epoch+1,'active');
    return c.epoch+1;
  end if;
  if c.state <> 'active' or not (p_scopes @> c.scopes and p_scopes <@ c.scopes)
    then raise exception 'Privacy authorization denied'; end if;
  if p_action = 'reserve' then
    if p_issued_at is null or p_expires_at is null or p_jti is null or p_nonce is null
      or p_issued_at > clock_timestamp() or p_issued_at < clock_timestamp()-interval '10 seconds'
      or p_expires_at <= clock_timestamp() or p_expires_at > p_issued_at+interval '120 seconds'
      then raise exception 'Privacy authorization denied'; end if;
    insert into public.support_privacy_intents(jti,site,tenant,subject,epoch,scopes,nonce,issued_at,expires_at)
      values(p_jti,p_site,p_tenant,p_subject,c.epoch,p_scopes,p_nonce,p_issued_at,p_expires_at);
  else
    update public.support_privacy_intents set consumed_at=clock_timestamp()
      where jti=p_jti and site=p_site and tenant=p_tenant and subject=p_subject
        and epoch=c.epoch and nonce=p_nonce and scopes @> p_scopes and scopes <@ p_scopes
        and consumed_at is null and issued_at <= clock_timestamp() and expires_at > clock_timestamp();
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'Privacy authorization denied'; end if;
  end if;
  return c.epoch;
end $$;
revoke all on function public.support_privacy_transition(text,text,text,text,bigint,text[],text,text,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.support_privacy_transition(text,text,text,text,bigint,text[],text,text,timestamptz,timestamptz) to service_role;
-- No cleanup job: tombstone/JTI retention must be decided before activation.
