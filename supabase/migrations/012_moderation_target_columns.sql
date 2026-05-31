-- ============================================================
-- Yousafe SaaS — Moderation: hidden-content columns on portal-owned tables
-- Phase 7 of support staff parity work (2026-05-31)
-- Run after 011_conversation_assignment.sql.
--
-- Adds is_hidden / hidden_at / hidden_by_actor_id to every portal-owned
-- moderation target table that exists in the public schema:
--   - gigs                  (portal-owned, fiverr_gig_system.sql)
--   - gig_reviews           (portal-owned, fiverr_gig_system.sql)
--   - conversation_messages (portal-owned, unified_conversations.sql) — used
--                           when target_type='message' refers to in-platform DMs
--   - chat_messages         (saas-owned widget chat) — included because the
--                           message target_type can also refer to widget threads
--                           that support agents flag for abuse
--   - profiles              (shared between repos; saas migration 001 owns it)
--
-- Idempotent (`add column if not exists`). Each column add is guarded by a
-- to_regclass() existence check so this migration is safe to run on databases
-- where the portal-owned tables haven't been created yet (e.g. fresh dev DB
-- with only the saas schema applied).
-- ============================================================

-- ─── gigs ────────────────────────────────────────────────────
do $$ begin
  if to_regclass('public.gigs') is not null then
    execute 'alter table public.gigs add column if not exists is_hidden boolean not null default false';
    execute 'alter table public.gigs add column if not exists hidden_at timestamptz';
    execute 'alter table public.gigs add column if not exists hidden_by_actor_id uuid references public.profiles(id) on delete set null';
    execute 'create index if not exists gigs_is_hidden_idx on public.gigs (is_hidden) where is_hidden = true';
  end if;
end $$;

-- ─── gig_reviews ─────────────────────────────────────────────
do $$ begin
  if to_regclass('public.gig_reviews') is not null then
    execute 'alter table public.gig_reviews add column if not exists is_hidden boolean not null default false';
    execute 'alter table public.gig_reviews add column if not exists hidden_at timestamptz';
    execute 'alter table public.gig_reviews add column if not exists hidden_by_actor_id uuid references public.profiles(id) on delete set null';
    execute 'create index if not exists gig_reviews_is_hidden_idx on public.gig_reviews (is_hidden) where is_hidden = true';
  end if;
end $$;

-- ─── conversation_messages (portal in-platform DMs) ──────────
do $$ begin
  if to_regclass('public.conversation_messages') is not null then
    execute 'alter table public.conversation_messages add column if not exists is_hidden boolean not null default false';
    execute 'alter table public.conversation_messages add column if not exists hidden_at timestamptz';
    execute 'alter table public.conversation_messages add column if not exists hidden_by_actor_id uuid references public.profiles(id) on delete set null';
    execute 'create index if not exists conversation_messages_is_hidden_idx on public.conversation_messages (is_hidden) where is_hidden = true';
  end if;
end $$;

-- ─── chat_messages (saas widget chat) ────────────────────────
do $$ begin
  if to_regclass('public.chat_messages') is not null then
    execute 'alter table public.chat_messages add column if not exists is_hidden boolean not null default false';
    execute 'alter table public.chat_messages add column if not exists hidden_at timestamptz';
    execute 'alter table public.chat_messages add column if not exists hidden_by_actor_id uuid references public.profiles(id) on delete set null';
    execute 'create index if not exists chat_messages_is_hidden_idx on public.chat_messages (is_hidden) where is_hidden = true';
  end if;
end $$;

-- ─── profiles ────────────────────────────────────────────────
do $$ begin
  if to_regclass('public.profiles') is not null then
    execute 'alter table public.profiles add column if not exists is_hidden boolean not null default false';
    execute 'alter table public.profiles add column if not exists hidden_at timestamptz';
    execute 'alter table public.profiles add column if not exists hidden_by_actor_id uuid references public.profiles(id) on delete set null';
    execute 'create index if not exists profiles_is_hidden_idx on public.profiles (is_hidden) where is_hidden = true';
  end if;
end $$;

notify pgrst, 'reload schema';
