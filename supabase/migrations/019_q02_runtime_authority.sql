-- Pair migration: apply ONLY after portal reciprocal migration and support 014-018.
-- No enrollment, password, tenant, checkpoint, private key or successful ACK is seeded.
begin;
do $$ begin
 if exists(select 1 from pg_roles where rolname in ('q02_authority_owner','q02_coordinator_runtime','q02_support_runtime','q02_portal_runtime')) then
  raise exception 'Q02 role collision: independently inspect existing principals';
 end if;
end $$;
create role q02_authority_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role q02_coordinator_runtime login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password null;
create role q02_support_runtime login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password null;
create role q02_portal_runtime login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password null;
create schema q02_runtime authorization q02_authority_owner;
revoke all on schema q02_runtime from public,anon,authenticated,service_role;
grant usage on schema q02_runtime to q02_coordinator_runtime,q02_support_runtime,q02_portal_runtime;
grant usage on schema public to q02_authority_owner;
grant select on public.support_privacy_deployments,public.support_privacy_memberships,public.support_privacy_consents,public.support_privacy_intents,
 public.q02_portal_deployments,public.q02_portal_memberships,public.q02_portal_consents,public.q02_portal_challenges to q02_authority_owner;
-- Existing tables have RLS without policies. Only this non-login function owner
-- can inspect the authority; runtime logins have no table grants or BYPASSRLS.
create policy q02_authority_read on public.support_privacy_deployments for select to q02_authority_owner using(true);
create policy q02_authority_read on public.support_privacy_memberships for select to q02_authority_owner using(true);
create policy q02_authority_read on public.support_privacy_consents for select to q02_authority_owner using(true);
create policy q02_authority_read on public.support_privacy_intents for select to q02_authority_owner using(true);
create policy q02_authority_read on public.q02_portal_deployments for select to q02_authority_owner using(true);
create policy q02_authority_read on public.q02_portal_memberships for select to q02_authority_owner using(true);
create policy q02_authority_read on public.q02_portal_consents for select to q02_authority_owner using(true);
create policy q02_authority_read on public.q02_portal_challenges for select to q02_authority_owner using(true);
-- Locking SELECT requires UPDATE privilege. RLS still admits no UPDATE by owner.
grant update on public.support_privacy_deployments,public.support_privacy_memberships,public.support_privacy_consents,public.support_privacy_intents,
 public.q02_portal_deployments,public.q02_portal_memberships,public.q02_portal_consents,public.q02_portal_challenges to q02_authority_owner;
set local role q02_authority_owner;
-- PostgreSQL's global default grants EXECUTE on functions to PUBLIC.
-- A schema-scoped REVOKE cannot undo that global default. This dedicated
-- non-login owner must instead revoke the global default for its own functions.
alter default privileges revoke execute on functions from public;
create function q02_runtime.hash(v text) returns text language sql immutable strict set search_path=pg_catalog as $$
 select translate(rtrim(encode(sha256(convert_to(v,'UTF8')),'base64'),'='),'+/','-_') $$;
