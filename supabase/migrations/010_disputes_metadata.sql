-- ============================================================
-- Yousafe SaaS — Disputes: add metadata jsonb
-- Phase 4 of support staff parity work (2026-05-31)
-- Run after 009_support_user_notes_reuse.sql.
--
-- The triage flow uses dispute.metadata to stash a proposed-but-not-
-- yet-executed decision when a support agent attempts a refund above
-- SUPPORT_REFUND_CAP_CENTS. Admins see the proposal and approve or
-- reject it from the same triage screen.
-- ============================================================

alter table public.disputes
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists disputes_metadata_proposed_idx
  on public.disputes ((metadata->>'proposed_decision'))
  where metadata ? 'proposed_decision';

notify pgrst, 'reload schema';
