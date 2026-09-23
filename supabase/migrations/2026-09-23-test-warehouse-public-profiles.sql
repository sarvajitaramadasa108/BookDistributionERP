create table if not exists public.public_request_profiles (
  id uuid primary key default gen_random_uuid(),
  mobile text not null unique,
  name text not null default '',
  age integer,
  category text not null default '',
  preacher_name text not null default '',
  location text not null default '',
  devotee_id uuid references public.devotees(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_public_request_profiles_mobile
on public.public_request_profiles (mobile);

drop trigger if exists trg_public_request_profiles_updated_at on public.public_request_profiles;
create trigger trg_public_request_profiles_updated_at
before update on public.public_request_profiles
for each row execute function public.set_updated_at();

alter table public.public_request_profiles enable row level security;

drop policy if exists "public_request_profiles_all_access" on public.public_request_profiles;
create policy "public_request_profiles_all_access"
on public.public_request_profiles
for all
using (true)
with check (true);

do $$
declare
  test_warehouse_id uuid;
  opening_doc_id uuid;
  next_doc_code text;
begin
  insert into public.warehouses (warehouse_code, warehouse_name, warehouse_type, spoc, mobile, active)
  values ('TEST', 'Test', 'Test', 'System', '', true)
  on conflict (warehouse_code) do update
    set warehouse_name = excluded.warehouse_name,
        warehouse_type = excluded.warehouse_type,
        active = true,
        updated_at = now()
  returning id into test_warehouse_id;

  select id into opening_doc_id
  from public.documents
  where document_type = 'OPENING'
    and to_warehouse_id = test_warehouse_id
    and notes = 'Seed opening stock for Test warehouse'
  limit 1;

  if opening_doc_id is null then
    select 'DOC-' || lpad((coalesce(max(nullif(regexp_replace(document_code, '\D', '', 'g'), '')::int), 0) + 1)::text, 4, '0')
    into next_doc_code
    from public.documents;

    insert into public.documents (document_code, document_type, document_date, to_warehouse_id, status, notes)
    values (next_doc_code, 'OPENING', current_date, test_warehouse_id, 'Posted', 'Seed opening stock for Test warehouse')
    returning id into opening_doc_id;

    insert into public.document_lines (document_id, line_no, item_id, quantity, rate, amount)
    select
      opening_doc_id,
      row_number() over (order by erp_code),
      id,
      20,
      sale_price,
      20 * sale_price
    from public.items
    where active = true
      and item_group in ('BOOK', 'PARAPHERNALIA');

    insert into public.stock_ledger (
      document_id,
      document_line_id,
      ledger_date,
      warehouse_id,
      item_id,
      movement_type,
      quantity_in,
      quantity_out,
      rate,
      amount
    )
    select
      dl.document_id,
      dl.id,
      current_date,
      test_warehouse_id,
      dl.item_id,
      'OPENING',
      dl.quantity,
      0,
      dl.rate,
      dl.amount
    from public.document_lines dl
    where dl.document_id = opening_doc_id;
  end if;
end $$;
