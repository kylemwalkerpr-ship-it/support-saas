-- PostgreSQL 17 native grant regression for migrations 019/020.
-- Run only in a disposable, isolated PostgreSQL cluster after the full Q02 SQL.
-- Never enrolls a tenant, member, credential or signing identity.
begin;
do $$
begin
 if to_regclass('q02_runtime.receipts') is null or
    to_regclass('q02_runtime.ack_tickets') is null or
    to_regprocedure('q02_runtime.site_command(text,text,text,jsonb)') is null or
    to_regprocedure('q02_runtime.enroll_session(text,text,text,text,text,bigint)') is null or
    to_regprocedure('q02_runtime.reserve_receipt(text,text,text,jsonb)') is null then
  raise exception 'Q02 020 schema or functions missing';
 end if;
 if not has_function_privilege('q02_support_runtime','q02_runtime.site_command(text,text,text,jsonb)','execute') or
    not has_function_privilege('q02_portal_runtime','q02_runtime.site_command(text,text,text,jsonb)','execute') or
    not has_function_privilege('q02_portal_runtime','q02_runtime.reserve_receipt(text,text,text,jsonb)','execute') then
  raise exception 'Required dedicated runtime grant missing';
 end if;
 if exists(
  select 1 from unnest(array['anon','authenticated','service_role','q02_coordinator_runtime']) as role_name
  where has_function_privilege(role_name,'q02_runtime.site_command(text,text,text,jsonb)','execute')
     or has_function_privilege(role_name,'q02_runtime.enroll_session(text,text,text,text,text,bigint)','execute')
     or has_function_privilege(role_name,'q02_runtime.record_signed_ack(text,text,text,jsonb,jsonb)','execute')
 ) then
  raise exception 'Unauthorized role can execute Q02 runtime function';
 end if;
 if exists(
  select 1 from unnest(array['anon','authenticated','service_role','q02_support_runtime','q02_coordinator_runtime']) as role_name
  where has_function_privilege(role_name,'q02_runtime.reserve_receipt(text,text,text,jsonb)','execute')
 ) then
  raise exception 'Unauthorized role can reserve Q02 receipt';
 end if;
 if exists(
  select 1 from unnest(array['q02_support_runtime','q02_portal_runtime']) as role_name
  where has_function_privilege(role_name,'q02_runtime.ack(text,bigint,text,text,text)','execute')
 ) then
  raise exception 'Legacy unsigned ACK remains callable';
 end if;
 if (select count(*) from q02_runtime.tenants)<>0 or
    (select count(*) from q02_runtime.credentials)<>0 or
    (select count(*) from public.support_privacy_memberships)<>0 or
    (select count(*) from public.q02_portal_memberships)<>0 then
  raise exception 'Q02 migrations seeded an identity or credential';
 end if;
 if not (select relrowsecurity from pg_class where oid='q02_runtime.receipts'::regclass) then
  raise exception 'Q02 receipt RLS disabled';
 end if;
end $$;
-- A future function must not silently inherit PostgreSQL's PUBLIC EXECUTE
-- global default. This was the migration 019/020 privilege regression.
set local role q02_authority_owner;
create function q02_runtime.q02_acl_probe() returns boolean language sql as $$select true$$;
reset role;
do $$
begin
 if has_function_privilege('anon','q02_runtime.q02_acl_probe()','execute') or
    has_function_privilege('authenticated','q02_runtime.q02_acl_probe()','execute') or
    has_function_privilege('service_role','q02_runtime.q02_acl_probe()','execute') or
    has_function_privilege('q02_coordinator_runtime','q02_runtime.q02_acl_probe()','execute') then
  raise exception 'Q02 function default grants PUBLIC EXECUTE';
 end if;
end $$;
rollback;
