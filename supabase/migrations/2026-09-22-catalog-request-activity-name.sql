alter table public.catalog_requests
  add column if not exists request_activity_name text not null default 'General Issue';
