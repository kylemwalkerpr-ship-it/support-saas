-- ============================================================
-- Yousafe SaaS — Support Audit Log
-- Phase 1 of support staff parity work (2026-05-31)
-- Run this in Supabase SQL Editor after 003_allow_support_role.sql.
-- ============================================================

create table if not exists public.support_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  actor_role text not null check (actor_role in ('support','admin')),
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists support_audit_log_actor_created_idx
  on public.support_audit_log (actor_id, created_at desc);

create index if not exists support_audit_log_target_created_idx
  on public.support_audit_log (target_type, target_id, created_at desc);

create index if not exists support_audit_log_metadata_gin_idx
  on public.support_audit_log using gin (metadata);

alter table public.support_audit_log enable row level security;

do $$ begin
  drop policy if exists "allow_service_role" on public.support_audit_log;
exception when others then null;
end $$;

create policy "allow_service_role"
  on public.support_audit_log
  for all
  using (true)
  with check (true);

-- RPC: support_log_action — inserts an audit entry and returns the row.
-- SECURITY DEFINER so callers (server actions running with anon key) can
-- write without exposing the table directly. Caller must pre-validate role.
create or replace function public.support_log_action(
  actor_id uuid,
  action text,
  target_type text,
  target_id text,
  reason text,
  metadata jsonb
)
returns public.support_audit_log
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_role text;
  inserted public.support_audit_log;
begin
  select p.role into resolved_role
  from public.profiles p
  where p.id = actor_id;

  if resolved_role is null then
    raise exception 'support_log_action: actor profile % not found', actor_id
      using errcode = 'P0002';
  end if;

  if resolved_role not in ('support','admin') then
    raise exception 'support_log_action: actor % has role %, expected support|admin', actor_id, resolved_role
      using errcode = '42501';
  end if;

  insert into public.support_audit_log (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    metadata
  )
  values (
    actor_id,
    resolved_role,
    action,
    target_type,
    target_id,
    reason,
    coalesce(metadata, '{}'::jsonb)
  )
  returning * into inserted;

  return inserted;
end;
$$;

revoke all on function public.support_log_action(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.support_log_action(uuid, text, text, text, text, jsonb)
  to service_role, authenticated;

notify pgrst, 'reload schema';
