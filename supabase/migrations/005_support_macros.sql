-- ============================================================
-- Yousafe SaaS — Support Macros (canned replies)
-- Phase 1 of support staff parity work (2026-05-31)
-- Run after 004_support_audit_log.sql.
-- ============================================================

-- Helper: is_support_or_admin(profile_id) — used by RLS policies in this and
-- later migrations. SECURITY DEFINER so the policy check can read profiles
-- regardless of the caller's row-level visibility.
create or replace function public.is_support_or_admin(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = profile_id
      and p.role in ('support','admin')
  );
$$;

revoke all on function public.is_support_or_admin(uuid) from public;
grant execute on function public.is_support_or_admin(uuid)
  to service_role, authenticated;

-- Helper: is_admin(profile_id) — narrower variant for owner-or-admin writes.
create or replace function public.is_admin(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = profile_id
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid)
  to service_role, authenticated;

create table if not exists public.support_macros (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  body text not null,
  tags text[] not null default '{}',
  language text not null default 'en',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_macros_owner_idx
  on public.support_macros (owner_id, created_at desc);

create index if not exists support_macros_language_idx
  on public.support_macros (language, is_archived);

create index if not exists support_macros_tags_gin_idx
  on public.support_macros using gin (tags);

create or replace trigger support_macros_updated_at
  before update on public.support_macros
  for each row execute function public.handle_updated_at();

alter table public.support_macros enable row level security;

do $$ begin
  drop policy if exists "allow_service_role" on public.support_macros;
  drop policy if exists "support_macros_read" on public.support_macros;
  drop policy if exists "support_macros_write_owner_or_admin" on public.support_macros;
exception when others then null;
end $$;

create policy "allow_service_role"
  on public.support_macros
  for all
  using (true)
  with check (true);

-- Authenticated support|admin can read team-wide (owner_id is null) OR their own macros.
create policy "support_macros_read"
  on public.support_macros
  for select
  to authenticated
  using (
    public.is_support_or_admin(auth.uid())
    and (owner_id is null or owner_id = auth.uid())
  );

-- Owner OR admin can insert/update/delete. Team-wide rows (owner_id is null) are admin-only.
create policy "support_macros_write_owner_or_admin"
  on public.support_macros
  for all
  to authenticated
  using (
    public.is_admin(auth.uid())
    or (owner_id is not null and owner_id = auth.uid())
  )
  with check (
    public.is_admin(auth.uid())
    or (owner_id is not null and owner_id = auth.uid())
  );

notify pgrst, 'reload schema';
