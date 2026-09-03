-- CANTINHO DO PETISCO — V27
-- Pagamentos presenciais + Pix direto.
-- Pode ser executado sobre a V25/V26: preserva dados e adiciona o campo novo de crédito na maquininha.

create table if not exists public.payment_settings (
  id smallint primary key default 1 check (id = 1),
  pix_direct_enabled boolean not null default false,
  pix_key_type text not null default 'CNPJ',
  pix_key text not null default '',
  pix_receiver_name text not null default '',
  credit_machine_enabled boolean not null default true,
  debit_machine_enabled boolean not null default true,
  cash_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.payment_settings add column if not exists pix_direct_enabled boolean not null default false;
alter table public.payment_settings add column if not exists pix_key_type text not null default 'CNPJ';
alter table public.payment_settings add column if not exists pix_key text not null default '';
alter table public.payment_settings add column if not exists pix_receiver_name text not null default '';
alter table public.payment_settings add column if not exists credit_machine_enabled boolean not null default true;
alter table public.payment_settings add column if not exists debit_machine_enabled boolean not null default true;
alter table public.payment_settings add column if not exists cash_enabled boolean not null default true;
alter table public.payment_settings add column if not exists updated_at timestamptz not null default now();

-- Migração silenciosa da configuração antiga de crédito online, caso a V25/V26 já tenha sido instalada.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='payment_settings' and column_name='credit_online_enabled'
  ) then
    execute 'update public.payment_settings set credit_machine_enabled = credit_online_enabled where id = 1';
  end if;
end $$;

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

select id, pix_direct_enabled, pix_key_type, pix_key, pix_receiver_name,
       credit_machine_enabled, debit_machine_enabled, cash_enabled, updated_at
from public.payment_settings;
