-- Permissive policies for the app-managed auth flow.
-- Run this after schema.sql if you want the app to manage access itself.

alter table public.users enable row level security;
alter table public.devotees enable row level security;
alter table public.warehouses enable row level security;
alter table public.items enable row level security;
alter table public.activities enable row level security;
alter table public.documents enable row level security;
alter table public.document_lines enable row level security;
alter table public.stock_ledger enable row level security;
alter table public.online_class_registrations enable row level security;
alter table public.user_sessions enable row level security;

drop policy if exists "users_all_access" on public.users;
create policy "users_all_access"
on public.users
for all
using (true)
with check (true);

drop policy if exists "devotees_all_access" on public.devotees;
create policy "devotees_all_access"
on public.devotees
for all
using (true)
with check (true);

drop policy if exists "warehouses_all_access" on public.warehouses;
create policy "warehouses_all_access"
on public.warehouses
for all
using (true)
with check (true);

drop policy if exists "items_all_access" on public.items;
create policy "items_all_access"
on public.items
for all
using (true)
with check (true);

drop policy if exists "activities_all_access" on public.activities;
create policy "activities_all_access"
on public.activities
for all
using (true)
with check (true);

drop policy if exists "documents_all_access" on public.documents;
create policy "documents_all_access"
on public.documents
for all
using (true)
with check (true);

drop policy if exists "document_lines_all_access" on public.document_lines;
create policy "document_lines_all_access"
on public.document_lines
for all
using (true)
with check (true);

drop policy if exists "stock_ledger_all_access" on public.stock_ledger;
create policy "stock_ledger_all_access"
on public.stock_ledger
for all
using (true)
with check (true);

drop policy if exists "online_class_registrations_all_access" on public.online_class_registrations;
create policy "online_class_registrations_all_access"
on public.online_class_registrations
for all
using (true)
with check (true);

drop policy if exists "user_sessions_all_access" on public.user_sessions;
create policy "user_sessions_all_access"
on public.user_sessions
for all
using (true)
with check (true);
