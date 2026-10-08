alter table public.warehouses
  add column if not exists is_default_request_warehouse boolean not null default false;

update public.warehouses
set is_default_request_warehouse = false;

update public.warehouses
set active = false,
    is_default_request_warehouse = false,
    updated_at = now()
where warehouse_code = 'TEST';

update public.warehouses
set active = true,
    is_default_request_warehouse = true,
    updated_at = now()
where warehouse_code = 'WH001';
