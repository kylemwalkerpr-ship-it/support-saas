-- ============================================================
-- Yousafe SaaS — Disputes
-- Phase 1 of support staff parity work (2026-05-31)
-- Run after 005_support_macros.sql.
--
-- Note: order_id is text (not a FK) because the orders table lives in the
-- portal-owned schema/tenant and we deliberately avoid cross-schema FKs.
-- ============================================================

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  opened_by uuid not null references public.profiles(id) on delete restrict,
  opened_by_role text not null,
  against_id uuid not null references public.profiles(id) on delete restrict,
  against_role text not null,
  reason text not null,
  status text not null default 'open'
    check (status in ('open','triage','resolved_refund','resolved_release','resolved_split','rejected')),
  resolution_notes text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists disputes_status_created_idx
  on public.disputes (status, created_at desc);

create index if not exists disputes_opened_by_idx
  on public.disputes (opened_by);

create index if not exists disputes_against_idx
  on public.disputes (against_id);

create index if not exists disputes_order_idx
  on public.disputes (order_id);

create or replace trigger disputes_updated_at
  before update on public.disputes
  for each row execute function public.handle_updated_at();

alter table public.disputes enable row level security;

do $$ begin
  drop policy if exists "allow_service_role" on public.disputes;
  drop policy if exists "disputes_support_or_admin_read" on public.disputes;
  drop policy if exists "disputes_support_or_admin_write" on public.disputes;
exception when others then null;
end $$;

create policy "allow_service_role"
  on public.disputes
  for all
  using (true)
  with check (true);

create policy "disputes_support_or_admin_read"
  on public.disputes
  for select
  to authenticated
  using (public.is_support_or_admin(auth.uid()));

create policy "disputes_support_or_admin_write"
  on public.disputes
  for all
  to authenticated
  using (public.is_support_or_admin(auth.uid()))
  with check (public.is_support_or_admin(auth.uid()));

notify pgrst, 'reload schema';
