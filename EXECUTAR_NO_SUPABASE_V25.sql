-- CANTINHO DO PETISCO — V25
-- Configurações administráveis de pagamento.
-- Execute UMA VEZ no SQL Editor do mesmo projeto Supabase usado pelo site.

create table if not exists public.payment_settings (
  id smallint primary key default 1 check (id = 1),
  infinitepay_enabled boolean not null default false,
  infinitepay_handle text not null default '',
  pix_direct_enabled boolean not null default false,
  pix_key_type text not null default 'CNPJ' check (pix_key_type in ('CNPJ','CPF','Telefone','E-mail','Aleatória')),
  pix_key text not null default '',
  pix_receiver_name text not null default '',
  credit_online_enabled boolean not null default false,
  debit_machine_enabled boolean not null default true,
  cash_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.payment_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.payment_settings enable row level security;

drop policy if exists payment_settings_public_read on public.payment_settings;
create policy payment_settings_public_read
on public.payment_settings
for select
to anon, authenticated
using (id = 1);

drop policy if exists payment_settings_admin_insert on public.payment_settings;
create policy payment_settings_admin_insert
on public.payment_settings
for insert
to authenticated
with check (public.is_admin() and id = 1);

drop policy if exists payment_settings_admin_update on public.payment_settings;
create policy payment_settings_admin_update
on public.payment_settings
for update
to authenticated
using (public.is_admin() and id = 1)
with check (public.is_admin() and id = 1);

drop policy if exists payment_settings_admin_delete on public.payment_settings;
create policy payment_settings_admin_delete
on public.payment_settings
for delete
to authenticated
using (public.is_admin() and id = 1);

grant select on public.payment_settings to anon, authenticated;
grant insert, update, delete on public.payment_settings to authenticated;

select id, infinitepay_enabled, infinitepay_handle, pix_direct_enabled,
       pix_key_type, pix_key, pix_receiver_name, credit_online_enabled,
       debit_machine_enabled, cash_enabled, updated_at
from public.payment_settings;
