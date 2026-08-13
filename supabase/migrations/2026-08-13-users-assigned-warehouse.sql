alter table public.users
  add column if not exists assigned_warehouse_id uuid references public.warehouses(id) on update cascade on delete set null;
