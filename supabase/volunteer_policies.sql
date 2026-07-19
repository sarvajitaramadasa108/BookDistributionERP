alter table public.volunteer_service_master enable row level security;
alter table public.volunteer_registration_events enable row level security;
alter table public.volunteers enable row level security;

drop policy if exists "volunteer_service_master_all_access" on public.volunteer_service_master;
create policy "volunteer_service_master_all_access"
on public.volunteer_service_master
for all
using (true)
with check (true);

drop policy if exists "volunteer_registration_events_all_access" on public.volunteer_registration_events;
create policy "volunteer_registration_events_all_access"
on public.volunteer_registration_events
for all
using (true)
with check (true);

drop policy if exists "volunteers_all_access" on public.volunteers;
create policy "volunteers_all_access"
on public.volunteers
for all
using (true)
with check (true);
