-- UNPROVEN topology: designated support coordinator, DENY-only interfaces.
-- No prepare/commit success, link table, remote freshness or delivery is asserted.
begin;
create table public.support_q02_coordinator_denials (
 request_digest text primary key check (request_digest ~ '^[A-Za-z0-9_-]{43}$'),
 bindings jsonb not null check (jsonb_typeof(bindings)='object'),
 decision text not null default 'DENY' check(decision='DENY'),
 created_at timestamptz not null default clock_timestamp()
);
create table public.support_q02_revocation_outbox (
 event_id bigint generated always as identity primary key,
 request_digest text not null references public.support_q02_coordinator_denials(request_digest),
 site text not null, tenant text not null, subject text not null,
 old_epoch bigint not null check(old_epoch>=0),
 new_epoch bigint not null check(new_epoch>old_epoch),
 purpose text not null default 'account-memory-link-reciprocal' check(purpose='account-memory-link-reciprocal'),
 state text not null default 'pending' check(state='pending'),
 attempts bigint not null default 0 check(attempts>=0),
 next_attempt_at timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default clock_timestamp(),
 unique(request_digest,site,tenant,subject,new_epoch)
);
-- Future authenticated acknowledgments require a separate reviewed migration.
-- This empty schema documents durable event/digest dedupe; no RPC can populate it.
create table public.support_q02_revocation_acks (
 event_id bigint primary key references public.support_q02_revocation_outbox(event_id),
 message_digest text not null unique check(message_digest ~ '^[A-Za-z0-9_-]{43}$'),
 acknowledged_at timestamptz not null default clock_timestamp()
);
alter table public.support_q02_coordinator_denials enable row level security;
alter table public.support_q02_revocation_outbox enable row level security;
alter table public.support_q02_revocation_acks enable row level security;
revoke all on public.support_q02_coordinator_denials,public.support_q02_revocation_outbox,public.support_q02_revocation_acks from public,anon,authenticated,service_role;
revoke all on sequence public.support_q02_revocation_outbox_event_id_seq from public,anon,authenticated,service_role;
-- Service-only trusted-adapter boundary. Even unsigned/incorrect adapter inputs
-- can only record DENY; they never become an authenticated positive proof.
create function public.support_q02_coordinate(p_action text,p_digest text,p_bindings jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare prior jsonb; c public.support_privacy_consents%rowtype;
begin
 if p_action is null or p_action not in ('prepare','commit','deny') or p_digest is null or p_digest !~ '^[A-Za-z0-9_-]{43}$'
   or p_bindings is null or jsonb_typeof(p_bindings)<>'object' or octet_length(p_bindings::text)>2048
   or not (p_bindings ?& array['support_site','portal_site','tenant','support_sub','portal_sub','support_epoch','portal_epoch','support_jti','receipt_jti','challenge_digest','support_digest'])
   or (select count(*) from jsonb_object_keys(p_bindings))<>11
   or exists(select 1 from jsonb_each(p_bindings) where jsonb_typeof(value)<>'string')
   or p_bindings->>'support_site' !~ '^[A-Za-z0-9_-]{1,128}$'
   or p_bindings->>'portal_site' !~ '^[A-Za-z0-9_-]{1,128}$'
   or p_bindings->>'tenant' !~ '^[A-Za-z0-9_-]{1,128}$'
   or p_bindings->>'support_site'=p_bindings->>'portal_site'
   or p_bindings->>'support_sub' !~ '^user_[A-Za-z0-9_-]{1,123}$'
   or p_bindings->>'portal_sub' !~ '^user_[A-Za-z0-9_-]{1,123}$'
   or p_bindings->>'support_epoch' !~ '^[1-9][0-9]{0,14}$'
   or p_bindings->>'portal_epoch' !~ '^[1-9][0-9]{0,14}$'
   or exists(select 1 from unnest(array['support_jti','receipt_jti','challenge_digest','support_digest']) k where p_bindings->>k !~ '^[A-Za-z0-9_-]{43}$')
   or p_bindings->>'support_jti'=p_bindings->>'receipt_jti'
 then raise exception 'Privacy authorization denied'; end if;
 -- Same local lock order as 016. No claim that this locks the portal database.
 if public.support_privacy_membership(p_bindings->>'support_site',p_bindings->>'tenant',p_bindings->>'support_sub') is null then
   raise exception 'Privacy authorization denied'; end if;
 select * into c from public.support_privacy_consents where site=p_bindings->>'support_site' and tenant=p_bindings->>'tenant' and subject=p_bindings->>'support_sub' for update;
 if not found then raise exception 'Privacy authorization denied'; end if;
 insert into public.support_q02_coordinator_denials(request_digest,bindings) values(p_digest,p_bindings) on conflict do nothing;
 select bindings into strict prior from public.support_q02_coordinator_denials where request_digest=p_digest for update;
 if prior<>p_bindings then raise exception 'Privacy authorization denied'; end if;
 -- No reserve/consume CAS is implemented for unproven remote topology.
 return jsonb_build_object('decision','DENY','derivedUse',false,'reason','ATOMIC_AUTHORITY_UNPROVEN');
end $$;
revoke all on function public.support_q02_coordinate(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.support_q02_coordinate(text,text,jsonb) to service_role;
-- Capture compensation work in the SAME local withdrawal transaction. Full pair
-- is retained in immutable denial bindings; no raw sessions/proofs are retained.
create function public.support_q02_enqueue_suppression() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.state='withdrawn' and new.epoch>old.epoch then
 insert into public.support_q02_revocation_outbox(request_digest,site,tenant,subject,old_epoch,new_epoch)
 select request_digest,new.site,new.tenant,new.subject,old.epoch,new.epoch
 from public.support_q02_coordinator_denials where bindings->>'support_site'=new.site and bindings->>'tenant'=new.tenant and bindings->>'support_sub'=new.subject
 on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function public.support_q02_enqueue_suppression() from public,anon,authenticated,service_role;
create trigger support_q02_suppression after update on public.support_privacy_consents for each row execute function public.support_q02_enqueue_suppression();
-- Retry bookkeeping is not delivery/ack. No sender/key/trust provisioned.
create function public.support_q02_retry(p_event bigint) returns text language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 update public.support_q02_revocation_outbox set attempts=attempts+1,next_attempt_at=clock_timestamp()+interval '5 minutes' where event_id=p_event and next_attempt_at<=clock_timestamp();
 return 'DENY';
end $$;
revoke all on function public.support_q02_retry(bigint) from public,anon,authenticated;
grant execute on function public.support_q02_retry(bigint) to service_role;
commit;
