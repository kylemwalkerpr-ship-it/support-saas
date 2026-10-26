-- Apply after 019. No identities, credentials, keys or checkpoint are seeded.
begin;
grant execute on function public.support_privacy_transition(text,text,text,text,bigint,text[],text,text,timestamptz,timestamptz) to q02_authority_owner;
grant select,insert,update on public.q02_portal_consents,public.q02_portal_challenges to q02_authority_owner;
grant insert on public.q02_portal_tombstones to q02_authority_owner;
create policy q02_route_insert on public.q02_portal_consents for insert to q02_authority_owner with check(true);
create policy q02_route_update on public.q02_portal_consents for update to q02_authority_owner using(true) with check(true);
create policy q02_route_insert on public.q02_portal_challenges for insert to q02_authority_owner with check(true);
create policy q02_route_update on public.q02_portal_challenges for update to q02_authority_owner using(true) with check(true);
create policy q02_route_insert on public.q02_portal_tombstones for insert to q02_authority_owner with check(true);
set local role q02_authority_owner;
create or replace function q02_runtime.site_context(t text,sub text,sid_digest text) returns jsonb language plpgsql security definer set search_path=pg_catalog,q02_runtime,public as $$
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
  'peer',(select jsonb_build_object('issuer',issuer,'party',party,'proof',proof,'proofKeys',proof_keys) from q02_runtime.sites where tenant=t and site<>site_name and active));
end $$;
create function q02_runtime.site_role() returns text language sql stable set search_path=pg_catalog as $$
 select case session_user when 'q02_support_runtime' then 'support' when 'q02_portal_runtime' then 'portal' else null end $$;
-- Only an authenticated site server may attest its own freshly JWT+Clerk-verified
-- session. Managed subject membership and signer metadata are independently DBA
-- enrolled. Revoked credentials cannot be revived by this function.
create function q02_runtime.enroll_session(t text,sub text,sd text,iss text,party_origin text,expiry bigint) returns boolean
language plpgsql security definer set search_path=pg_catalog,q02_runtime,public as $$
declare sn text:=q02_runtime.site_role(); si q02_runtime.sites; member_status text;
begin
 if sn is null or sub is null or sub !~ '^user_[A-Za-z0-9_-]{1,123}$' or sd is null or sd !~ '^[A-Za-z0-9_-]{43}$' or expiry is null or
 expiry<=extract(epoch from clock_timestamp()) or expiry>extract(epoch from clock_timestamp())+86400 then raise exception 'Privacy authorization denied'; end if;
 perform pg_advisory_xact_lock(190217,1);
 select * into strict si from q02_runtime.sites where tenant=t and site=sn;
 if si.issuer is distinct from iss or si.party is distinct from party_origin then raise exception 'Privacy authorization denied'; end if;
 if sn='support' then select status into member_status from public.support_privacy_memberships where tenant=t and site=sn and subject=sub;
 else select status into member_status from public.q02_portal_memberships where tenant=t and site=sn and subject=sub; end if;
 if member_status is null then raise exception 'Privacy authorization denied'; end if;
 if exists(select 1 from q02_runtime.credentials where tenant=t and site=sn and subject=sub and session_digest=sd and status='revoked') then raise exception 'Revoked credential'; end if;
 -- Do not UPDATE an unchanged enrollment: authority changes intentionally suppress
 -- outstanding stages. A later JWT cannot extend an in-flight stage's authority.
 insert into q02_runtime.credentials values(t,sn,sub,sd,iss,party_origin,'active',to_timestamp(expiry),'site live JWT and Clerk verification') on conflict do nothing;
 return exists(select 1 from q02_runtime.credentials where tenant=t and site=sn and subject=sub and session_digest=sd and status='active' and expires_at>clock_timestamp());