create table q02_runtime.tenants (
 tenant text primary key check(tenant ~ '^[A-Za-z0-9_-]{1,128}$'),
 generation text not null check(generation ~ '^[A-Za-z0-9_-]{43}$'),
 sequence bigint not null default 0 check(sequence>=0),
 head text not null check(head ~ '^[A-Za-z0-9_-]{43}$'),
 genesis text not null check(genesis ~ '^[A-Za-z0-9_-]{43}$')
);
create table q02_runtime.sites (
 tenant text references q02_runtime.tenants, site text check(site in ('support','portal')),
 issuer text not null check(issuer ~ '^https://[^/]+$'),
 party text not null check((site='support' and party='https://support.yousafeconsultancy.com') or
 (site='portal' and party in ('https://portal.yousafeconsultancy.com','https://market.yousafeconsultancy.com'))),
 proof jsonb not null, proof_keys jsonb not null check(jsonb_typeof(proof_keys)='array'),
 active boolean not null default false, enrollment_reference text not null check(length(enrollment_reference)>0),
 primary key(tenant,site)
);
create table q02_runtime.credentials (
 tenant text, site text, subject text check(subject ~ '^user_[A-Za-z0-9_-]{1,123}$'),
 session_digest text check(session_digest ~ '^[A-Za-z0-9_-]{43}$'),
 issuer text not null, party text not null, status text not null check(status in ('active','revoked')),
 expires_at timestamptz not null, enrollment_reference text not null check(length(enrollment_reference)>0),
 primary key(tenant,site,subject,session_digest), foreign key(tenant,site) references q02_runtime.sites
);
create table q02_runtime.services (
 tenant text primary key references q02_runtime.tenants, manifest jsonb not null, use_manifest jsonb,
 enrollment_reference text not null check(length(enrollment_reference)>0)
);
-- Readiness must be independently anchored outside this database. No rows are
-- seeded here: a local DB head is never proof that a restored backup is current.
create table q02_runtime.checkpoints (
 tenant text primary key references q02_runtime.tenants,
 generation text not null check(generation ~ '^[A-Za-z0-9_-]{43}$'),
 high_water bigint not null check(high_water>=0),
 head_digest text not null check(head_digest ~ '^[A-Za-z0-9_-]{43}$'),
 evidence_digest text not null check(evidence_digest ~ '^[A-Za-z0-9_-]{43}$'),
 verified_at timestamptz not null,
 enrollment_reference text not null check(length(enrollment_reference)>0)
);
create table q02_runtime.checkpoint_nonces (
 tenant text not null references q02_runtime.tenants,
 nonce_digest text not null check(nonce_digest ~ '^[A-Za-z0-9_-]{43}$'),
 evidence_digest text not null check(evidence_digest ~ '^[A-Za-z0-9_-]{43}$'),
 verified_at timestamptz not null,
 primary key(tenant,nonce_digest)
);
create table q02_runtime.events (
 tenant text references q02_runtime.tenants, sequence bigint not null, generation text not null,
 previous_digest text not null, digest text not null unique,
 kind text not null check(kind in ('stage','suppress')), request_digest text,
 payload jsonb not null, created_at timestamptz not null default clock_timestamp(),
 primary key(tenant,sequence)
);
create table q02_runtime.stages (
 request_digest text primary key check(request_digest ~ '^[A-Za-z0-9_-]{43}$'),
 tenant text not null, sequence bigint not null, binding jsonb not null,
 foreign key(tenant,sequence) references q02_runtime.events
);
create table q02_runtime.acks (
 tenant text, sequence bigint, site text check(site in ('support','portal')), event_digest text not null,
 credential_digest text not null, acknowledged_at timestamptz not null default clock_timestamp(),
 primary key(tenant,sequence,site), foreign key(tenant,sequence) references q02_runtime.events
);
create table q02_runtime.links (
 request_digest text primary key references q02_runtime.stages,
 tenant text not null references q02_runtime.tenants, binding jsonb not null,
 committed_at timestamptz not null default clock_timestamp()
);
create table q02_runtime.replays (
 replay_id text primary key check(replay_id ~ '^[A-Za-z0-9_-]{43}$'), request_digest text not null references q02_runtime.links
);
create table q02_runtime.suppressions (
 request_digest text primary key references q02_runtime.stages, event_digest text not null,
 created_at timestamptz not null default clock_timestamp()
);
-- Only hashes in audit rows. Exact subjects are restricted authority/link data.
create table q02_runtime.audit (
 event_digest text primary key, subject_digest text not null, action text not null,
 created_at timestamptz not null default clock_timestamp()
);
create function q02_runtime.fence() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin perform pg_advisory_xact_lock(190217,1); return null; end $$;
create function q02_runtime.immutable() returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'Q02 immutable history'; end $$;
create function q02_runtime.append_event(t text,k text,r text,p jsonb) returns q02_runtime.events
language plpgsql security definer set search_path=pg_catalog,q02_runtime as $$
declare s q02_runtime.tenants; e q02_runtime.events; d text;
begin
 perform pg_advisory_xact_lock(190217,1);
 select * into strict s from q02_runtime.tenants where tenant=t for update;
 d:=q02_runtime.hash(jsonb_build_array(s.generation,s.sequence+1,s.head,k,r,p)::text);
 insert into q02_runtime.events(tenant,sequence,generation,previous_digest,digest,kind,request_digest,payload)
 values(t,s.sequence+1,s.generation,s.head,d,k,r,p) returning * into e;
 update q02_runtime.tenants set sequence=e.sequence,head=e.digest where tenant=t;
 return e;
end $$;
-- External checkpoint reconciliation sees committed append-only events only.
create function q02_runtime.fence_head(t text) returns jsonb language plpgsql security definer set search_path=pg_catalog,q02_runtime as $$
declare s q02_runtime.tenants;
begin
 if session_user<>'q02_coordinator_runtime' then raise exception 'Privacy authorization denied'; end if;
 perform pg_advisory_xact_lock(190217,1);
 select * into strict s from q02_runtime.tenants where tenant=t for update;
 return jsonb_build_object('generation',s.generation,'highWater',s.sequence,'headDigest',s.head);
