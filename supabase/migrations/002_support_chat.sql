-- ============================================================
-- Yousafe SaaS — Support Chat Operations
-- Run this in Supabase SQL Editor after the base schema.
-- ============================================================

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  visitor_name text,
  visitor_email text,
  visitor_phone text,
  topic text not null default 'general',
  status text not null default 'ai_active' check (
    status in ('ai_active','waiting_for_agent','assigned','resolved','closed')
  ),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to_id uuid references public.profiles(id),
  last_message text,
  last_message_at timestamptz default now() not null,
  requested_agent_at timestamptz,
  resolved_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.chat_conversations(id) on delete cascade not null,
  sender_type text not null check (sender_type in ('visitor','ai','agent','system')),
  sender_id uuid references public.profiles(id),
  sender_name text,
  body text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null
);

create table if not exists public.chat_notifications (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.chat_conversations(id) on delete cascade,
  target_email text not null,
  title text not null,
  message text not null,
  is_read boolean default false not null,
  created_at timestamptz default now() not null
);

create table if not exists public.support_presence (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade not null,
  status text not null default 'available' check (status in ('available','busy','away','offline')),
  active_conversations integer not null default 0,
  last_seen_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(profile_id)
);

create or replace trigger chat_conversations_updated_at
  before update on public.chat_conversations
  for each row execute function public.handle_updated_at();

create or replace trigger support_presence_updated_at
  before update on public.support_presence
  for each row execute function public.handle_updated_at();

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_notifications enable row level security;
alter table public.support_presence enable row level security;

do $$ begin
  drop policy if exists "allow_service_role" on public.chat_conversations;
  drop policy if exists "allow_service_role" on public.chat_messages;
  drop policy if exists "allow_service_role" on public.chat_notifications;
  drop policy if exists "allow_service_role" on public.support_presence;
exception when others then null;
end $$;

create policy "allow_service_role" on public.chat_conversations for all using (true) with check (true);
create policy "allow_service_role" on public.chat_messages for all using (true) with check (true);
create policy "allow_service_role" on public.chat_notifications for all using (true) with check (true);
create policy "allow_service_role" on public.support_presence for all using (true) with check (true);

create index if not exists chat_conversations_status_last_message_idx
  on public.chat_conversations(status, last_message_at desc);

create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages(conversation_id, created_at asc);

create index if not exists chat_notifications_target_idx
  on public.chat_notifications(target_email, is_read, created_at desc);
