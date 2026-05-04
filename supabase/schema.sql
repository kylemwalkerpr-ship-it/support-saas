-- ============================================================
-- Yousafe SaaS — Full Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Profiles (synced from Clerk)
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique not null,
  email text not null,
  full_name text,
  avatar_url text,
  role text not null default 'client' check (role in ('client', 'consultant', 'admin')),
  bio text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Services / packages
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  price numeric(10,2) not null default 0,
  delivery_days integer not null default 7,
  category text not null default 'general',
  features text[] default '{}',
  is_active boolean default true,
  created_at timestamptz default now() not null
);

-- Order sequence for human-readable numbers
create sequence if not exists order_number_seq start 1000;

-- Orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null default ('ORD-' || extract(year from now())::text || '-' || lpad(nextval('order_number_seq')::text, 5, '0')),
  client_id uuid references public.profiles(id) on delete cascade not null,
  consultant_id uuid references public.profiles(id),
  status text not null default 'cart' check (
    status in ('cart','queued','claimed','processing','submitted','approved','delivered','cancelled')
  ),
  total_amount numeric(10,2) not null default 0,
  requirements text,
  delivery_url text,
  delivery_notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Order line items
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade not null,
  service_id uuid references public.services(id) not null,
  quantity integer not null default 1,
  unit_price numeric(10,2) not null,
  subtotal numeric(10,2) not null,
  created_at timestamptz default now() not null
);

-- Status audit trail
create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade not null,
  from_status text,
  to_status text not null,
  changed_by_id uuid references public.profiles(id) not null,
  note text,
  created_at timestamptz default now() not null
);

-- Notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  message text not null,
  type text not null default 'info' check (type in ('info','success','warning','error')),
  is_read boolean default false not null,
  order_id uuid references public.orders(id),
  created_at timestamptz default now() not null
);

-- auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create or replace trigger orders_updated_at
  before update on public.orders
  for each row execute function public.handle_updated_at();

-- RLS: enabled but all ops allowed via service_role key (server-side only)
alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.notifications enable row level security;

-- Drop and recreate policies to avoid conflicts
do $$ begin
  drop policy if exists "allow_service_role" on public.profiles;
  drop policy if exists "allow_service_role" on public.services;
  drop policy if exists "allow_service_role" on public.orders;
  drop policy if exists "allow_service_role" on public.order_items;
  drop policy if exists "allow_service_role" on public.order_status_history;
  drop policy if exists "allow_service_role" on public.notifications;
exception when others then null;
end $$;

create policy "allow_service_role" on public.profiles for all using (true) with check (true);
create policy "allow_service_role" on public.services for all using (true) with check (true);
create policy "allow_service_role" on public.orders for all using (true) with check (true);
create policy "allow_service_role" on public.order_items for all using (true) with check (true);
create policy "allow_service_role" on public.order_status_history for all using (true) with check (true);
create policy "allow_service_role" on public.notifications for all using (true) with check (true);

-- Services are managed via the admin dashboard — no seed data

-- Support chat tables are defined in supabase/migrations/002_support_chat.sql.
