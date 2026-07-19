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

create table if not exists public.volunteer_service_master (
  id uuid primary key default gen_random_uuid(),
  serial_no integer not null unique,
  service_name text not null unique,
  coordinator_name text not null default '',
  coordinator_contact_number text not null default '',
  reporting_time text not null default '',
  volunteers_required integer not null default 0,
  coordinator_photo_link text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.volunteer_service_master
  alter column coordinator_photo_link drop not null;

create table if not exists public.volunteer_registration_events (
  id uuid primary key default gen_random_uuid(),
  source_row_no integer not null,
  mobile_number text not null,
  name text,
  gender text not null default '',
  age integer,
  college_working text,
  area_of_stay text,
  allocated_service_name text,
  attendance boolean not null default false,
  tshirt boolean not null default false,
  event_name text,
  source text,
  created_at timestamptz not null default now()
);

alter table public.volunteer_registration_events
  alter column name drop not null,
  alter column gender drop not null,
  alter column college_working drop not null,
  alter column area_of_stay drop not null,
  alter column allocated_service_name drop not null,
  alter column event_name drop not null,
  alter column source drop not null;

create table if not exists public.volunteers (
  id uuid primary key default gen_random_uuid(),
  serial_no integer not null unique,
  mobile_number text not null unique,
  name text,
  gender text,
  age integer,
  college_working text,
  area_of_stay text,
  allocated_service_name text,
  attendance boolean not null default false,
  tshirt boolean not null default false,
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.volunteers
  alter column name drop not null,
  alter column gender drop not null,
  alter column college_working drop not null,
  alter column area_of_stay drop not null,
  alter column allocated_service_name drop not null;

create index if not exists idx_volunteer_registration_events_mobile on public.volunteer_registration_events (mobile_number);
create index if not exists idx_volunteer_registration_events_created_at on public.volunteer_registration_events (created_at desc);
create index if not exists idx_volunteers_mobile on public.volunteers (mobile_number);
create index if not exists idx_volunteers_service on public.volunteers (allocated_service_name);
create index if not exists idx_volunteer_service_master_name on public.volunteer_service_master (service_name);

drop trigger if exists trg_volunteer_service_master_updated_at on public.volunteer_service_master;
create trigger trg_volunteer_service_master_updated_at
before update on public.volunteer_service_master
for each row execute function public.set_updated_at();

drop trigger if exists trg_volunteers_updated_at on public.volunteers;
create trigger trg_volunteers_updated_at
before update on public.volunteers
for each row execute function public.set_updated_at();

create or replace view public.volunteer_profile_view as
select
  v.id,
  v.serial_no,
  v.mobile_number,
  v.name,
  v.gender,
  v.age,
  v.college_working,
  v.area_of_stay,
  v.allocated_service_name,
  s.coordinator_name,
  s.coordinator_contact_number,
  s.reporting_time,
  s.coordinator_photo_link,
  v.attendance,
  v.tshirt,
  v.registered_at,
  v.updated_at
from public.volunteers v
left join public.volunteer_service_master s
  on s.service_name = v.allocated_service_name;

create or replace view public.volunteer_service_summary_view as
select
  s.id,
  s.serial_no,
  s.service_name,
  s.coordinator_name,
  s.coordinator_contact_number,
  s.reporting_time,
  s.volunteers_required,
  s.coordinator_photo_link,
  s.active,
  count(v.id)::integer as allocated_count,
  greatest(s.volunteers_required - count(v.id)::integer, 0) as remaining_count
from public.volunteer_service_master s
left join public.volunteers v
  on v.allocated_service_name = s.service_name
group by
  s.id,
  s.serial_no,
  s.service_name,
  s.coordinator_name,
  s.coordinator_contact_number,
  s.reporting_time,
  s.volunteers_required,
  s.coordinator_photo_link,
  s.active
order by s.serial_no;
