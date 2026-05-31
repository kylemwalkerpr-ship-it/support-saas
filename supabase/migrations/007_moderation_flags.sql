-- ============================================================
-- Yousafe SaaS — Moderation Flags
-- Phase 1 of support staff parity work (2026-05-31)
-- Run after 006_disputes.sql.
-- ============================================================

create table if not exists public.moderation_flags (
  id uuid primary key default gen_random_uuid(),
  flagger_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('gig','message','review','profile')),
  target_id text not null,
  reason text not null,
  category text not null check (category in ('spam','abuse','scam','duplicate','other')),
  status text not null default 'pending' check (status in ('pending','dismissed','actioned')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists moderation_flags_status_created_idx
  on public.moderation_flags (status, created_at desc);

create index if not exists moderation_flags_target_idx
  on public.moderation_flags (target_type, target_id);

create or replace trigger moderation_flags_updated_at
  before update on public.moderation_flags
  for each row execute function public.handle_updated_at();

alter table public.moderation_flags enable row level security;

do $$ begin
  drop policy if exists "allow_service_role" on public.moderation_flags;
  drop policy if exists "moderation_flags_support_or_admin_read" on public.moderation_flags;
  drop policy if exists "moderation_flags_support_or_admin_write" on public.moderation_flags;
exception when others then null;
end $$;

create policy "allow_service_role"
  on public.moderation_flags
  for all
  using (true)
  with check (true);

create policy "moderation_flags_support_or_admin_read"
  on public.moderation_flags
  for select
  to authenticated
  using (public.is_support_or_admin(auth.uid()));

create policy "moderation_flags_support_or_admin_write"
  on public.moderation_flags
  for all
  to authenticated
  using (public.is_support_or_admin(auth.uid()))
  with check (public.is_support_or_admin(auth.uid()));

notify pgrst, 'reload schema';
