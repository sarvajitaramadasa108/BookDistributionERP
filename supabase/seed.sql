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
