-- HKM Visakhapatnam Book Distribution ERP
-- Supabase schema for a fresh Postgres-backed setup.
-- This schema is intentionally generic enough to support books now and
-- devotional paraphernalia later through the items table.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin', 'store_incharge')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devotees (
  id uuid primary key default gen_random_uuid(),
  devotee_code text not null unique,
  devotee_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  warehouse_code text not null unique,
  warehouse_name text not null,
  warehouse_type text not null default 'Event',
  spoc text not null default '',
  mobile text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  erp_code text not null unique,
  item_name text not null,
  item_group text not null default 'BOOK' check (item_group in ('BOOK', 'PARAPHERNALIA', 'OTHER')),
  item_type text not null default '',
  unit text not null default 'pcs',
  purchase_price numeric(14,2) not null default 0,
  sale_price numeric(14,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  activity_code text not null unique,
  activity_name text not null,
  activity_type text not null,
  devotee_id uuid references public.devotees(id) on update cascade on delete restrict,
  warehouse_id uuid references public.warehouses(id) on update cascade on delete restrict,
  spoc text not null default '',
  status text not null default 'Draft' check (status in ('Draft', 'Running', 'Completed', 'Cancelled')),
  start_date date,
  end_date date,
  settled_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  document_code text not null unique,
  document_type text not null check (
    document_type in (
      'OPENING',
      'ISSUE',
      'COMPLIMENTARY',
      'RECEIVE',
      'PURCHASE',
      'SALE',
      'RETURN',
      'TRANSFER',
      'ADJUSTMENT',
      'UNSETTLED_OPENING'
    )
  ),
  document_date date not null,
  from_warehouse_id uuid references public.warehouses(id) on update cascade on delete restrict,
  to_warehouse_id uuid references public.warehouses(id) on update cascade on delete restrict,
  activity_id uuid references public.activities(id) on update cascade on delete restrict,
  created_by_user_id uuid references public.users(id) on update cascade on delete set null,
  status text not null default 'Posted',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on update cascade on delete cascade,
  line_no integer not null,
  item_id uuid not null references public.items(id) on update cascade on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  rate numeric(14,2) not null default 0,
  amount numeric(14,2) not null default 0,
  line_notes text not null default '',
  created_at timestamptz not null default now(),
  unique (document_id, line_no)
);

create table if not exists public.stock_ledger (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on update cascade on delete cascade,
  document_line_id uuid not null references public.document_lines(id) on update cascade on delete cascade,
  ledger_date date not null,
  warehouse_id uuid references public.warehouses(id) on update cascade on delete restrict,
  activity_id uuid references public.activities(id) on update cascade on delete restrict,
  item_id uuid not null references public.items(id) on update cascade on delete restrict,
  movement_type text not null check (
    movement_type in (
      'OPENING',
      'ISSUE',
      'COMPLIMENTARY',
      'RECEIVE',
      'PURCHASE',
      'SALE',
      'RETURN',
      'TRANSFER_IN',
      'TRANSFER_OUT',
      'ADJUSTMENT',
      'UNSETTLED_OPENING'
    )
  ),
  quantity_in numeric(14,3) not null default 0,
  quantity_out numeric(14,3) not null default 0,
  rate numeric(14,2) not null default 0,
  amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_settlement_payments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on update cascade on delete cascade,
  payment_date date not null default current_date,
  cash_amount numeric(14,2) not null default 0,
  online_amount numeric(14,2) not null default 0,
  notes text not null default '',
  created_by_user_id uuid references public.users(id) on update cascade on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.online_class_registrations (
  id uuid primary key default gen_random_uuid(),
  language text not null default 'English' check (language in ('English', 'Telugu')),
  source_warehouse_id uuid references public.warehouses(id) on update cascade on delete set null,
  source_warehouse_code text not null default '',
  source_warehouse_name text not null default '',
  utm_source text not null default '',
  utm_medium text not null default 'online_classes',
  utm_campaign text not null default '',
  name text not null,
  whatsapp_number text not null,
  age integer,
  occupation text not null default '',
  stay_area text not null default '',
  item_id uuid references public.items(id) on update cascade on delete set null,
  item_erp_code text not null default '',
  item_name text not null default '',
  item_group text not null default 'BOOK',
  interested_in_classes boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamptz not null default now(),
  actor text not null default '',
  action text not null,
  entity text not null,
  entity_id text not null default '',
  details jsonb not null default '{}'::jsonb
);

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on update cascade on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_activities_devotee_id on public.activities (devotee_id);
create index if not exists idx_activities_warehouse_id on public.activities (warehouse_id);
create index if not exists idx_documents_type_date on public.documents (document_type, document_date);
create index if not exists idx_documents_activity_id on public.documents (activity_id);
create index if not exists idx_document_lines_document_id on public.document_lines (document_id);
create index if not exists idx_document_lines_item_id on public.document_lines (item_id);
create index if not exists idx_stock_ledger_warehouse_date on public.stock_ledger (warehouse_id, ledger_date);
create index if not exists idx_stock_ledger_activity_item on public.stock_ledger (activity_id, item_id);
create index if not exists idx_activity_settlement_payments_activity_date on public.activity_settlement_payments (activity_id, payment_date);
create index if not exists idx_user_sessions_user_id on public.user_sessions (user_id);
create index if not exists idx_activity_settlement_payments_created_at on public.activity_settlement_payments (created_at desc);
create index if not exists idx_online_class_registrations_created_at on public.online_class_registrations (created_at desc);
create index if not exists idx_online_class_registrations_warehouse on public.online_class_registrations (source_warehouse_id, created_at desc);
create index if not exists idx_online_class_registrations_item on public.online_class_registrations (item_id);

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists trg_devotees_updated_at on public.devotees;
create trigger trg_devotees_updated_at
before update on public.devotees
for each row execute function public.set_updated_at();

drop trigger if exists trg_warehouses_updated_at on public.warehouses;
create trigger trg_warehouses_updated_at
before update on public.warehouses
for each row execute function public.set_updated_at();

drop trigger if exists trg_items_updated_at on public.items;
create trigger trg_items_updated_at
before update on public.items
for each row execute function public.set_updated_at();

drop trigger if exists trg_activities_updated_at on public.activities;
create trigger trg_activities_updated_at
before update on public.activities
for each row execute function public.set_updated_at();

drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

drop trigger if exists trg_online_class_registrations_updated_at on public.online_class_registrations;
create trigger trg_online_class_registrations_updated_at
before update on public.online_class_registrations
for each row execute function public.set_updated_at();

create or replace view public.books as
select
  id,
  erp_code,
  item_name as book_name,
  item_type as book_type,
  purchase_price,
  sale_price,
  active,
  created_at,
  updated_at
from public.items
where item_group = 'BOOK';

create or replace view public.book_master as
select * from public.books;
