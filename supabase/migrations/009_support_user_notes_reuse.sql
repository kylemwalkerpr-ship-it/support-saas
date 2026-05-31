-- ============================================================
-- Yousafe SaaS — Support user notes (audit-log reuse)
-- Phase 2 of support staff parity work (2026-05-31)
-- Run this in Supabase SQL Editor after 008_support_notifications.sql.
-- ============================================================
--
-- DESIGN NOTE (the "pick one" from the brief §3 Phase 2):
--
-- Internal user notes are NOT stored in a dedicated table. Instead they
-- live as rows in public.support_audit_log with:
--   action      = 'note.add'
--   target_type = 'profile'
--   target_id   = <profile.id as text>
--   metadata    = { "body": "<note text>" }
--
-- Reasoning:
--   1. The note surface is thin (free text + author + timestamp). A new
--      table would duplicate columns the audit log already enforces.
--   2. Notes are intrinsically auditable events ("agent X wrote note about
--      user Y at T") — the audit log is the right home.
--   3. RLS, indexes, and the SECURITY DEFINER RPC support_log_action are
--      already in place, so the write path is free.
--   4. Querying via the view below keeps the consumer code readable.
--
-- If a future requirement demands edit/delete on notes (currently disallowed
-- because audit rows are append-only), introduce a real table in a later
-- migration and migrate via a backfill — do not retrofit mutability onto
-- support_audit_log.

create or replace view public.support_user_notes_v as
  select
    id,
    actor_id,
    target_id      as profile_id,
    metadata->>'body' as body,
    reason,
    created_at
  from public.support_audit_log
  where action = 'note.add'
    and target_type = 'profile';

comment on view public.support_user_notes_v is
  'Phase 2: internal support notes on profiles, projected from support_audit_log rows where action=note.add. Append-only.';

grant select on public.support_user_notes_v to authenticated, service_role;

notify pgrst, 'reload schema';
