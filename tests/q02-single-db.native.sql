-- Executed ONLY in harness-owned disposable cluster, rollback includes test role.
begin;
create role q02_isolated_executor nologin;
grant usage on schema public to q02_isolated_executor;
grant execute on function public.support_q02_atomic_candidate(jsonb) to q02_isolated_executor;
insert into public.support_privacy_deployments values('support','tenant',1,true);
insert into public.q02_portal_deployments values('portal','tenant','support','https://clerk.test','https://portal.test',true);
insert into public.support_privacy_memberships(site,tenant,subject,status,enrollment_reference) values('support','tenant','user_support','active','synthetic');
insert into public.q02_portal_memberships values('portal','tenant','user_portal','active','synthetic');
insert into public.support_privacy_consents(site,tenant,subject,epoch,state,scopes) values('support','tenant','user_support',1,'active',array['derived_summary','preferences']);
insert into public.q02_portal_consents(site,tenant,subject,epoch,active,scopes) values('portal','tenant','user_portal',3,true,array['derived_summary','preferences']);
insert into public.q02_portal_challenges values(repeat('C',43),'portal','tenant','user_portal',repeat('S',43),3,'support','portal-v7-1',array['derived_summary','preferences'],'account-memory-link-reciprocal',clock_timestamp()+interval '100 seconds','pending');
-- Coherent secondary authority exists only inside this rolled-back disposable fixture.
insert into public.q02_portal_deployments values('portal_other','foreign','support','https://clerk.test','https://portal.test',true);
insert into public.q02_portal_memberships values('portal_other','foreign','user_portal','active','synthetic_foreign');
insert into public.q02_portal_consents(site,tenant,subject,epoch,active,scopes) values('portal_other','foreign','user_portal',3,true,array['derived_summary','preferences']);
do $$
declare p jsonb; result jsonb; k text; n integer;
begin
 foreach k in array array['anon','authenticated','service_role'] loop
 if has_function_privilege(k,'public.support_q02_atomic_candidate(jsonb)','execute') then raise exception 'runtime execute leaked'; end if;
 if has_table_privilege(k,'public.support_q02_atomic_ledger','select,insert,update,delete') then raise exception 'table privilege leaked'; end if;
 end loop;
 if exists(select 1 from pg_class where oid in ('public.support_q02_atomic_ledger'::regclass,'public.support_q02_atomic_replays'::regclass,'public.support_q02_atomic_outbox'::regclass) and not relrowsecurity) then raise exception 'RLS absent'; end if;
 if (select proowner from pg_proc where oid='public.support_q02_atomic_candidate(jsonb)'::regprocedure) <> (select oid from pg_roles where rolname=current_user) then raise exception 'unexpected owner'; end if;
 p:=jsonb_build_object('request_digest',repeat('R',43),'support_sub','user_support','portal_sub','user_portal','support_epoch','1','portal_epoch','3','support_jti',repeat('J',43),'receipt_jti',repeat('K',43),'support_digest',repeat('D',43),'receipt_digest',repeat('E',43),'challenge_digest',repeat('C',43),'session_digest',repeat('S',43),'expires_at',(clock_timestamp()+interval '60 seconds')::text,'support_session_expires_at',(clock_timestamp()+interval '60 seconds')::text,'portal_session_expires_at',(clock_timestamp()+interval '60 seconds')::text);
 -- Each exception subtransaction must leave zero durable reservations.
 foreach k in array array['support_epoch','portal_epoch','session_digest','support_sub','portal_sub','support_jti','receipt_jti','request_digest','support_digest','receipt_digest','expires_at','support_session_expires_at','portal_session_expires_at'] loop
 begin
 perform public.support_q02_atomic_candidate(p||jsonb_build_object(k,case when k like '%expires_at' then '2000-01-01' when k like '%epoch' then '999' when k in ('support_sub','portal_sub') then 'user_missing' when k in ('support_jti','receipt_jti','request_digest','support_digest','receipt_digest') then 'malformed' else repeat('X',43) end));
 raise exception 'negative accepted' using errcode='XX001';
 exception when sqlstate 'XX001' then raise; when others then null; end;
 end loop;
 if exists(select 1 from public.support_q02_atomic_ledger) then raise exception 'partial negative effect'; end if;
 -- Each authority mutation must deny even an otherwise well-formed payload.
 -- The exception subtransaction rolls back ONLY its own synthetic mutation.
 foreach k in array array['suspended','cancelled','foreign_tenant','foreign_party'] loop
 begin
 if k='suspended' then
 update public.support_privacy_memberships set status='suspended' where subject='user_support';
 elsif k='cancelled' then
 update public.q02_portal_challenges set state='cancelled' where digest=repeat('C',43);
 elsif k='foreign_tenant' then
 update public.q02_portal_challenges set site='portal_other', tenant='foreign' where digest=repeat('C',43);
 else
 update public.q02_portal_challenges set support_site='foreign' where digest=repeat('C',43);
 end if;
 perform public.support_q02_atomic_candidate(p);
 raise exception 'authority mutation accepted' using errcode='XX001';
 exception when sqlstate 'XX001' then raise; when others then
 if sqlerrm<>'Atomic authorization denied' then raise; end if;
 end;
 end loop;
 -- Failure after all CAS writes rolls back the entire step.
 begin
 perform public.support_q02_atomic_candidate(p);
 perform 1/0;
 exception when division_by_zero then null; end;
 if exists(select 1 from public.support_q02_atomic_ledger) or exists(select 1 from public.support_q02_atomic_replays) then raise exception 'rollback leaked'; end if;
 set local role q02_isolated_executor;
 result:=public.support_q02_atomic_candidate(p);
 if result->>'replayed'<>'false' or result->>'derivedUse'<>'false' then raise exception 'bad candidate result'; end if;
 result:=public.support_q02_atomic_candidate(p);
 if result->>'replayed'<>'true' then raise exception 'bad retry'; end if;
 reset role;
 -- Same request ID with any altered binding must never become a fresh grant.
 foreach k in array array['support_digest','receipt_digest','support_jti','receipt_jti','session_digest','challenge_digest'] loop
 begin
 perform public.support_q02_atomic_candidate(p||jsonb_build_object(k,repeat('X',43)));
 raise exception 'mutated replay accepted' using errcode='XX001';
 exception when sqlstate 'XX001' then raise; when others then
 if sqlerrm<>'Atomic authorization denied' then raise; end if;
 end;
 end loop;
 select count(*) into n from public.support_q02_atomic_replays;
 if n<>2 then raise exception 'double replay effect'; end if;
 begin
 perform public.support_q02_atomic_candidate(p||jsonb_build_object('request_digest',repeat('Z',43)));
 raise exception 'duplicate accepted' using errcode='XX001';
 exception when sqlstate 'XX001' then raise; when unique_violation then null; end;
 -- Same transaction withdrawal changes epoch AND revokes pair AND enqueues.
 perform public.support_privacy_transition('withdraw','support','tenant','user_support',1);
 if (select state from public.support_q02_atomic_ledger)<>'revoked' or (select count(*) from public.support_q02_atomic_outbox)<>1 then raise exception 'withdrawal not atomic'; end if;
 if (select epoch from public.support_privacy_consents where subject='user_support')<>2 then raise exception 'withdraw epoch'; end if;
 begin
 perform public.support_q02_atomic_candidate(p);
 raise exception 'stale retry accepted' using errcode='XX001';
 exception when sqlstate 'XX001' then raise; when others then null; end;
 -- S6: stale regrant cannot reset a withdrawn epoch. A legitimate new grant
 -- advances to 3, preserves the epoch-2 tombstone and never revives the pair.
 begin
 perform public.support_privacy_transition('grant','support','tenant','user_support',1,array['derived_summary','preferences']);
 raise exception 'stale regrant accepted' using errcode='XX001';
 exception when sqlstate 'XX001' then raise; when others then null; end;
 perform public.support_privacy_transition('grant','support','tenant','user_support',2,array['derived_summary','preferences']);
 if (select epoch from public.support_privacy_consents where subject='user_support')<>3
 or not exists(select 1 from public.support_privacy_outbox where subject='user_support' and epoch=2 and state='withdrawn')
 or (select state from public.support_q02_atomic_ledger)<>'revoked' then raise exception 'withdrawal resurrected'; end if;
 -- Runtime roles cannot rewind persistent epochs or erase tombstones. The DBA
 -- can bypass these controls; that is not a supported restore/reset procedure.
 foreach k in array array['anon','authenticated','service_role'] loop
 execute format('set local role %I',k);
 begin
 update public.support_privacy_consents set epoch=1,state='active',scopes=array['derived_summary','preferences'] where subject='user_support';
 raise exception 'runtime epoch rewind accepted' using errcode='XX001';
 exception when insufficient_privilege then null; end;
 begin
 delete from public.support_privacy_outbox where subject='user_support';
 raise exception 'runtime tombstone delete accepted' using errcode='XX001';
 exception when insufficient_privilege then null; end;
 reset role;
 end loop;
 -- Event digest is a digest of actual pair/event bytes, not an ACK.
 if exists(select 1 from public.support_q02_atomic_outbox where state<>'pending' or length(event_digest)<>64 or event->>'source_table'<>'support_privacy_consents') then raise exception 'bad outbox'; end if;
end $$;
rollback;