end $$;
create function q02_runtime.journal(t text,after_sequence bigint) returns jsonb language plpgsql security definer set search_path=pg_catalog,q02_runtime as $$
declare s q02_runtime.tenants; anchor_digest text;
begin
 if session_user<>'q02_coordinator_runtime' or after_sequence<0 then raise exception 'Privacy authorization denied'; end if;
 perform pg_advisory_xact_lock(190217,1);
 select * into strict s from q02_runtime.tenants where tenant=t for update;
 if s.sequence-after_sequence>128 then raise exception 'Checkpoint reconciliation batch requires maintenance'; end if;
 if after_sequence=0 then anchor_digest:=s.genesis; else select digest into anchor_digest from q02_runtime.events where tenant=t and sequence=after_sequence; end if;
 return jsonb_build_object('generation',s.generation,'highWater',s.sequence,'headDigest',s.head,'anchor',anchor_digest,
  'events',(select coalesce(jsonb_agg(jsonb_build_object('sequence',sequence,'generation',generation,'previousDigest',previous_digest,'digest',digest,'kind',kind,'requestDigest',request_digest,'payload',payload,
   'preimage',jsonb_build_array(generation,sequence,previous_digest,kind,request_digest,payload)::text) order by sequence),'[]') from q02_runtime.events where tenant=t and sequence>after_sequence));
end $$;
-- A single narrowly scoped writer records only a proof already verified by the
-- pinned coordinator. The DB independently fences freshness, head equality,
-- monotonicity and nonce replay; the coordinator login has no table grants.
create function q02_runtime.set_checkpoint(p jsonb) returns boolean
language plpgsql security definer set search_path=pg_catalog,q02_runtime as $$
declare t text:=p->>'tenant'; s q02_runtime.tenants; old q02_runtime.checkpoints; verified timestamptz;
begin
 if session_user<>'q02_coordinator_runtime' or p is null or octet_length(p::text)>4096 or
   coalesce(p->>'generation','') !~ '^[A-Za-z0-9_-]{43}$' or
   coalesce(p->>'headDigest','') !~ '^[A-Za-z0-9_-]{43}$' or
   coalesce(p->>'evidenceDigest','') !~ '^[A-Za-z0-9_-]{43}$' or
   coalesce(p->>'nonceDigest','') !~ '^[A-Za-z0-9_-]{43}$' or
   coalesce(p->>'enrollmentReference','')='' or
   coalesce(p->>'highWater','') !~ '^(0|[1-9][0-9]{0,17})$' or
   coalesce(p->>'verifiedAt','') !~ '^[0-9]{13}$' then raise exception 'Privacy authorization denied'; end if;
 verified:=to_timestamp((p->>'verifiedAt')::numeric/1000);
 if verified>clock_timestamp() or verified<=clock_timestamp()-interval '10 seconds' then raise exception 'Privacy authorization denied'; end if;
 perform pg_advisory_xact_lock(190217,1);
 select * into strict s from q02_runtime.tenants where tenant=t for update;
 if s.generation<>p->>'generation' or s.sequence<>(p->>'highWater')::bigint or s.head<>p->>'headDigest' then raise exception 'Checkpoint mismatch'; end if;
 select * into old from q02_runtime.checkpoints where tenant=t for update;
 if found and (old.generation<>s.generation or old.high_water>s.sequence or
   (old.high_water=s.sequence and old.head_digest<>s.head) or old.verified_at>verified) then raise exception 'Checkpoint mismatch'; end if;
 insert into q02_runtime.checkpoint_nonces values(t,p->>'nonceDigest',p->>'evidenceDigest',verified);
 insert into q02_runtime.checkpoints values(t,s.generation,s.sequence,s.head,p->>'evidenceDigest',verified,p->>'enrollmentReference')
 on conflict(tenant) do update set generation=excluded.generation,high_water=excluded.high_water,
   head_digest=excluded.head_digest,evidence_digest=excluded.evidence_digest,verified_at=excluded.verified_at,
   enrollment_reference=excluded.enrollment_reference;
 return true;
end $$;
create function q02_runtime.site_context(t text,sub text,sid_digest text) returns jsonb language plpgsql security definer set search_path=pg_catalog,q02_runtime,public as $$
declare site_name text; si q02_runtime.sites; c q02_runtime.credentials; co jsonb; status text; issuance boolean;
begin
 site_name:=case session_user when 'q02_support_runtime' then 'support' when 'q02_portal_runtime' then 'portal' else null end;
 if site_name is null then raise exception 'Privacy authorization denied'; end if;
 perform pg_advisory_xact_lock(190217,1);
 select * into strict si from q02_runtime.sites where tenant=t and site=site_name and active;
 select * into strict c from q02_runtime.credentials where tenant=t and site=site_name and subject=sub and session_digest=sid_digest and credentials.status='active' and expires_at>clock_timestamp() and issuer=si.issuer and party=si.party;
 if site_name='support' then
  select m.status,d.issuance into status,issuance from public.support_privacy_memberships m join public.support_privacy_deployments d using(site,tenant) where m.site=site_name and m.tenant=t and m.subject=sub;
  select jsonb_build_object('epoch',epoch,'active',state='active','version',disclosure,'scopes',scopes) into co from public.support_privacy_consents where site=site_name and tenant=t and subject=sub;
 else
  select m.status,d.enabled into status,issuance from public.q02_portal_memberships m join public.q02_portal_deployments d using(site,tenant) where m.site=site_name and m.tenant=t and m.subject=sub and d.clerk_issuer=si.issuer and d.portal_party=si.party;
  select jsonb_build_object('epoch',epoch,'active',active,'version',consent_version,'scopes',scopes) into co from public.q02_portal_consents where site=site_name and tenant=t and subject=sub;
 end if;
 if status is distinct from 'active' or issuance is distinct from true then raise exception 'Privacy authorization denied'; end if;
 return jsonb_build_object('site',site_name,'tenant',t,'subject',sub,'issuer',si.issuer,'party',si.party,'proof',si.proof,'proofKeys',si.proof_keys,'consent',co,
  'peer',(select jsonb_build_object('proof',proof,'proofKeys',proof_keys) from q02_runtime.sites where tenant=t and site<>site_name and active));
