-- SERVER-INACCESSIBLE PROTOTYPE. No role creation, grants, seed or runtime flag.
-- Literal namespace is a candidate contract, NOT verified production enrollment.
begin;
do $$ begin
 if current_user in ('anon','authenticated','service_role') then raise exception 'Privileged migration owner required'; end if;
end $$;
create table public.support_q02_atomic_ledger (
 request_digest text primary key check(request_digest ~ '^[A-Za-z0-9_-]{43}$'),
 support_sub text not null, portal_sub text not null,
 support_epoch bigint not null, portal_epoch bigint not null,
 support_jti text not null unique, receipt_jti text not null unique,
 support_digest text not null unique, receipt_digest text not null unique,
 challenge_digest text not null unique references public.q02_portal_challenges(digest),
 bindings jsonb not null,
 state text not null default 'committed' check(state in ('committed','revoked')),
 created_at timestamptz not null default clock_timestamp(),
 unique(support_sub,portal_sub,support_epoch,portal_epoch),
 check(support_jti<>receipt_jti)
);
-- Cross-column uniqueness prevents either site's JTI being reused on the other.
create table public.support_q02_atomic_replays (
 jti text primary key check(jti ~ '^[A-Za-z0-9_-]{43}$'),
 request_digest text not null references public.support_q02_atomic_ledger(request_digest)
);
create table public.support_q02_atomic_outbox (
 request_digest text primary key references public.support_q02_atomic_ledger(request_digest),
 event_digest text not null unique,
 event jsonb not null,
 state text not null default 'pending' check(state='pending'),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.support_q02_atomic_ledger enable row level security;
alter table public.support_q02_atomic_replays enable row level security;
alter table public.support_q02_atomic_outbox enable row level security;
revoke all on public.support_q02_atomic_ledger,public.support_q02_atomic_replays,public.support_q02_atomic_outbox from public,anon,authenticated,service_role;
-- LOCK ORDER: support deployment, portal deployment, support member, portal
-- member, support consent, portal consent, challenge, advisory ledger fence,
-- ledger, replay identifiers. Fixed site order is support then portal; never
-- caller-selected. The fence serializes absent-row CAS and unique-index waits.
-- SHARE locks on registries conflict with suspension/revocation UPDATE locks.
-- Consent/change triggers only touch ledger then outbox, never acquire another
-- authority row. Callers must retry a whole aborted transaction after deadlock.
create function public.support_q02_atomic_candidate(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.support_privacy_consents; c public.q02_portal_consents;
 h public.q02_portal_challenges; prior public.support_q02_atomic_ledger;
 sd public.support_privacy_deployments; pd public.q02_portal_deployments;
 sm public.support_privacy_memberships; pm public.q02_portal_memberships;
 t timestamptz;
begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>4096
 or not(p ?& array['request_digest','support_sub','portal_sub','support_epoch','portal_epoch','support_jti','receipt_jti','support_digest','receipt_digest','challenge_digest','session_digest','expires_at','support_session_expires_at','portal_session_expires_at'])
 or (select count(*) from jsonb_object_keys(p))<>14
 or exists(select 1 from jsonb_each(p) where jsonb_typeof(value)<>'string')
 or p->>'support_sub' !~ '^user_[A-Za-z0-9_-]{1,123}$' or p->>'portal_sub' !~ '^user_[A-Za-z0-9_-]{1,123}$'
 or p->>'support_epoch' !~ '^[1-9][0-9]{0,14}$' or p->>'portal_epoch' !~ '^[1-9][0-9]{0,14}$'
 or exists(select 1 from unnest(array['request_digest','support_jti','receipt_jti','support_digest','receipt_digest','challenge_digest','session_digest']) k where p->>k !~ '^[A-Za-z0-9_-]{43}$')
 or p->>'support_jti'=p->>'receipt_jti' then raise exception 'Atomic authorization denied'; end if;
 select * into sd from public.support_privacy_deployments where site='support' and tenant='tenant' for share;
 select * into pd from public.q02_portal_deployments where site='portal' and tenant='tenant' for share;
 select * into sm from public.support_privacy_memberships where site='support' and tenant='tenant' and subject=p->>'support_sub' for share;
 select * into pm from public.q02_portal_memberships where site='portal' and tenant='tenant' and subject=p->>'portal_sub' for share;
 select * into s from public.support_privacy_consents where site='support' and tenant='tenant' and subject=p->>'support_sub' for update;
 select * into c from public.q02_portal_consents where site='portal' and tenant='tenant' and subject=p->>'portal_sub' for update;
 select * into h from public.q02_portal_challenges where digest=p->>'challenge_digest' for update;
 perform pg_advisory_xact_lock(180216,1); -- ledger/replay serialization fence
 select * into prior from public.support_q02_atomic_ledger where request_digest=p->>'request_digest' for update;
 -- DB clock is read AFTER ALL locks, including idempotent replay. A retry is
 -- evidence of a prior commit only, never a capability for a derived operation.
 t:=clock_timestamp();
 if sd.issuance is distinct from true or pd.enabled is distinct from true or pd.support_site is distinct from 'support'
 or sm.status is distinct from 'active' or pm.status is distinct from 'active'
 or s.state is distinct from 'active' or c.active is distinct from true
 or s.epoch is distinct from (p->>'support_epoch')::bigint or c.epoch is distinct from (p->>'portal_epoch')::bigint
 or s.disclosure is distinct from 'q02-support-v1' or c.consent_version is distinct from 'portal-v7-1'
 or s.scopes is distinct from array['derived_summary','preferences'] or c.scopes is distinct from array['derived_summary','preferences']
 or h.site is distinct from 'portal' or h.tenant is distinct from 'tenant' or h.support_site is distinct from 'support'
 or h.subject is distinct from c.subject or h.epoch is distinct from c.epoch or h.session_digest is distinct from p->>'session_digest'
 or h.state is distinct from 'pending' or h.consent_version is distinct from c.consent_version or h.scopes is distinct from c.scopes
 or h.purpose is distinct from 'account-memory-link-reciprocal'
 or h.expires_at<=t or (p->>'expires_at')::timestamptz>t+interval '120 seconds' or (p->>'expires_at')::timestamptz<=t or (p->>'expires_at')::timestamptz>h.expires_at
 or (p->>'support_session_expires_at')::timestamptz<=t or (p->>'portal_session_expires_at')::timestamptz<=t
 then raise exception 'Atomic authorization denied'; end if;
 if prior.request_digest is not null then
   if prior.bindings<>p or prior.state<>'committed' then raise exception 'Atomic authorization denied'; end if;
   return jsonb_build_object('candidate','RECORDED','replayed',true,'derivedUse',false);
 end if;
 insert into public.support_q02_atomic_ledger(request_digest,support_sub,portal_sub,support_epoch,portal_epoch,support_jti,receipt_jti,support_digest,receipt_digest,challenge_digest,bindings)
 values(p->>'request_digest',s.subject,c.subject,s.epoch,c.epoch,p->>'support_jti',p->>'receipt_jti',p->>'support_digest',p->>'receipt_digest',h.digest,p);
 insert into public.support_q02_atomic_replays values(p->>'support_jti',p->>'request_digest'),(p->>'receipt_jti',p->>'request_digest');
 -- Unique challenge FK in ledger is its one-time consumption CAS. Portal keeps
 -- pending/cancelled wire contract intact; no predecessor source is rewritten.
 return jsonb_build_object('candidate','RECORDED','replayed',false,'derivedUse',false);
end $$;
revoke all on function public.support_q02_atomic_candidate(jsonb) from public,anon,authenticated,service_role;
-- Any change is conservatively irreversible suppression, including regrant,
-- logout challenge cancellation, tenant/subject reassignment and deployment edits.
-- UPDATE holds the changed authority row before this trigger locks the ledger.
create function public.support_q02_atomic_suppress() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e jsonb;
begin
 perform pg_advisory_xact_lock(180216,1);
 e:=jsonb_build_object('source_table',tg_table_name,'operation',tg_op,'old',to_jsonb(old),'new',case when tg_op='DELETE' then null else to_jsonb(new) end);
 -- Suppress only pairs bound to the changed OLD identity/challenge.
 -- A deployment change suppresses all pairs in that literal namespace.
 with revoked as (
 update public.support_q02_atomic_ledger l set state='revoked' where state='committed' and (
   (tg_table_name in ('support_privacy_consents','support_privacy_memberships') and e->'old'->>'site'='support' and e->'old'->>'tenant'='tenant' and l.support_sub=e->'old'->>'subject')
   or (tg_table_name in ('q02_portal_consents','q02_portal_memberships') and e->'old'->>'site'='portal' and e->'old'->>'tenant'='tenant' and l.portal_sub=e->'old'->>'subject')
   or (tg_table_name='support_privacy_deployments' and e->'old'->>'site'='support' and e->'old'->>'tenant'='tenant')
   or (tg_table_name='q02_portal_deployments' and e->'old'->>'site'='portal' and e->'old'->>'tenant'='tenant')
   or (tg_table_name='q02_portal_challenges' and l.challenge_digest=e->'old'->>'digest')
 ) returning request_digest
 ) insert into public.support_q02_atomic_outbox(request_digest,event_digest,event)
 select request_digest,encode(sha256(convert_to(jsonb_build_object('pair',request_digest,'event',e)::text,'UTF8')),'hex'),e from revoked on conflict do nothing;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function public.support_q02_atomic_suppress() from public,anon,authenticated,service_role;
create trigger q02_atomic_support_consent after update or delete on public.support_privacy_consents for each row execute function public.support_q02_atomic_suppress();
create trigger q02_atomic_portal_consent after update or delete on public.q02_portal_consents for each row execute function public.support_q02_atomic_suppress();
create trigger q02_atomic_support_member after update or delete on public.support_privacy_memberships for each row execute function public.support_q02_atomic_suppress();
create trigger q02_atomic_portal_member after update or delete on public.q02_portal_memberships for each row execute function public.support_q02_atomic_suppress();
create trigger q02_atomic_support_deployment after update or delete on public.support_privacy_deployments for each row execute function public.support_q02_atomic_suppress();
create trigger q02_atomic_portal_deployment after update or delete on public.q02_portal_deployments for each row execute function public.support_q02_atomic_suppress();
create trigger q02_atomic_challenge after update or delete on public.q02_portal_challenges for each row execute function public.support_q02_atomic_suppress();
-- Reject inherited/default ACL surprises as well as direct runtime grants.
do $$ declare r text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,'public.support_q02_atomic_candidate(jsonb)','EXECUTE')
    or has_table_privilege(r,'public.support_q02_atomic_ledger','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege(r,'public.support_q02_atomic_replays','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege(r,'public.support_q02_atomic_outbox','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Unsafe inherited runtime privilege';
  end if;
 end loop;
end $$;
commit;
