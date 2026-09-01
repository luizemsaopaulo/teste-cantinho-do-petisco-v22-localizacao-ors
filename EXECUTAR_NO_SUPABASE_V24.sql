-- Cantinho do Petisco — V24
-- Configurações administráveis do Delivery. Execute UMA VEZ no SQL Editor do Supabase.

create table if not exists public.delivery_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  enforce_business_hours boolean not null default false,
  max_distance_km numeric(8,2) not null default 3 check (max_distance_km > 0),
  minimum_order_value numeric(10,2),
  free_delivery_over numeric(10,2),
  estimated_minutes_min integer,
  estimated_minutes_max integer,
  blocked_districts text[] not null default '{}',
  tiers jsonb not null default '[{"up_to_km":3,"fee":5}]'::jsonb,
  business_hours jsonb not null default '{"0":{"enabled":true,"open":"11:00","close":"22:00"},"1":{"enabled":true,"open":"11:00","close":"22:00"},"2":{"enabled":true,"open":"11:00","close":"22:00"},"3":{"enabled":true,"open":"11:00","close":"22:00"},"4":{"enabled":true,"open":"11:00","close":"22:00"},"5":{"enabled":true,"open":"11:00","close":"22:00"},"6":{"enabled":true,"open":"11:00","close":"22:00"}}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint delivery_settings_nonnegative check (
    (minimum_order_value is null or minimum_order_value >= 0) and
    (free_delivery_over is null or free_delivery_over >= 0) and
    (estimated_minutes_min is null or estimated_minutes_min >= 0) and
    (estimated_minutes_max is null or estimated_minutes_max >= 0) and
    (estimated_minutes_min is null or estimated_minutes_max is null or estimated_minutes_max >= estimated_minutes_min)
  )
);

insert into public.delivery_settings (id) values (1) on conflict (id) do nothing;

alter table public.delivery_settings enable row level security;

drop policy if exists delivery_settings_public_read on public.delivery_settings;
create policy delivery_settings_public_read on public.delivery_settings for select using (true);

drop policy if exists delivery_settings_admin_insert on public.delivery_settings;
create policy delivery_settings_admin_insert on public.delivery_settings for insert to authenticated with check (public.is_admin());

drop policy if exists delivery_settings_admin_update on public.delivery_settings;
create policy delivery_settings_admin_update on public.delivery_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists delivery_settings_admin_delete on public.delivery_settings;
create policy delivery_settings_admin_delete on public.delivery_settings for delete to authenticated using (public.is_admin());

grant select on public.delivery_settings to anon, authenticated;
grant insert, update, delete on public.delivery_settings to authenticated;
