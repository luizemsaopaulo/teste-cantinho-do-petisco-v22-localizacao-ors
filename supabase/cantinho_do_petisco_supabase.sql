-- ============================================================
-- CANTINHO DO PETISCO - SUPABASE
-- Banco para cardápio público + painel administrativo
-- Segurança: RLS + lista privada de administradores
-- Execute no Supabase > SQL Editor.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) ÁREA PRIVADA: administradores
-- ------------------------------------------------------------
create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table if not exists private.app_admins (
    user_id uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

alter table private.app_admins enable row level security;

-- A aplicação nunca recebe acesso direto a private.app_admins.
-- Esta função retorna apenas true/false para usuários autenticados.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from private.app_admins a
        where a.user_id = (select auth.uid())
    );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ------------------------------------------------------------
-- 2) FUNÇÃO DE updated_at
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- ------------------------------------------------------------
-- 3) CATEGORIAS
-- ------------------------------------------------------------
create table if not exists public.categories (
    id uuid primary key default gen_random_uuid(),
    name text not null check (length(btrim(name)) between 1 and 100),
    slug text not null unique
        check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    description text,
    sort_order integer not null default 0 check (sort_order >= 0),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 4) PRODUTOS
-- ------------------------------------------------------------
create table if not exists public.products (
    id uuid primary key default gen_random_uuid(),
    category_id uuid not null
        references public.categories(id)
        on update cascade
        on delete restrict,

    name text not null check (length(btrim(name)) between 1 and 160),
    slug text not null
        check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),

    size text check (size is null or length(size) <= 20),
    description text,

    price numeric(10,2)
        check (price is null or price >= 0),

    image_path text,

    active boolean not null default true,
    available boolean not null default true,
    featured boolean not null default false,
    sort_order integer not null default 0 check (sort_order >= 0),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint products_category_slug_unique unique (category_id, slug)
);

create index if not exists products_category_idx
    on public.products(category_id);

create index if not exists products_public_menu_idx
    on public.products(category_id, active, sort_order);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 5) PRATO DO DIA
-- Um ou mais pratos por dia da semana. 0=domingo ... 6=sábado.
-- special_price é opcional.
-- ------------------------------------------------------------
create table if not exists public.daily_specials (
    id uuid primary key default gen_random_uuid(),
    weekday smallint not null
        check (weekday between 0 and 6),
    product_id uuid not null
        references public.products(id)
        on update cascade
        on delete cascade,
    special_price numeric(10,2)
        check (special_price is null or special_price >= 0),
    note text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists daily_specials_weekday_product_unique_idx
    on public.daily_specials(weekday, product_id);

create index if not exists daily_specials_weekday_idx
    on public.daily_specials(weekday, active);

drop trigger if exists daily_specials_set_updated_at on public.daily_specials;
create trigger daily_specials_set_updated_at
before update on public.daily_specials
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 6) RLS
-- ------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.daily_specials enable row level security;

-- Remove políticas com estes nomes caso o script seja executado novamente.
drop policy if exists categories_public_read on public.categories;
drop policy if exists categories_admin_read on public.categories;
drop policy if exists categories_admin_insert on public.categories;
drop policy if exists categories_admin_update on public.categories;
drop policy if exists categories_admin_delete on public.categories;

drop policy if exists products_public_read on public.products;
drop policy if exists products_admin_read on public.products;
drop policy if exists products_admin_insert on public.products;
drop policy if exists products_admin_update on public.products;
drop policy if exists products_admin_delete on public.products;

drop policy if exists daily_specials_public_read on public.daily_specials;
drop policy if exists daily_specials_admin_read on public.daily_specials;
drop policy if exists daily_specials_admin_insert on public.daily_specials;
drop policy if exists daily_specials_admin_update on public.daily_specials;
drop policy if exists daily_specials_admin_delete on public.daily_specials;

-- Público: lê apenas categorias ativas.
create policy categories_public_read
on public.categories
for select
to anon, authenticated
using (active = true);

