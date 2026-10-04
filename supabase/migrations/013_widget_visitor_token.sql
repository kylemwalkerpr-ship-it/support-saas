-- 013: per-conversation visitor token for the public chat widget.
--
-- POST /api/chat/widget mints a random token for each new conversation and
-- stores only its SHA-256 hex digest here. GET /api/chat/widget/[id] and
-- follow-up POSTs must present the raw token (X-Chat-Token) to read or extend
-- the conversation (lib/chat/widgetAuth.mjs). Rows created before this column
-- existed stay NULL and can no longer be opened from the widget; staff still
-- see them through the authenticated support APIs.
--
-- Additive and nullable: safe to apply before the code that writes it.
alter table public.chat_conversations
  add column if not exists visitor_token_hash text;

comment on column public.chat_conversations.visitor_token_hash is
  'SHA-256 hex of the widget visitor token; never the token itself. NULL for pre-token (legacy) conversations.';
