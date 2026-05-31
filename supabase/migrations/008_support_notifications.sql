-- ============================================================
-- Yousafe SaaS — Support Notifications
-- Phase 1 of support staff parity work (2026-05-31)
-- Run after 007_moderation_flags.sql.
-- ============================================================

create table if not exists public.support_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  subject_type text,
  subject_id text,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists support_notifications_recipient_idx
  on public.support_notifications (recipient_id, read_at, created_at desc);

alter table public.support_notifications enable row level security;

do $$ begin
  drop policy if exists "allow_service_role" on public.support_notifications;
  drop policy if exists "support_notifications_recipient_or_admin_read" on public.support_notifications;
  drop policy if exists "support_notifications_recipient_mark_read" on public.support_notifications;
exception when others then null;
end $$;

create policy "allow_service_role"
  on public.support_notifications
  for all
  using (true)
  with check (true);

-- Recipient OR admin can read.
create policy "support_notifications_recipient_or_admin_read"
  on public.support_notifications
  for select
  to authenticated
  using (
    recipient_id = auth.uid()
    or public.is_admin(auth.uid())
  );

-- Recipient OR admin can mark-read (update); inserts gated via SECURITY DEFINER RPC below.
create policy "support_notifications_recipient_mark_read"
  on public.support_notifications
  for update
  to authenticated
  using (
    recipient_id = auth.uid()
    or public.is_admin(auth.uid())
  )
  with check (
    recipient_id = auth.uid()
    or public.is_admin(auth.uid())
  );

-- RPC: support_notify — server-side insert helper for system-generated
-- notifications. SECURITY DEFINER so server actions can fan out without
-- granting blanket insert rights to authenticated.
create or replace function public.support_notify(
  recipient_id uuid,
  type text,
  subject_type text,
  subject_id text,
  title text,
  body text
)
returns public.support_notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted public.support_notifications;
begin
  if recipient_id is null then
    raise exception 'support_notify: recipient_id required'
      using errcode = '22023';
  end if;

  insert into public.support_notifications (
    recipient_id,
    type,
    subject_type,
    subject_id,
    title,
    body
  )
  values (
    recipient_id,
    type,
    subject_type,
    subject_id,
    title,
    body
  )
  returning * into inserted;

  return inserted;
end;
$$;

revoke all on function public.support_notify(uuid, text, text, text, text, text) from public;
grant execute on function public.support_notify(uuid, text, text, text, text, text)
  to service_role, authenticated;

notify pgrst, 'reload schema';