end $$;
create function q02_runtime.receipt_context(t text,sub text,sid_digest text,challenge_digest text) returns jsonb language plpgsql security definer set search_path=pg_catalog,q02_runtime,public as $$
declare a jsonb; h public.q02_portal_challenges;
begin
 if session_user<>'q02_portal_runtime' then raise exception 'Privacy authorization denied'; end if;
 a:=q02_runtime.site_context(t,sub,sid_digest);
 select * into strict h from public.q02_portal_challenges where digest=challenge_digest and tenant=t and site='portal' and subject=sub and session_digest=sid_digest and state='pending' and expires_at>clock_timestamp();
 if a->'consent'->>'active' is distinct from 'true' or a->'consent'->>'epoch' is distinct from h.epoch::text then raise exception 'Privacy authorization denied'; end if;
 return a||jsonb_build_object('challengeExpiresAt',floor(extract(epoch from h.expires_at))::bigint);
end $$;
-- Context is a private transaction-local temp row. SET/GUC input cannot forge it.
create function q02_runtime.lock_authority(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,q02_runtime,public as $$
declare t text:=p->>'tenant'; s jsonb; a jsonb:='{}'; cur jsonb:='{}'; site_name text;
 si q02_runtime.sites; cr q02_runtime.credentials; st q02_runtime.tenants; ev q02_runtime.events;
 sc public.support_privacy_consents; pc public.q02_portal_consents; ch public.q02_portal_challenges;
 sd public.support_privacy_deployments; pd public.q02_portal_deployments;
 membership_status text; subject_name text; b jsonb; n bigint; ack_count integer; challenge_hash text; checkpoint_matches boolean;
begin
 if session_user<>'q02_coordinator_runtime' or p is null or octet_length(p::text)>8192 or
 p->>'mode' not in ('stage','consume','use') or t is null or
 exists(select 1 from unnest(array['requestDigest','challengeDigest','supportSessionDigest','portalSessionDigest']) x where coalesce(p->>x,'') !~ '^[A-Za-z0-9_-]{43}$') or
 p->>'supportSubject' !~ '^user_[A-Za-z0-9_-]{1,123}$' or p->>'portalSubject' !~ '^user_[A-Za-z0-9_-]{1,123}$' then raise exception 'Privacy authorization denied'; end if;
 perform pg_advisory_xact_lock(190217,1);
 select * into strict st from q02_runtime.tenants where tenant=t for update;
 -- Fresh externally signed checkpoint is verified by adapter under this lock.
 -- All DB heads must match, including after restoring BOTH sites together.
 select exists(select 1 from q02_runtime.checkpoints cp where cp.tenant=t and cp.generation=st.generation and
   cp.high_water=st.sequence and cp.head_digest=st.head and cp.generation=p->'checkpoint'->>'generation' and
   cp.high_water=(p->'checkpoint'->>'highWater')::bigint and cp.head_digest=p->'checkpoint'->>'headDigest' and
   cp.evidence_digest=p->'checkpoint'->>'evidenceDigest' and cp.verified_at>clock_timestamp()-interval '10 seconds' and cp.verified_at<=clock_timestamp()) into checkpoint_matches;
 if checkpoint_matches is distinct from true then raise exception 'Checkpoint mismatch'; end if;
 select * into sd from public.support_privacy_deployments where site='support' and tenant=t;
 select * into pd from public.q02_portal_deployments where site='portal' and tenant=t;
 select * into sc from public.support_privacy_consents where site='support' and tenant=t and subject=p->>'supportSubject';
 select * into pc from public.q02_portal_consents where site='portal' and tenant=t and subject=p->>'portalSubject';
 if sd.issuance is distinct from true or pd.enabled is distinct from true or pd.support_site is distinct from 'support' then raise exception 'Privacy authorization denied'; end if;
 foreach site_name in array array['support','portal'] loop
  subject_name:=p->>(site_name||'Subject');
  select * into strict si from q02_runtime.sites where tenant=t and site=site_name;
  select * into strict cr from q02_runtime.credentials where tenant=t and site=site_name and subject=subject_name and session_digest=p->>(site_name||'SessionDigest');
  if not si.active or cr.status<>'active' or cr.expires_at<=clock_timestamp() or cr.issuer<>si.issuer or cr.party<>si.party or
   (site_name='portal' and (pd.clerk_issuer<>si.issuer or pd.portal_party<>si.party)) then raise exception 'Privacy authorization denied'; end if;
  if site_name='support' then
   select status into membership_status from public.support_privacy_memberships where site='support' and tenant=t and subject=subject_name;
   b:=jsonb_build_object('state',sc.state,'epoch',sc.epoch,'version',sc.disclosure,'scopes',sc.scopes);
  else
   select status into membership_status from public.q02_portal_memberships where site='portal' and tenant=t and subject=subject_name;
   b:=jsonb_build_object('state',case when pc.active then 'active' else 'withdrawn' end,'epoch',pc.epoch,'version',pc.consent_version,'scopes',pc.scopes);
  end if;
  if membership_status is distinct from 'active' or b->>'state' is distinct from 'active' or b->'scopes' is distinct from '["derived_summary","preferences"]'::jsonb then raise exception 'Privacy authorization denied'; end if;
  a:=a||jsonb_build_object(site_name,jsonb_build_object('issuer',si.issuer,'party',si.party,'proof',si.proof,'proofKeys',si.proof_keys));
  cur:=cur||jsonb_build_object(site_name,b||jsonb_build_object('site',site_name,'tenant',t,'subject',subject_name,'issuer',si.issuer,'party',si.party,'membership',membership_status,'enrolledSessionDigest',cr.session_digest,'credentialStatus',cr.status,'issuance',true));
 end loop;
 if p->>'mode'='use' then
  select binding into strict b from q02_runtime.links where request_digest=p->>'requestDigest' and tenant=t;
  if b->>'supportSubject' is distinct from sc.subject or b->>'portalSubject' is distinct from pc.subject or
   b->>'supportEpoch' is distinct from sc.epoch::text or b->>'portalEpoch' is distinct from pc.epoch::text or
   b->>'supportSessionDigest' is distinct from p->>'supportSessionDigest' or b->>'portalSessionDigest' is distinct from p->>'portalSessionDigest' or
   exists(select 1 from q02_runtime.suppressions where request_digest=p->>'requestDigest') then raise exception 'Privacy authorization denied'; end if;
  challenge_hash:=q02_runtime.hash(b->>'challenge');
 else challenge_hash:=p->>'challengeDigest'; end if;
 select * into strict ch from public.q02_portal_challenges where digest=challenge_hash;
 if ch.site<>'portal' or ch.tenant<>t or ch.support_site<>'support' or ch.subject<>pc.subject or ch.epoch<>pc.epoch or
 ch.session_digest<>p->>'portalSessionDigest' or ch.state<>'pending' or (p->>'mode'<>'use' and ch.expires_at<=clock_timestamp()) then raise exception 'Privacy authorization denied'; end if;
 -- Raw challenge comes from the authenticated proof, never persisted in context.
 cur:=cur||jsonb_build_object('challenge',jsonb_build_object('digest',ch.digest,'subject',ch.subject,'sessionDigest',ch.session_digest,'state',ch.state,'epoch',ch.epoch,'expiresAt',floor(extract(epoch from ch.expires_at))::bigint));
 select e.* into ev from q02_runtime.events e join q02_runtime.stages x using(tenant,sequence) where x.request_digest=p->>'requestDigest' and x.tenant=t;
 -- Bind the stage to its prospective committed journal sequence so the same
 -- binding survives the separate consume transaction after checkpoint refresh.
 n:=coalesce(ev.sequence,st.sequence+1);
 select count(*) into ack_count from q02_runtime.acks where tenant=t and sequence=ev.sequence and event_digest=ev.digest;
 select case when p->>'mode'='use' then use_manifest else manifest end into strict s from q02_runtime.services where tenant=t for update;
 create temporary table if not exists q02_locked_context(request jsonb not null, authority jsonb not null) on commit drop;
 -- A runtime-created temp table with this name cannot be adopted by definer.
 if (select relowner from pg_class where oid='pg_temp.q02_locked_context'::regclass)<>(select oid from pg_roles where rolname=current_user) then raise exception 'Invalid authority context'; end if;
 if exists(select 1 from pg_temp.q02_locked_context) then raise exception 'One authority context per transaction'; end if;
 -- Staging commits before the two site logins ACK. On the later consume
 -- transaction, derive ACK readiness from the exact staged event; never trust
 -- an adapter-supplied boolean or an ACK for another event/session.
 a:=jsonb_build_object('link',case when p->>'mode'='use' then b else null end,'authorities',a,'current',cur,'service',s,'reconciliation',jsonb_build_object('ready',checkpoint_matches,'generation',st.generation,'highWater',case when p->>'mode'='stage' then n else st.sequence end,'local',case when ack_count=2 then st.sequence else null end,'portal',case when ack_count=2 then st.sequence else null end),'outbox',jsonb_build_object('pending',greatest(0,2-ack_count),'acknowledged',ack_count=2));
 insert into pg_temp.q02_locked_context values(p,a);
 return a;
end $$;
create function q02_runtime.assert_current(b jsonb) returns boolean
language plpgsql security definer set search_path=pg_catalog,q02_runtime as $$
declare p jsonb; a jsonb; stored jsonb; site_name text; kid text; keys jsonb; key_row jsonb; mode text;
begin
 select request,authority into strict p,a from pg_temp.q02_locked_context;
 mode:=p->>'mode';
 if b->>'requestDigest' is distinct from p->>'requestDigest' or b->>'generation' is distinct from a->'reconciliation'->>'generation' or
 b->>'supportSubject' is distinct from p->>'supportSubject' or b->>'portalSubject' is distinct from p->>'portalSubject' or
 b->>'supportSessionDigest' is distinct from p->>'supportSessionDigest' or b->>'portalSessionDigest' is distinct from p->>'portalSessionDigest' or
 b->>'supportEpoch' is distinct from a->'current'->'support'->>'epoch' or b->>'portalEpoch' is distinct from a->'current'->'portal'->>'epoch' or
 b->>'highWater' is distinct from a->'reconciliation'->>'highWater' or
 q02_runtime.hash(b->>'challenge') is distinct from a->'current'->'challenge'->>'digest' or
 (b->>'expiresAt')::bigint<=extract(epoch from clock_timestamp()) or (b->>'expiresAt')::bigint>extract(epoch from clock_timestamp())+120 or
 (b->>'expiresAt')::bigint>(a->'current'->'challenge'->>'expiresAt')::bigint then return false; end if;
 foreach site_name in array array['support','portal','service'] loop
  if site_name='service' then keys:=a->'service'->'keys'; else keys:=a->'authorities'->site_name->'proofKeys'; end if;
  -- Checking ALL enrolled keys is conservative on expiry. Rotation requires a
  -- bounded manifest containing only current overlap keys; revoked keys deny.
  for key_row in select value from jsonb_array_elements(keys) loop
   if (key_row->>'revoked')::boolean is distinct from false or (key_row->>'notBefore')::bigint>extract(epoch from clock_timestamp()) or
    (key_row->>'notAfter')::bigint<=(b->>'expiresAt')::bigint then return false; end if;
  end loop;
 end loop;
 if mode='consume' then
  select binding into stored from q02_runtime.stages where request_digest=b->>'requestDigest';
  if stored is distinct from b or (a->'outbox'->>'acknowledged')::boolean is distinct from true then return false; end if;
 end if;
 if exists(select 1 from q02_runtime.suppressions where request_digest=b->>'requestDigest') then return false; end if;
 if exists(select 1 from q02_runtime.links where request_digest=b->>'requestDigest') then return false; end if;
 if (select count(distinct v) from unnest(array[b->>'supportJti',b->>'portalJti',b->>'serviceJti',b->>'challenge']) v)<>4 or
 exists(select 1 from unnest(array['requestDigest','supportDigest','receiptDigest','supportJti','portalJti','serviceJti','challenge','supportSessionDigest','portalSessionDigest','generation']) k where coalesce(b->>k,'') !~ '^[A-Za-z0-9_-]{43}$') then return false; end if;
 -- An issued support intent must exist; valid offline signatures cannot invent it.
 if not exists(select 1 from public.support_privacy_intents where jti=b->>'supportJti' and tenant=p->>'tenant' and site='support' and subject=b->>'supportSubject' and epoch=(b->>'supportEpoch')::bigint and nonce=b->>'challenge' and consumed_at is null and expires_at>clock_timestamp()) then return false; end if;
 return true;
end $$;
create function q02_runtime.stage(b jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,q02_runtime as $$
declare p jsonb; ev q02_runtime.events; old_binding jsonb;
begin
 select request into strict p from pg_temp.q02_locked_context;
 if p->>'mode'<>'stage' or not q02_runtime.assert_current(b) then raise exception 'Privacy authorization denied'; end if;
 select binding into old_binding from q02_runtime.stages where request_digest=b->>'requestDigest';
 if found then
  if old_binding<>b then raise exception 'Stage binding mismatch'; end if;
  select e.* into ev from q02_runtime.events e join q02_runtime.stages s using(tenant,sequence) where s.request_digest=b->>'requestDigest';
 else
  ev:=q02_runtime.append_event(p->>'tenant','stage',b->>'requestDigest',jsonb_build_object('bindingDigest',q02_runtime.hash(b::text)));
  insert into q02_runtime.stages values(b->>'requestDigest',p->>'tenant',ev.sequence,b);
 end if;
 return jsonb_build_object('staged',true,'requestDigest',b->>'requestDigest','eventDigest',ev.digest,'sequence',ev.sequence,'generation',ev.generation,'headDigest',ev.digest);
end $$;
create function q02_runtime.consume(b jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,q02_runtime as $$
declare p jsonb; ev q02_runtime.events; v text;
begin
 select request into strict p from pg_temp.q02_locked_context;
 if p->>'mode'<>'consume' or not q02_runtime.assert_current(b) then raise exception 'Privacy authorization denied'; end if;
 insert into q02_runtime.links values(b->>'requestDigest',p->>'tenant',b,clock_timestamp());
 foreach v in array array[b->>'supportJti',b->>'portalJti',b->>'serviceJti',b->>'challenge'] loop
  insert into q02_runtime.replays values(v,b->>'requestDigest');
 end loop;
 select e.* into strict ev from q02_runtime.events e join q02_runtime.stages s using(tenant,sequence) where s.request_digest=b->>'requestDigest';
 insert into q02_runtime.audit values(ev.digest,q02_runtime.hash(jsonb_build_array(b->>'supportSubject',b->>'portalSubject')::text),'link',clock_timestamp());
 return jsonb_build_object('committed',true,'requestDigest',b->>'requestDigest','eventDigest',ev.digest,'bothAcknowledged',true);
end $$;
-- Shared PostgreSQL ACK: independently authenticated site login, fixed role to
-- site mapping, exact event digest and enrolled live account session digest.
-- This replaces cross-database signed delivery: neither site can ACK its peer.
create function q02_runtime.ack(t text,n bigint,d text,sub text,sid_digest text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,q02_runtime as $$
declare site_name text; ev q02_runtime.events; b jsonb;
begin
 site_name:=case session_user when 'q02_support_runtime' then 'support' when 'q02_portal_runtime' then 'portal' else null end;
 if site_name is null then raise exception 'Privacy authorization denied'; end if;
 perform pg_advisory_xact_lock(190217,1);
 select * into strict ev from q02_runtime.events where tenant=t and sequence=n and digest=d;
 if ev.kind='stage' then
  select binding into strict b from q02_runtime.stages where tenant=t and sequence=n;
  if b->>(site_name||'Subject') is distinct from sub or b->>(site_name||'SessionDigest') is distinct from sid_digest or
   (b->>'expiresAt')::bigint<=extract(epoch from clock_timestamp()) or exists(select 1 from q02_runtime.suppressions where request_digest=ev.request_digest) then raise exception 'Privacy authorization denied'; end if;
 end if;
 if not exists(select 1 from q02_runtime.credentials c join q02_runtime.sites s using(tenant,site)
  where c.tenant=t and c.site=site_name and c.subject=sub and c.session_digest=sid_digest and c.status='active' and c.expires_at>clock_timestamp() and s.active and c.issuer=s.issuer and c.party=s.party) then raise exception 'Privacy authorization denied'; end if;
 insert into q02_runtime.acks values(t,n,site_name,d,sid_digest,clock_timestamp()) on conflict do nothing;
 if not exists(select 1 from q02_runtime.acks where tenant=t and sequence=n and site=site_name and event_digest=d and credential_digest=sid_digest) then raise exception 'ACK mismatch'; end if;
 return jsonb_build_object('acknowledged',true,'eventDigest',d,'site',site_name);
end $$;
-- Suppression is synchronous for BOTH sites, including already staged events.
create function q02_runtime.suppress() returns trigger language plpgsql security definer set search_path=pg_catalog,q02_runtime as $$
declare t text; r record; ev q02_runtime.events; row_data jsonb;
begin
 if to_jsonb(new)=to_jsonb(old) then return new; end if;
 row_data:=coalesce(to_jsonb(new),to_jsonb(old)); t:=row_data->>'tenant';
 for r in select * from q02_runtime.stages s where s.tenant=t and not exists(select 1 from q02_runtime.suppressions x where x.request_digest=s.request_digest) loop
  ev:=q02_runtime.append_event(t,'suppress',r.request_digest,jsonb_build_object('source',tg_table_name,'rowDigest',q02_runtime.hash(row_data::text)));
  insert into q02_runtime.suppressions values(r.request_digest,ev.digest,clock_timestamp());
  insert into q02_runtime.audit values(ev.digest,q02_runtime.hash(coalesce(row_data->>'subject',t)),'suppress',clock_timestamp());
 end loop;
 return coalesce(new,old);
end $$;
do $$ declare tab text; begin
 foreach tab in array array['events','stages','acks','links','replays','suppressions','audit'] loop
  execute format('alter table q02_runtime.%I enable row level security',tab);
  execute format('create trigger immutable_history before update or delete or truncate on q02_runtime.%I for each statement execute function q02_runtime.immutable()',tab);
 end loop;
 foreach tab in array array['tenants','sites','credentials','services','checkpoints','checkpoint_nonces'] loop
  execute format('alter table q02_runtime.%I enable row level security',tab);
  execute format('create trigger authority_fence before insert or update or delete on q02_runtime.%I for each statement execute function q02_runtime.fence()',tab);
 end loop;
end $$;
reset role;
-- All writers, including independently managed enrollment/revocation, acquire
-- the global fence before row locks. Applications cannot bypass via old RPCs.
alter function public.support_privacy_transition(text,text,text,text,bigint,text[],text,text,timestamptz,timestamptz) rename to support_privacy_transition_pre_q02_runtime;
revoke all on function public.support_privacy_transition_pre_q02_runtime(text,text,text,text,bigint,text[],text,text,timestamptz,timestamptz) from public,anon,authenticated,service_role;
create function public.support_privacy_transition(p_action text,p_site text,p_tenant text,p_subject text,p_expected_epoch bigint,p_scopes text[] default '{}',p_jti text default null,p_nonce text default null,p_issued_at timestamptz default null,p_expires_at timestamptz default null)
returns bigint language plpgsql security definer set search_path=pg_catalog,public as $$ begin
 perform pg_advisory_xact_lock(190217,1);
 return public.support_privacy_transition_pre_q02_runtime(p_action,p_site,p_tenant,p_subject,p_expected_epoch,p_scopes,p_jti,p_nonce,p_issued_at,p_expires_at);
end $$;
revoke all on function public.support_privacy_transition(text,text,text,text,bigint,text[],text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.support_privacy_transition(text,text,text,text,bigint,text[],text,text,timestamptz,timestamptz) to service_role;
alter function public.q02_portal_transition(text,text,text,text,text,text,bigint,boolean,text,text[],text,text) rename to q02_portal_transition_pre_runtime;
revoke all on function public.q02_portal_transition_pre_runtime(text,text,text,text,text,text,bigint,boolean,text,text[],text,text) from public,anon,authenticated,service_role;
create function public.q02_portal_transition(p_site text,p_tenant text,p_subject text,p_issuer text,p_party text,p_action text,p_expected_epoch bigint default null,p_opt_in boolean default false,p_version text default null,p_scopes text[] default null,p_digest text default null,p_session_digest text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$ begin
 perform pg_advisory_xact_lock(190217,1);
 return public.q02_portal_transition_pre_runtime(p_site,p_tenant,p_subject,p_issuer,p_party,p_action,p_expected_epoch,p_opt_in,p_version,p_scopes,p_digest,p_session_digest);
end $$;
revoke all on function public.q02_portal_transition(text,text,text,text,text,text,bigint,boolean,text,text[],text,text) from public,anon,authenticated;
grant execute on function public.q02_portal_transition(text,text,text,text,text,text,bigint,boolean,text,text[],text,text) to service_role;
do $$ declare tab text; begin
 foreach tab in array array['support_privacy_deployments','support_privacy_memberships','support_privacy_consents','q02_portal_deployments','q02_portal_memberships','q02_portal_consents','q02_portal_challenges'] loop
  execute format('create trigger q02_runtime_fence before insert or update or delete on public.%I for each statement execute function q02_runtime.fence()',tab);
  execute format('create trigger q02_runtime_suppress after update or delete on public.%I for each row execute function q02_runtime.suppress()',tab);
 end loop;
 foreach tab in array array['sites','credentials','services'] loop
  execute format('create trigger q02_runtime_suppress after update or delete on q02_runtime.%I for each row execute function q02_runtime.suppress()',tab);
 end loop;
end $$;
revoke all on all tables in schema q02_runtime from public,anon,authenticated,service_role,q02_coordinator_runtime,q02_support_runtime,q02_portal_runtime;
revoke all on all functions in schema q02_runtime from public,anon,authenticated,service_role,q02_coordinator_runtime,q02_support_runtime,q02_portal_runtime;
grant execute on function q02_runtime.fence_head(text),q02_runtime.journal(text,bigint),q02_runtime.set_checkpoint(jsonb),q02_runtime.lock_authority(jsonb),q02_runtime.assert_current(jsonb),q02_runtime.stage(jsonb),q02_runtime.consume(jsonb) to q02_coordinator_runtime;
grant execute on function q02_runtime.site_context(text,text,text),q02_runtime.receipt_context(text,text,text,text),q02_runtime.ack(text,bigint,text,text,text) to q02_support_runtime,q02_portal_runtime;
commit;
