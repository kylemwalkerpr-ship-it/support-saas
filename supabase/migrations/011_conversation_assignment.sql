-- ============================================================
-- Yousafe SaaS — Conversation assignment + inbox SLA (Phase 5)
-- Adds inbox shape on top of the existing chat_conversations table
-- from 002_support_chat.sql. Idempotent column adds so reruns are safe.
-- ============================================================

-- assigned_to: separate column from the legacy assigned_to_id (which is left
-- alone for backward compat with the Phase 1 dashboard). The new inbox uses
-- assigned_to exclusively; downstream code can join on it directly.
alter table public.chat_conversations
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

alter table public.chat_conversations
  add column if not exists assigned_at timestamptz;

-- inbox_status: separate from the legacy status enum ('ai_active', etc.) so
-- we don't break existing UI that filters on those values. The inbox is
-- driven by inbox_status; values are 'open' | 'snoozed' | 'resolved'. The
-- legacy `status` column keeps its meaning for the chat-widget routing.
alter table public.chat_conversations
  add column if not exists inbox_status text not null default 'open'
    check (inbox_status in ('open','snoozed','resolved'));

alter table public.chat_conversations
  add column if not exists snoozed_until timestamptz;

-- SLA timestamps. `last_message_at` already exists from 002 (drives queue
-- ordering generally). The SLA timer needs to know specifically when the
-- customer last spoke and when the agent last replied — split these out.
alter table public.chat_conversations
  add column if not exists last_customer_message_at timestamptz;

alter table public.chat_conversations
  add column if not exists last_agent_message_at timestamptz;

-- Index for inbox queries: agent picks "mine, open, oldest customer message".
create index if not exists chat_conversations_inbox_idx
  on public.chat_conversations (assigned_to, inbox_status, last_customer_message_at desc nulls last);

-- Index for queue queries: "unassigned, open, oldest customer message".
create index if not exists chat_conversations_unassigned_open_idx
  on public.chat_conversations (inbox_status, last_customer_message_at desc nulls last)
  where assigned_to is null;

-- Backfill last_customer_message_at from the most recent visitor message
-- so existing conversations show a sensible SLA timer immediately.
update public.chat_conversations c
set last_customer_message_at = sub.last_at
from (
  select conversation_id, max(created_at) as last_at
  from public.chat_messages
  where sender_type = 'visitor'
  group by conversation_id
) sub
where sub.conversation_id = c.id
  and c.last_customer_message_at is null;

-- Same for last_agent_message_at — the boundary between "first response SLA"
-- and "subsequent response SLA" needs to know whether an agent ever replied.
update public.chat_conversations c
set last_agent_message_at = sub.last_at
from (
  select conversation_id, max(created_at) as last_at
  from public.chat_messages
  where sender_type in ('agent','system')
  group by conversation_id
) sub
where sub.conversation_id = c.id
  and c.last_agent_message_at is null;

notify pgrst, 'reload schema';