end $$;
create function q02_runtime.site_command(t text,sub text,sd text,p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,q02_runtime,public as $$
declare sn text:=q02_runtime.site_role(); a jsonb; act text:=p->>'action'; ep bigint; pc public.q02_portal_consents; scopes text[];
begin
 if sn is null or p is null or octet_length(p::text)>8192 or act is null or act not in ('review','withdraw_context','grant','withdraw','reserve','challenge','cancel') then raise exception 'Privacy authorization denied'; end if;
 perform pg_advisory_xact_lock(190217,1);
 if act in ('withdraw','withdraw_context') then
  if not exists(select 1 from q02_runtime.credentials c join q02_runtime.sites s using(tenant,site) where c.tenant=t and c.site=sn and c.subject=sub and c.session_digest=sd and c.status='active' and c.expires_at>clock_timestamp() and c.issuer=s.issuer and c.party=s.party) then raise exception 'Privacy authorization denied'; end if;
 else a:=q02_runtime.site_context(t,sub,sd); end if;
 if act in ('review','withdraw_context') and (select array_agg(k order by k) from jsonb_object_keys(p) k) is distinct from array['action'] then raise exception 'Privacy authorization denied'; end if;
 if act='withdraw_context' then
  if sn='support' then select jsonb_build_object('epoch',epoch) into a from public.support_privacy_consents where site=sn and tenant=t and subject=sub;
  else select jsonb_build_object('epoch',epoch) into a from public.q02_portal_consents where site=sn and tenant=t and subject=sub; end if;
  return jsonb_build_object('consent',coalesce(a,jsonb_build_object('epoch',0)));
 end if;
 if act='review' then return a||(select jsonb_build_object('service',manifest) from q02_runtime.services where tenant=t); end if;
 if act='reserve' then
  if sn<>'support' or (select array_agg(k order by k) from jsonb_object_keys(p) k) is distinct from array['action','epoch','exp','iat','jti','nonce','scopes'] then raise exception 'Privacy authorization denied'; end if;
 elsif act in ('grant','withdraw') then
  if (select array_agg(k order by k) from jsonb_object_keys(p) k) is distinct from array['action','epoch','scopes','version'] then raise exception 'Privacy authorization denied'; end if;
 else
  if sn<>'portal' or (select array_agg(k order by k) from jsonb_object_keys(p) k) is distinct from array['action','digest','epoch'] then raise exception 'Privacy authorization denied'; end if;
 end if;
 ep:=(p->>'epoch')::bigint;
 if ep is null or ep<0 then raise exception 'Privacy authorization denied'; end if;
 if act='grant' and (p->'scopes' is distinct from '["derived_summary","preferences"]'::jsonb or p->>'version' is distinct from case sn when 'support' then 'q02-support-v1' else 'portal-v7-1' end) then raise exception 'Explicit consent required'; end if;
 if sn='support' then
  if act not in ('grant','withdraw','reserve') then raise exception 'Privacy authorization denied'; end if;
  select coalesce(array_agg(value),'{}'::text[]) into scopes from jsonb_array_elements_text(p->'scopes');
  ep:=public.support_privacy_transition(act,'support',t,sub,ep,scopes,p->>'jti',p->>'nonce',to_timestamp((p->>'iat')::bigint),to_timestamp((p->>'exp')::bigint));
  return jsonb_build_object('epoch',ep);
 end if;
 insert into public.q02_portal_consents(site,tenant,subject) values('portal',t,sub) on conflict do nothing;
 select * into strict pc from public.q02_portal_consents where site='portal' and tenant=t and subject=sub for update;
 if pc.epoch<>ep then raise exception 'Stale epoch' using errcode='40001'; end if;
 if act in ('grant','withdraw') then
  update public.q02_portal_consents set active=(act='grant'),epoch=epoch+1,scopes=case when act='grant' then array['derived_summary','preferences'] else '{}'::text[] end,changed_at=clock_timestamp() where site='portal' and tenant=t and subject=sub returning * into pc;
  update public.q02_portal_challenges set state='cancelled' where site='portal' and tenant=t and subject=sub and state='pending';
  if act='withdraw' then insert into public.q02_portal_tombstones(site,tenant,subject,epoch) values('portal',t,sub,pc.epoch); end if;
 elsif act in ('challenge','cancel') then
  if not pc.active or p->>'digest' is null or p->>'digest' !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'Privacy authorization denied'; end if;
  if act='challenge' then
   insert into public.q02_portal_challenges values(p->>'digest','portal',t,sub,sd,pc.epoch,'support','portal-v7-1',array['derived_summary','preferences'],'account-memory-link-reciprocal',clock_timestamp()+interval '120 seconds','pending');
  else
   update public.q02_portal_challenges set state='cancelled' where digest=p->>'digest' and tenant=t and subject=sub and session_digest=sd and epoch=pc.epoch and state='pending';
   if not found then raise exception 'Privacy authorization denied'; end if;
  end if;
 else raise exception 'Privacy authorization denied'; end if;
 return jsonb_build_object('epoch',pc.epoch,'active',pc.active,'version',pc.consent_version,'scopes',pc.scopes);
end $$;
create table q02_runtime.receipts (
 jti text primary key check(jti ~ '^[A-Za-z0-9_-]{43}$'), tenant text not null references q02_runtime.tenants,
 portal_subject text not null, portal_session_digest text not null, portal_epoch bigint not null,
 support_subject text not null, support_epoch bigint not null, support_jti text not null,
 support_digest text not null, challenge_digest text not null unique,
 issued_at timestamptz not null, expires_at timestamptz not null
);
alter table q02_runtime.receipts enable row level security;
create trigger immutable_history before update or delete or truncate on q02_runtime.receipts for each statement execute function q02_runtime.immutable();
create function q02_runtime.reserve_receipt(t text,sub text,sd text,p jsonb) returns boolean
language plpgsql security definer set search_path=pg_catalog,q02_runtime,public as $$
declare a jsonb; intent public.support_privacy_intents;
begin
 if session_user<>'q02_portal_runtime' or p is null or octet_length(p::text)>4096 or
 (select array_agg(k order by k) from jsonb_object_keys(p) k) is distinct from array['challenge','exp','iat','jti','portalEpoch','supportDigest','supportEpoch','supportJti','supportSubject'] or
 exists(select 1 from unnest(array['challenge','jti','supportDigest','supportJti']) k where coalesce(p->>k,'') !~ '^[A-Za-z0-9_-]{43}$') then raise exception 'Privacy authorization denied'; end if;
 a:=q02_runtime.receipt_context(t,sub,sd,q02_runtime.hash(p->>'challenge'));
 if p->>'portalEpoch' is distinct from a->'consent'->>'epoch' or (p->>'iat')::bigint>extract(epoch from clock_timestamp()) or (p->>'iat')::bigint<extract(epoch from clock_timestamp())-10 or
 (p->>'exp')::bigint<=extract(epoch from clock_timestamp()) or (p->>'exp')::bigint>(p->>'iat')::bigint+120 or (p->>'exp')::bigint>(a->>'challengeExpiresAt')::bigint then raise exception 'Privacy authorization denied'; end if;
 select * into strict intent from public.support_privacy_intents where site='support' and tenant=t and subject=p->>'supportSubject' and jti=p->>'supportJti' and epoch=(p->>'supportEpoch')::bigint and nonce=p->>'challenge' and consumed_at is null and expires_at>clock_timestamp();
 if (p->>'exp')::bigint>extract(epoch from intent.expires_at) then raise exception 'Privacy authorization denied'; end if;
 insert into q02_runtime.receipts values(p->>'jti',t,sub,sd,(p->>'portalEpoch')::bigint,p->>'supportSubject',(p->>'supportEpoch')::bigint,p->>'supportJti',p->>'supportDigest',q02_runtime.hash(p->>'challenge'),to_timestamp((p->>'iat')::bigint),to_timestamp((p->>'exp')::bigint));
 return true;
end $$;
create or replace function q02_runtime.assert_current(b jsonb) returns boolean
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
 if not exists(select 1 from q02_runtime.receipts r where r.tenant=p->>'tenant' and r.jti=b->>'portalJti' and r.portal_subject=b->>'portalSubject' and r.portal_session_digest=b->>'portalSessionDigest' and r.portal_epoch=(b->>'portalEpoch')::bigint and r.support_subject=b->>'supportSubject' and r.support_epoch=(b->>'supportEpoch')::bigint and r.support_jti=b->>'supportJti' and r.support_digest=b->>'supportDigest' and r.challenge_digest=q02_runtime.hash(b->>'challenge') and r.expires_at>clock_timestamp()) then return false; end if;
 -- An issued support intent must exist; valid offline signatures cannot invent it.
 if not exists(select 1 from public.support_privacy_intents where jti=b->>'supportJti' and tenant=p->>'tenant' and site='support' and subject=b->>'supportSubject' and epoch=(b->>'supportEpoch')::bigint and nonce=b->>'challenge' and consumed_at is null and expires_at>clock_timestamp()) then return false; end if;
 return true;
end $$;
create table q02_runtime.ack_tickets(tenant text,sequence bigint,site text,descriptor jsonb not null,primary key(tenant,sequence,site),foreign key(tenant,sequence) references q02_runtime.events);
alter table q02_runtime.ack_tickets enable row level security;
create trigger immutable_history before update or delete or truncate on q02_runtime.ack_tickets for each statement execute function q02_runtime.immutable();
create function q02_runtime.event_context(t text,sub text,sd text,rd text,nonce text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,q02_runtime as $$
declare a jsonb; sn text:=q02_runtime.site_role(); st q02_runtime.stages; ev q02_runtime.events; h q02_runtime.tenants; d jsonb;
begin
 a:=q02_runtime.site_context(t,sub,sd);
 if rd is null or rd !~ '^[A-Za-z0-9_-]{43}$' or nonce is null or nonce !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'Privacy authorization denied'; end if;
 select * into strict st from q02_runtime.stages where tenant=t and request_digest=rd;
 select * into strict ev from q02_runtime.events where tenant=t and sequence=st.sequence and kind='stage';
 select * into strict h from q02_runtime.tenants where tenant=t;
 if st.binding->>(sn||'Subject') is distinct from sub or st.binding->>(sn||'SessionDigest') is distinct from sd or
 st.binding->>(sn||'Epoch') is distinct from a->'consent'->>'epoch' or a->'consent'->>'active' is distinct from 'true' or
 h.sequence<>ev.sequence or h.head<>ev.digest or h.generation<>ev.generation or
 (st.binding->>'expiresAt')::bigint<=extract(epoch from clock_timestamp()) or exists(select 1 from q02_runtime.suppressions where request_digest=rd) then raise exception 'Privacy authorization denied'; end if;
 d:=jsonb_build_object('v',1,'tenant',t,'site',sn,'subject',sub,'sessionDigest',sd,'requestDigest',rd,'sequence',ev.sequence,'eventDigest',ev.digest,'generation',ev.generation,'headDigest',h.head,'supportEpoch',(st.binding->>'supportEpoch')::bigint,'portalEpoch',(st.binding->>'portalEpoch')::bigint,'nonce',nonce,'exp',(st.binding->>'expiresAt')::bigint);
 insert into q02_runtime.ack_tickets values(t,ev.sequence,sn,d) on conflict do nothing;
 select descriptor into strict d from q02_runtime.ack_tickets where tenant=t and sequence=ev.sequence and site=sn;
 return a||jsonb_build_object('descriptor',d,'peerDescriptor',(select descriptor from q02_runtime.ack_tickets where tenant=t and sequence=ev.sequence and site<>sn));
end $$;
-- Cryptographic verification is mandatory in each dedicated site server, before
-- this call. The coordinator has no execute privilege. Legacy unsigned ACK is
-- removed from runtime grants. Peer ticket alone never records an ACK.
create function q02_runtime.record_signed_ack(t text,sub text,sd text,own jsonb,peer jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,q02_runtime as $$
declare a jsonb; sn text:=q02_runtime.site_role();
begin
 a:=q02_runtime.event_context(t,sub,sd,own->>'requestDigest',own->>'nonce');
 if a->'descriptor' is distinct from own or a->'peerDescriptor' is distinct from peer then raise exception 'ACK binding mismatch'; end if;
 return q02_runtime.ack(t,(own->>'sequence')::bigint,own->>'eventDigest',sub,sd);
end $$;
reset role;
revoke all on function q02_runtime.ack(text,bigint,text,text,text) from q02_support_runtime,q02_portal_runtime;
revoke all on all tables in schema q02_runtime from public,anon,authenticated,service_role,q02_coordinator_runtime,q02_support_runtime,q02_portal_runtime;
grant execute on function q02_runtime.enroll_session(text,text,text,text,text,bigint),q02_runtime.site_command(text,text,text,jsonb),q02_runtime.event_context(text,text,text,text,text),q02_runtime.record_signed_ack(text,text,text,jsonb,jsonb) to q02_support_runtime,q02_portal_runtime;
revoke all on function q02_runtime.receipt_context(text,text,text,text) from q02_support_runtime;
grant execute on function q02_runtime.reserve_receipt(text,text,text,jsonb) to q02_portal_runtime;
commit;