-- ADM: pode enxergar também categorias inativas.
create policy categories_admin_read
on public.categories
for select
to authenticated
using ((select public.is_admin()));

create policy categories_admin_insert
on public.categories
for insert
to authenticated
with check ((select public.is_admin()));

create policy categories_admin_update
on public.categories
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy categories_admin_delete
on public.categories
for delete
to authenticated
using ((select public.is_admin()));

-- Público: lê apenas produtos publicados.
-- available pode ser usado pelo site para mostrar "indisponível".
create policy products_public_read
on public.products
for select
to anon, authenticated
using (active = true);

-- ADM: acesso total aos produtos.
create policy products_admin_read
on public.products
for select
to authenticated
using ((select public.is_admin()));

create policy products_admin_insert
on public.products
for insert
to authenticated
with check ((select public.is_admin()));

create policy products_admin_update
on public.products
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy products_admin_delete
on public.products
for delete
to authenticated
using ((select public.is_admin()));

-- Público: lê pratos do dia publicados.
create policy daily_specials_public_read
on public.daily_specials
for select
to anon, authenticated
using (active = true);

-- ADM: acesso total ao prato do dia.
create policy daily_specials_admin_read
on public.daily_specials
for select
to authenticated
using ((select public.is_admin()));

create policy daily_specials_admin_insert
on public.daily_specials
for insert
to authenticated
with check ((select public.is_admin()));

create policy daily_specials_admin_update
on public.daily_specials
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy daily_specials_admin_delete
on public.daily_specials
for delete
to authenticated
using ((select public.is_admin()));

-- ------------------------------------------------------------
-- 7) GRANTS
-- Grants + RLS: as duas camadas precisam permitir a operação.
-- ------------------------------------------------------------
revoke all on public.categories from anon, authenticated;
revoke all on public.products from anon, authenticated;
revoke all on public.daily_specials from anon, authenticated;

grant select on public.categories to anon, authenticated;
grant select on public.products to anon, authenticated;
grant select on public.daily_specials to anon, authenticated;

grant insert, update, delete on public.categories to authenticated;
grant insert, update, delete on public.products to authenticated;
grant insert, update, delete on public.daily_specials to authenticated;

-- ------------------------------------------------------------
-- 8) STORAGE - políticas para bucket "product-images"
-- Crie o bucket no Dashboard > Storage com esse nome.
-- As imagens do cardápio podem ser públicas; escrita só para ADM.
-- ------------------------------------------------------------
drop policy if exists product_images_public_select on storage.objects;
drop policy if exists product_images_admin_insert on storage.objects;
drop policy if exists product_images_admin_update on storage.objects;
drop policy if exists product_images_admin_delete on storage.objects;

create policy product_images_public_select
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'product-images');

create policy product_images_admin_insert
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'product-images'
    and (select public.is_admin())
);

create policy product_images_admin_update
on storage.objects
for update
to authenticated
using (
    bucket_id = 'product-images'
    and (select public.is_admin())
)
with check (
    bucket_id = 'product-images'
    and (select public.is_admin())
);

create policy product_images_admin_delete
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'product-images'
    and (select public.is_admin())
);

-- ------------------------------------------------------------
-- 9) CATEGORIAS INICIAIS
-- ------------------------------------------------------------
insert into public.categories (name, slug, description, sort_order)
values
('Marmitas', 'marmitas', 'Marmitas P, M e G.', 1),
('Porções', 'porcoes', NULL, 2),
('Pratos Executivos', 'pratos-executivos', 'Acompanham arroz, feijão, fritas e farofa.', 3),
('Pratos Especiais', 'pratos-especiais', 'Acompanham arroz e fritas.', 4),
('Massas', 'massas', 'Acompanham arroz e fritas.', 5),
('Refrigerantes', 'refrigerantes', NULL, 6),
('Sucos', 'sucos', NULL, 7),
('Cervejas', 'cervejas', NULL, 8),
('Bebidas alcoólicas', 'bebidas-alcoolicas', NULL, 9)
on conflict (slug) do nothing;

