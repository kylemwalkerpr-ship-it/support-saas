---
name: Yousafe SaaS Project
description: Fiverr/Upwork-style consultancy platform — order management, 3 roles, Clerk + Supabase
type: project
---

Yousafe is a consultancy SaaS with order management (Fiverr/Upwork-style).

**Stack**: Next.js 16 (App Router), TypeScript, Tailwind v4, Clerk v7, Supabase, shadcn-style UI

**Roles**: client, consultant, admin — stored in Supabase `profiles.role`

**Order lifecycle**: cart → queued → claimed → processing → submitted → approved → delivered

**Routes**:
- `/` landing page
- `/sign-in`, `/sign-up` — Clerk auth
- `/dashboard` — smart redirect by role
- `/onboarding` — role picker for new users
- `/client/*` — client dashboard, services, orders
- `/consultant/*` — consultant dashboard, available orders, my-orders
- `/admin/*` — admin overview, all orders, user management

**Key files**:
- `lib/types.ts` — all TypeScript types
- `lib/actions/orders.ts` — all order server actions
- `lib/actions/profiles.ts` — profile sync and role management
- `lib/supabase/server.ts` — Supabase clients (regular + admin/service role)
- `supabase/schema.sql` — full DB schema to run in Supabase dashboard
- `proxy.ts` — Clerk auth proxy (Next.js 16 renamed middleware → proxy)

**Deploy target**: `dashboard.yousafeconsultancy.com` (subdomain of main site)

**Why:** Next.js 16 renamed `middleware.ts` → `proxy.ts`. Always use `proxy.ts` for auth proxy.
**How to apply:** Always create/edit `proxy.ts`, never `middleware.ts` in this project.
