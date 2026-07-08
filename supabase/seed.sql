-- Bootstrap users for a fresh Supabase install.
-- Run this once after schema.sql.

insert into public.users (name, username, password_hash, role, active)
values
  ('Admin', 'admin', encode(digest('admin123', 'sha256'), 'hex'), 'admin', true),
  ('Store Incharge', 'incharge', encode(digest('incharge123', 'sha256'), 'hex'), 'store_incharge', true)
on conflict (username) do update
set
  name = excluded.name,
  password_hash = excluded.password_hash,
  role = excluded.role,
  active = excluded.active,
  updated_at = now();

insert into public.devotees (devotee_code, devotee_name, active)
values
  ('HG NCBP', 'HG NCBP', true),
  ('YDRP', 'YDRP', true),
  ('VKTP', 'VKTP', true),
  ('ABRP', 'ABRP', true),
  ('SRSP', 'SRSP', true),
  ('SYMP', 'SYMP', true),
  ('KKRP', 'KKRP', true),
  ('GPVP', 'GPVP', true),
  ('RVRP', 'RVRP', true),
  ('ADKP', 'ADKP', true),
  ('GDHP', 'GDHP', true),
  ('ISKP', 'ISKP', true),
  ('NVKP', 'NVKP', true),
  ('SDGP', 'SDGP', true),
  ('NTHP', 'NTHP', true),
  ('RMPP', 'RMPP', true),
  ('SJRD', 'SJRD', true),
  ('BDCP', 'BDCP', true),
  ('GVBP', 'GVBP', true),
  ('MKGP', 'MKGP', true)
on conflict (devotee_code) do update
set
  devotee_name = excluded.devotee_name,
  active = excluded.active,
  updated_at = now();