-- ------------------------------------------------------------
-- 10) PRODUTOS DO ARQUIVO
-- Duplicatas de marmitas foram consolidadas.
-- Itens sem preço ficam active=false até o ADM informar o valor.
-- ------------------------------------------------------------
with seed (
    category_slug,
    name,
    slug,
    size,
    price,
    description,
    sort_order,
    active
) as (
    values
('marmitas', 'Isca de tilápia', 'isca-de-tilapia-p', 'P', 16.99, NULL, 1, true),
('marmitas', 'Calabresa acebolada', 'calabresa-acebolada-p', 'P', 16.99, NULL, 2, true),
('marmitas', 'Filé de frango à milanesa', 'file-de-frango-a-milanesa-p', 'P', 16.99, NULL, 3, true),
('marmitas', 'Frango grelhado', 'frango-grelhado-p', 'P', NULL, 'Preço não informado no arquivo.', 4, false),
('marmitas', 'Linguiça toscana', 'linguica-toscana-p', 'P', 16.99, NULL, 5, true),
('marmitas', 'Bisteca de porco', 'bisteca-de-porco-p', 'P', 16.99, NULL, 6, true),
('marmitas', 'Carne de panela', 'carne-de-panela-p', 'P', 16.99, NULL, 7, true),
('marmitas', 'Strogonoff de frango', 'strogonoff-de-frango-p', 'P', NULL, 'Preço não informado no arquivo.', 8, false),
('marmitas', 'Carne seca acebolada', 'carne-seca-acebolada-p', 'P', 19.99, NULL, 9, true),
('marmitas', 'Costelinha', 'costelinha-p', 'P', 19.99, NULL, 10, true),
('marmitas', 'Parmegiana de frango', 'parmegiana-de-frango-p', 'P', 24.99, NULL, 11, true),
('marmitas', 'Filé de frango c/ creme de milho', 'file-de-frango-creme-de-milho-p', 'P', 24.99, NULL, 12, true),
('marmitas', 'Feijoada', 'feijoada-m', 'M', 24.99, NULL, 13, true),
('marmitas', 'Isca de tilápia', 'isca-de-tilapia-g', 'G', 19.99, NULL, 14, true),
('marmitas', 'Calabresa acebolada', 'calabresa-acebolada-g', 'G', 19.99, NULL, 15, true),
('marmitas', 'Filé de frango à milanesa', 'file-de-frango-a-milanesa-g', 'G', 19.99, NULL, 16, true),
('marmitas', 'Linguiça toscana', 'linguica-toscana-g', 'G', 19.99, NULL, 17, true),
('marmitas', 'Bisteca de porco', 'bisteca-de-porco-g', 'G', 19.99, NULL, 18, true),
('marmitas', 'Carne de panela', 'carne-de-panela-g', 'G', 19.99, NULL, 19, true),
('marmitas', 'Tilápia grelhada', 'tilapia-grelhada-g', 'G', 21.99, NULL, 20, true),
('marmitas', 'Costelinha', 'costelinha-g', 'G', 24.99, NULL, 21, true),
('marmitas', 'Filé de frango c/ creme de milho', 'file-de-frango-creme-de-milho-g', 'G', 29.99, NULL, 22, true),
('marmitas', 'Carne seca acebolada', 'carne-seca-acebolada-g', 'G', 24.99, NULL, 23, true),
('marmitas', 'Lasanha à bolonhesa', 'lasanha-a-bolonhesa-g', 'G', 24.99, NULL, 24, true),
('marmitas', 'Bife acebolado', 'bife-acebolado-g', 'G', 25.00, NULL, 25, true),
('marmitas', 'Bife empanado', 'bife-empanado-g', 'G', 27.99, NULL, 26, true),
('marmitas', 'Bife a cavalo', 'bife-a-cavalo-g', 'G', 27.99, NULL, 27, true),
('marmitas', 'Feijoada', 'feijoada-g', 'G', 29.99, NULL, 28, true),
('marmitas', 'Nhoque recheado', 'nhoque-recheado-g', 'G', 29.99, NULL, 29, true),
('marmitas', 'Parmegiana de berinjela', 'parmegiana-de-berinjela-g', 'G', 29.99, NULL, 30, true),
('marmitas', 'Parmegiana de frango', 'parmegiana-de-frango-g', 'G', 29.99, NULL, 31, true),
('marmitas', 'Parmegiana de tilápia', 'parmegiana-de-tilapia-g', 'G', 34.99, NULL, 32, true),
('marmitas', 'Parmegiana de carne', 'parmegiana-de-carne-g', 'G', 34.99, NULL, 33, true),
('marmitas', 'Parmegiana de truta', 'parmegiana-de-truta-g', 'G', 44.99, NULL, 34, true),
('marmitas', 'Truta grelhada', 'truta-grelhada-g', 'G', 39.99, NULL, 35, true),
('marmitas', 'Salmão grelhado', 'salmao-grelhado-g', 'G', 44.99, NULL, 36, true),
('porcoes', 'Isca de tilápia 500gr', 'isca-de-tilapia-500g', NULL, 55.99, NULL, 1, true),
('porcoes', 'Isca de truta 400gr', 'isca-de-truta-400g', NULL, 59.99, NULL, 2, true),
('porcoes', 'Camarão alho e óleo/empanado', 'camarao-alho-oleo-empanado', NULL, 69.99, NULL, 3, true),
('porcoes', 'Mandioca 400gr', 'mandioca-400g', NULL, 24.99, NULL, 4, true),
('porcoes', 'Batata frita simples 400gr', 'batata-frita-simples-400g', NULL, 29.99, NULL, 5, true),
('porcoes', 'Batata frita cheddar e bacon 400gr', 'batata-frita-cheddar-bacon-400g', NULL, 34.99, NULL, 6, true),
('porcoes', 'Carne seca acebolada 400gr', 'carne-seca-acebolada-400g', NULL, 64.99, NULL, 7, true),
('porcoes', 'Contra filé acebolado 400gr', 'contra-file-acebolado-400g', NULL, 64.99, NULL, 8, true),
('porcoes', 'Costelinha de porco 400gr', 'costelinha-de-porco-400g', NULL, 49.99, NULL, 9, true),
('porcoes', 'Calabresa acebolada 400gr', 'calabresa-acebolada-400g', NULL, 39.99, NULL, 10, true),
('porcoes', 'Calabresa acebolada e batata frita', 'calabresa-acebolada-e-batata-frita', NULL, 39.99, NULL, 11, true),
('porcoes', 'Frango a passarinho', 'frango-a-passarinho', NULL, 44.99, NULL, 12, true),
('porcoes', 'Kibe recheado', 'kibe-recheado', NULL, 39.99, NULL, 13, true),
('porcoes', 'Salgado misto 25 un', 'salgado-misto-25-un', NULL, 39.99, NULL, 14, true),
('pratos-executivos', 'Salmão grelhado', 'salmao-grelhado', NULL, 44.99, 'Acompanha arroz, feijão, fritas e farofa.', 1, true),
('pratos-executivos', 'Truta grelhada', 'truta-grelhada', NULL, 44.99, 'Acompanha arroz, feijão, fritas e farofa.', 2, true),
('pratos-executivos', 'Camarão empanado', 'camarao-empanado', NULL, 44.99, 'Acompanha arroz, feijão, fritas e farofa.', 3, true),
('pratos-executivos', 'Bife a cavalo (ovo)', 'bife-a-cavalo-ovo', NULL, 34.99, 'Acompanha arroz, feijão, fritas e farofa.', 4, true),
('pratos-executivos', 'Bife acebolado', 'bife-acebolado', NULL, 34.99, 'Acompanha arroz, feijão, fritas e farofa.', 5, true),
('pratos-executivos', 'Feijoada', 'feijoada', NULL, 34.99, 'Acompanha arroz, feijão, fritas e farofa.', 6, true),
('pratos-executivos', 'Carne de panela', 'carne-de-panela', NULL, 29.99, 'Acompanha arroz, feijão, fritas e farofa.', 7, true),
('pratos-executivos', 'Strogonoff de frango', 'strogonoff-de-frango', NULL, 29.99, 'Acompanha arroz, feijão, fritas e farofa.', 8, true),
('pratos-executivos', 'Strogonoff de carne', 'strogonoff-de-carne', NULL, 34.99, 'Acompanha arroz, feijão, fritas e farofa.', 9, true),
('pratos-executivos', 'Arroz carreteiro', 'arroz-carreteiro', NULL, 34.99, 'Acompanha arroz, feijão, fritas e farofa.', 10, true),
('pratos-executivos', 'Carne seca acebolada', 'carne-seca-acebolada', NULL, 34.99, 'Acompanha arroz, feijão, fritas e farofa.', 11, true),
('pratos-executivos', 'Costelinha de tambaqui', 'costelinha-de-tambaqui', NULL, 34.99, 'Acompanha arroz, feijão, fritas e farofa.', 12, true),
('pratos-executivos', 'Costelinha de porco', 'costelinha-de-porco', NULL, 29.99, 'Acompanha arroz, feijão, fritas e farofa.', 13, true),
('pratos-executivos', 'Tilápia empanada isca', 'tilapia-empanada-isca', NULL, 34.99, 'Acompanha arroz, feijão, fritas e farofa.', 14, true),
('pratos-executivos', 'Tilápia grelhada', 'tilapia-grelhada', NULL, 29.99, 'Acompanha arroz, feijão, fritas e farofa.', 15, true),
('pratos-executivos', 'Bisteca', 'bisteca', NULL, 24.99, 'Acompanha arroz, feijão, fritas e farofa.', 16, true),
('pratos-executivos', 'Linguiça Toscana', 'linguica-toscana', NULL, 24.99, 'Acompanha arroz, feijão, fritas e farofa.', 17, true),
('pratos-executivos', 'Calabresa acebolada', 'calabresa-acebolada', NULL, 24.99, 'Acompanha arroz, feijão, fritas e farofa.', 18, true),
('pratos-executivos', 'Frango empanado c/ creme de milho', 'frango-empanado-creme-de-milho', NULL, 34.99, 'Acompanha arroz, feijão, fritas e farofa.', 19, true),
('pratos-executivos', 'Frango empanado', 'frango-empanado', NULL, 24.99, 'Acompanha arroz, feijão, fritas e farofa.', 20, true),
('pratos-executivos', 'Frango grelhado', 'frango-grelhado', NULL, 24.99, 'Acompanha arroz, feijão, fritas e farofa.', 21, true),
('pratos-especiais', 'Parmegiana de carne', 'parmegiana-de-carne', NULL, 39.99, 'Acompanha arroz e fritas.', 1, true),
('pratos-especiais', 'Parmegiana de tilápia', 'parmegiana-de-tilapia', NULL, 39.99, 'Acompanha arroz e fritas.', 2, true),
('pratos-especiais', 'Parmegiana de frango', 'parmegiana-de-frango', NULL, 34.99, 'Acompanha arroz e fritas.', 3, true),
('pratos-especiais', 'Parmegiana de berinjela', 'parmegiana-de-berinjela', NULL, 29.99, 'Acompanha arroz e fritas.', 4, true),
('pratos-especiais', 'Strogonoff de camarão', 'strogonoff-de-camarao', NULL, 44.99, 'Acompanha arroz e fritas.', 5, true),
('massas', 'Nhoque recheado', 'nhoque-recheado', NULL, 39.99, 'Acompanha arroz e fritas.', 1, true),
('massas', 'Lasanha', 'lasanha', NULL, 39.99, 'Acompanha arroz e fritas.', 2, true),
('refrigerantes', 'Latas', 'latas', NULL, 8.00, NULL, 1, true),
('refrigerantes', 'H2O', 'h2o', NULL, 9.00, NULL, 2, true),
('refrigerantes', 'Coca-Cola 1L', 'coca-cola-1l', NULL, 14.00, NULL, 3, true),
('refrigerantes', 'Tubaína 600ml', 'tubaina-600ml', NULL, 10.00, NULL, 4, true),
('refrigerantes', 'Guaraná Piracaia 2L', 'guarana-piracaia-2l', NULL, 10.00, NULL, 5, true),
('refrigerantes', 'Água com gás', 'agua-com-gas', NULL, 5.00, NULL, 6, true),
('refrigerantes', 'Água', 'agua', NULL, 4.00, NULL, 7, true),
('sucos', 'Laranja / Maracujá', 'laranja-maracuja', NULL, 14.00, NULL, 1, true),
('sucos', 'Morango, abacaxi, manga, abacaxi c/ hortelã', 'sabores-12', NULL, 12.00, NULL, 2, true),
('sucos', 'Dois sabores', 'dois-sabores', NULL, 16.00, NULL, 3, true),
('cervejas', 'Heineken', 'heineken', NULL, 19.99, NULL, 1, true),
('cervejas', 'Original', 'original', NULL, 17.99, NULL, 2, true),
('cervejas', 'Antártica', 'antartica', NULL, 11.99, NULL, 3, true),
('cervejas', 'Skol', 'skol', NULL, 11.99, NULL, 4, true),
('cervejas', 'Brahma', 'brahma', NULL, 11.99, NULL, 5, true),
('cervejas', 'Heineken long neck', 'heineken-long-neck', NULL, 11.99, NULL, 6, true),
('bebidas-alcoolicas', 'Campari dose', 'campari-dose', NULL, 15.00, NULL, 1, true),
('bebidas-alcoolicas', 'Cachaça dose', 'cachaca-dose', NULL, 8.00, NULL, 2, true),
('bebidas-alcoolicas', 'Caipirinhas (morango, maracujá, limão, abacaxi)', 'caipirinhas', NULL, NULL, 'Preço não informado no arquivo.', 3, false),
('bebidas-alcoolicas', 'Sake', 'sake', NULL, 20.00, NULL, 4, true),
('bebidas-alcoolicas', 'Vodka', 'vodka', NULL, 20.00, NULL, 5, true),
('bebidas-alcoolicas', 'Velho Barreiro', 'velho-barreiro', NULL, 18.00, NULL, 6, true),
('bebidas-alcoolicas', 'Vinho garrafa', 'vinho-garrafa', NULL, 25.00, NULL, 7, true),
('bebidas-alcoolicas', 'Vinho taça', 'vinho-taca', NULL, 12.00, NULL, 8, true)
)
insert into public.products (
    category_id,
    name,
    slug,
    size,
    price,
    description,
    sort_order,
    active
)
select
    c.id,
    s.name,
    s.slug,
    s.size,
    s.price,
    s.description,
    s.sort_order,
    s.active
from seed s
join public.categories c
    on c.slug = s.category_slug
on conflict (category_id, slug) do nothing;

commit;

-- ============================================================
-- DEPOIS DE CRIAR O USUÁRIO ADM EM:
-- Supabase > Authentication > Users
--
-- 1) Descubra o UUID:
-- select id, email from auth.users order by created_at desc;
--
-- 2) Cadastre SOMENTE o usuário que será administrador:
-- insert into private.app_admins (user_id)
-- values ('COLE-AQUI-O-UUID-DO-USUARIO');
--
-- Conferência:
-- select count(*) as total_produtos from public.products;
-- select count(*) as total_categorias from public.categories;
-- ============================================================
