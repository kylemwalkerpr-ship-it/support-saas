-- Loaded only in the harness's newly-created socket-only cluster.
insert into public.support_privacy_deployments(site,tenant,issuance) values('s4','isolated',true);
insert into public.support_privacy_memberships(site,tenant,subject,status,enrollment_reference) values('s4','isolated','user_s4','active','synthetic');
select public.support_privacy_transition('grant','s4','isolated','user_s4',0,array['derived_summary','preferences']);
create function public.s4_bindings() returns jsonb language sql as $$ select jsonb_build_object('support_site','s4','portal_site','portal','tenant','isolated','support_sub','user_s4','portal_sub','user_portal','support_epoch','1','portal_epoch','7','support_jti',repeat('a',43),'receipt_jti',repeat('b',43),'challenge_digest',repeat('c',43),'support_digest',repeat('d',43)) $$;
do $$ declare r text; t text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  foreach t in array array['support_q02_coordinator_denials','support_q02_revocation_outbox','support_q02_revocation_acks'] loop
   if has_table_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'table grant leaked'; end if;
   if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'RLS absent'; end if;
  end loop;
  if r<>'service_role' and has_function_privilege(r,'public.support_q02_coordinate(text,text,jsonb)','EXECUTE') then raise exception 'RPC grant leaked'; end if;
 end loop;
 if has_function_privilege('service_role','public.support_q02_enqueue_suppression()','EXECUTE') then raise exception 'trigger exposed'; end if;
end $$;
set role service_role;
select public.support_q02_coordinate('prepare',repeat('e',43),public.s4_bindings());
select public.support_q02_coordinate('commit',repeat('e',43),public.s4_bindings());
reset role;
do $$ begin
 if (select count(*) from public.support_q02_coordinator_denials)<>1 then raise exception 'dedupe failed'; end if;
 if exists(select 1 from public.support_q02_coordinator_denials where decision<>'DENY') then raise exception 'positive result'; end if;
 begin
  perform public.support_q02_coordinate('commit',repeat('e',43),public.s4_bindings()||'{"tenant":"other"}');
  raise exception 'accepted conflict';
 exception when others then if sqlerrm='accepted conflict' then raise; end if; end;
 begin
  perform public.support_q02_coordinate('prepare',repeat('e',43),public.s4_bindings()||'{"portal_sub":"user_other"}');
  raise exception 'accepted mutation';
 exception when others then if sqlerrm='accepted mutation' then raise; end if; end;
end $$;
-- Withdrawal remains available with issuance disabled and revoked membership.
update public.support_privacy_deployments set issuance=false where site='s4';
update public.support_privacy_memberships set status='revoked' where site='s4';
select public.support_privacy_transition('withdraw','s4','isolated','user_s4',1);
do $$ begin
 if (select count(*) from public.support_q02_revocation_outbox)<>1 then raise exception 'missing compensation'; end if;
 if not exists(select 1 from public.support_q02_revocation_outbox where old_epoch=1 and new_epoch=2 and state='pending') then raise exception 'wrong epoch'; end if;
 if exists(select 1 from public.support_q02_revocation_acks) then raise exception 'false ack'; end if;
end $$;
select public.support_q02_retry(1);
select public.support_q02_retry(1);
do $$ begin
 if (select attempts from public.support_q02_revocation_outbox where event_id=1)<>1 then raise exception 'retry backoff'; end if;
end $$;

-- A transaction rollback must roll back consent and compensation together.
begin;
select public.support_privacy_transition('withdraw','s4','isolated','user_s4',2);
rollback;
do $$ begin
 if (select epoch from public.support_privacy_consents where site='s4')<>2 then raise exception 'rollback epoch'; end if;
 if (select count(*) from public.support_q02_revocation_outbox)<>1 then raise exception 'rollback outbox'; end if;
 begin
  perform public.support_q02_coordinate('prepare',repeat('f',43),public.s4_bindings()||'{"support_sub":"user_missing"}');
  raise exception 'missing enrollment accepted';
 exception when others then if sqlerrm='missing enrollment accepted' then raise; end if; end;
 begin
  perform public.support_q02_coordinate('prepare',repeat('f',43),public.s4_bindings()||'{"support_epoch":null}');
  raise exception 'null epoch accepted';
 exception when others then if sqlerrm='null epoch accepted' then raise; end if; end;
end $$;
