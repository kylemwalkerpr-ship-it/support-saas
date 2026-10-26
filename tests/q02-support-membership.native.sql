-- Run ONLY in a disposable database after 014,015,016. Never production.
begin;
insert into public.support_privacy_deployments(site,tenant,issuance) values('support','test',true);
insert into public.support_privacy_memberships(site,tenant,subject,status,enrollment_reference)
values('support','test','user_native','active','disposable-test');
set local role service_role;
do $$ begin
 if has_table_privilege(current_user,'public.support_privacy_memberships','INSERT') then raise exception 'public provisioning'; end if;
 if has_function_privilege(current_user,'public.support_privacy_transition_internal(text,text,text,text,bigint,text[],text,text,timestamptz,timestamptz)','EXECUTE') then raise exception 'internal bypass'; end if;
 if public.support_privacy_membership('support','other','user_native') is not null then raise exception 'tenant leak'; end if;
 if public.support_privacy_transition('grant','support','test','user_native',0,array['preferences']) <> 1 then raise exception 'grant'; end if;
 begin
 perform public.support_privacy_transition('withdraw','support','test','user_native',0);
 raise exception 'stale accepted';
 exception when raise_exception then if sqlerrm <> 'Privacy authorization denied' then raise; end if; end;
 begin
 perform public.support_privacy_transition('consume','support','test','user_native',1,array['preferences']);
 raise exception 'consume accepted';
 exception when raise_exception then if sqlerrm <> 'Privacy authorization denied' then raise; end if; end;
end $$;
reset role;
update public.support_privacy_memberships set status='suspended';
update public.support_privacy_deployments set issuance=false;
set local role service_role;
do $$ begin
 begin
 perform public.support_privacy_transition('grant','support','test','user_native',1,array['preferences']);
 raise exception 'suspended accepted';
 exception when raise_exception then if sqlerrm <> 'Privacy authorization denied' then raise; end if; end;
 if public.support_privacy_transition('withdraw','support','test','user_native',1) <> 2 then raise exception 'withdraw'; end if;
end $$;
reset role;
update public.support_privacy_memberships set status='revoked';
set local role service_role;
select public.support_privacy_transition('withdraw','support','test','user_native',2);
reset role;
do $$ begin
 begin
 insert into public.support_privacy_memberships(site,tenant,subject,status,enrollment_reference) values('support','test','user_native','active','duplicate');
 raise exception 'duplicate accepted';
 exception when unique_violation then null; end;
end $$;
set local role authenticated;
do $$ begin
 begin
 perform public.support_privacy_membership('support','test','user_native');
 raise exception 'browser RPC accepted';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
