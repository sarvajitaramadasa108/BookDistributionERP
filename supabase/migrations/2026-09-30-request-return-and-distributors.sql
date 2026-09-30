alter table public.catalog_requests
  add column if not exists request_kind text not null default 'REQUEST';

alter table public.catalog_requests
  add column if not exists requested_activity_id uuid references public.activities(id) on update cascade on delete set null;

alter table public.catalog_requests
  add column if not exists requested_activity_code text not null default '';

alter table public.catalog_requests
  drop constraint if exists catalog_requests_request_kind_check;

alter table public.catalog_requests
  add constraint catalog_requests_request_kind_check
  check (request_kind in ('REQUEST', 'RETURN'));

create index if not exists idx_catalog_requests_kind
on public.catalog_requests (request_kind, status, created_at desc);

create table if not exists public.request_notifications (
  id uuid primary key default gen_random_uuid(),
  requester_mobile text not null default '',
  request_id uuid references public.catalog_requests(id) on update cascade on delete cascade,
  title text not null default '',
  message text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_request_notifications_mobile
on public.request_notifications (requester_mobile, created_at desc);

alter table public.request_notifications enable row level security;

drop policy if exists "request_notifications_all_access" on public.request_notifications;
create policy "request_notifications_all_access"
on public.request_notifications
for all
using (true)
with check (true);
