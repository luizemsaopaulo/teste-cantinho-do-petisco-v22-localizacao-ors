-- ============================================================
-- CANTINHO DO PETISCO
-- MIGRAÇÃO: OPÇÕES / SABORES / ADICIONAIS POR PRODUTO
-- Gerado a partir da auditoria do MEPE Food.
--
-- DEPURAÇÃO DA FONTE:
-- 80 produtos descobertos
-- 80 produtos inspecionados
-- 21 produtos com opções
-- 21 grupos de opções
-- 68 opções individuais
--
-- Execute no Supabase > SQL Editor.
-- Pode executar novamente: o script usa UPSERT e não duplica grupos/opções.
-- Não altera preço, nome, descrição, foto, categoria ou disponibilidade
-- dos produtos atuais.
-- ============================================================

reset role;

begin;

-- ------------------------------------------------------------
-- 0) PRÉ-CHECAGENS
-- ------------------------------------------------------------
do $$
begin
    if to_regclass('public.products') is null then
        raise exception 'Tabela public.products não existe.';
    end if;

    if to_regprocedure('public.is_admin()') is null then
        raise exception 'Função public.is_admin() não existe. Execute primeiro o banco base do Cantinho.';
    end if;
end
$$;

-- ------------------------------------------------------------
-- 1) OBSERVAÇÃO DO CLIENTE
-- No MEPE, todos os produtos auditados possuíam Observação.
-- ------------------------------------------------------------
alter table public.products
    add column if not exists allow_notes boolean not null default true;

alter table public.products
    add column if not exists notes_max_length integer;

alter table public.products
    drop constraint if exists products_notes_max_length_check;

alter table public.products
    add constraint products_notes_max_length_check
    check (notes_max_length is null or notes_max_length between 1 and 5000);

-- ------------------------------------------------------------
-- 2) GRUPOS DE OPÇÕES
-- Ex.: Sabores, Adicionais, Escolha sua bebida.
-- ------------------------------------------------------------
create table if not exists public.product_option_groups (
    id uuid primary key default gen_random_uuid(),

    product_id uuid not null
        references public.products(id)
        on update cascade
        on delete cascade,

    code text not null
        check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),

    name text not null
        check (length(btrim(name)) between 1 and 120),

    selection_type text not null
        check (selection_type in ('single', 'multiple')),

    required boolean not null default false,

    min_selections integer
        check (min_selections is null or min_selections >= 0),

    max_selections integer
        check (max_selections is null or max_selections >= 0),

    sort_order integer not null default 0
        check (sort_order >= 0),

    active boolean not null default true,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint product_option_groups_product_code_unique
        unique (product_id, code),

    constraint product_option_groups_min_max_check
        check (
            min_selections is null
            or max_selections is null
            or max_selections >= min_selections
        )
);

create index if not exists product_option_groups_product_idx
    on public.product_option_groups(product_id, active, sort_order);

-- ------------------------------------------------------------
-- 3) OPÇÕES DE CADA GRUPO
--
-- price_mode:
--   add = soma price_value ao preço do produto.
--   set = a opção define o preço unitário final.
--
-- "set" é necessário para o produto "Bebidas lata 395ml":
-- o produto pode ter preço-base 0/8, mas a escolha final vale 8 ou 12.
-- ------------------------------------------------------------
create table if not exists public.product_options (
    id uuid primary key default gen_random_uuid(),

    group_id uuid not null
        references public.product_option_groups(id)
        on update cascade
        on delete cascade,

    code text not null
        check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),

    name text not null
        check (length(btrim(name)) between 1 and 160),

    price_mode text not null default 'add'
        check (price_mode in ('add', 'set')),

    price_value numeric(10,2) not null default 0
        check (price_value >= 0),

    is_none_option boolean not null default false,

    sort_order integer not null default 0
        check (sort_order >= 0),

    active boolean not null default true,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint product_options_group_code_unique
        unique (group_id, code)
);

create index if not exists product_options_group_idx
    on public.product_options(group_id, active, sort_order);

-- ------------------------------------------------------------
-- 4) updated_at
-- ------------------------------------------------------------
drop trigger if exists product_option_groups_set_updated_at
    on public.product_option_groups;

create trigger product_option_groups_set_updated_at
before update on public.product_option_groups
for each row execute function public.set_updated_at();

drop trigger if exists product_options_set_updated_at
    on public.product_options;

create trigger product_options_set_updated_at
before update on public.product_options
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 5) RLS
-- Público vê somente opções ativas de produtos ativos.
-- ADM pode ler/criar/editar/excluir tudo.
-- ------------------------------------------------------------
alter table public.product_option_groups enable row level security;
alter table public.product_options enable row level security;

drop policy if exists product_option_groups_public_read
    on public.product_option_groups;
drop policy if exists product_option_groups_admin_read
    on public.product_option_groups;
drop policy if exists product_option_groups_admin_insert
    on public.product_option_groups;
drop policy if exists product_option_groups_admin_update
    on public.product_option_groups;
drop policy if exists product_option_groups_admin_delete
    on public.product_option_groups;

create policy product_option_groups_public_read
on public.product_option_groups
for select
to anon, authenticated
using (
    active = true
    and exists (
        select 1
        from public.products p
        where p.id = product_option_groups.product_id
          and p.active = true
    )
);

create policy product_option_groups_admin_read
on public.product_option_groups
for select
to authenticated
using ((select public.is_admin()));

create policy product_option_groups_admin_insert
on public.product_option_groups
for insert
to authenticated
with check ((select public.is_admin()));

create policy product_option_groups_admin_update
on public.product_option_groups
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy product_option_groups_admin_delete
on public.product_option_groups
for delete
to authenticated
using ((select public.is_admin()));

drop policy if exists product_options_public_read
    on public.product_options;
drop policy if exists product_options_admin_read
    on public.product_options;
drop policy if exists product_options_admin_insert
    on public.product_options;
drop policy if exists product_options_admin_update
    on public.product_options;
drop policy if exists product_options_admin_delete
    on public.product_options;

create policy product_options_public_read
on public.product_options
for select
to anon, authenticated
using (
    active = true
    and exists (
        select 1
        from public.product_option_groups g
        join public.products p on p.id = g.product_id
        where g.id = product_options.group_id
          and g.active = true
          and p.active = true
    )
);

create policy product_options_admin_read
on public.product_options
for select
to authenticated
using ((select public.is_admin()));

create policy product_options_admin_insert
on public.product_options
for insert
to authenticated
with check ((select public.is_admin()));

create policy product_options_admin_update
on public.product_options
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy product_options_admin_delete
on public.product_options
for delete
to authenticated
using ((select public.is_admin()));

-- ------------------------------------------------------------
-- 6) GRANTS
-- ------------------------------------------------------------
revoke all on public.product_option_groups from anon, authenticated;
revoke all on public.product_options from anon, authenticated;

grant select on public.product_option_groups to anon, authenticated;
grant select on public.product_options to anon, authenticated;

grant insert, update, delete
on public.product_option_groups
to authenticated;

grant insert, update, delete
on public.product_options
to authenticated;

-- ------------------------------------------------------------
-- 7) FUNÇÃO TEMPORÁRIA DE NORMALIZAÇÃO
-- Somente para localizar produtos por nome quando o slug não existir.
-- ------------------------------------------------------------
create or replace function pg_temp.cantinho_norm(v text)
returns text
language sql
immutable
as $$
    select regexp_replace(
        translate(
            lower(coalesce(v, '')),
            'áàâãäéèêëíìîïóòôõöúùûüç',
            'aaaaaeeeeiiiiooooouuuuc'
        ),
        '[^a-z0-9]+',
        '',
        'g'
    );
$$;

-- ------------------------------------------------------------
-- 8) MAPA DA AUDITORIA -> PRODUTO DO NOSSO BANCO
--
-- Prioridade:
-- 1. slug conhecido do nosso banco;
-- 2. nome normalizado como fallback.
--
-- Se algum produto ainda não existir no nosso Supabase,
-- ele simplesmente ficará como NÃO ENCONTRADO no relatório final.
-- ------------------------------------------------------------
create temp table tmp_cantinho_product_map (
    source_product_id text primary key,
    target_category_slug text,
    target_slug text,
    target_name text not null,
    target_size text
);

insert into tmp_cantinho_product_map
(source_product_id, target_category_slug, target_slug, target_name, target_size)
values
('1638379', 'porcoes', 'isca-de-tilapia-500g', 'Tilapia Empanada 500gr', NULL),
('1663205', 'porcoes', 'carne-seca-acebolada-400g', 'Porçao carne seca 400gr', NULL),
('1638424', 'porcoes', 'contra-file-acebolado-400g', 'Contra filé acebolado 400gr', NULL),
('1638425', 'porcoes', 'costelinha-de-porco-400g', 'Costelinha de porco 400gr', NULL),
('1896155', 'porcoes', 'calabresa-acebolada-e-batata-frita', 'Porção Mista calabresa acebolada e batata frita', NULL),
('1638374', 'porcoes', 'calabresa-acebolada-400g', 'Calabresa Acebolada 400gr', NULL),
('1638377', 'porcoes', 'frango-a-passarinho', 'Frango a Passarinho', NULL),
('1638383', 'porcoes', 'isca-de-truta-400g', 'Truta 400gr', NULL),
('1660609', 'marmitas', 'nhoque-recheado-g', 'Marmita Nhoque recheado queijo', 'G'),
('1688563', 'marmitas', 'bisteca-de-porco-p', 'Marmita P Bisteca de Porco', 'P'),
('1697483', 'marmitas', 'bisteca-de-porco-g', 'Marmita G Bisteca de Porco', 'G'),
('1720928', 'marmitas', 'parmegiana-de-berinjela-g', 'Marmita G parmegiana de Berinjela', 'G'),
('1643775', NULL, 'suco-natural-garrafa-500-ml', 'Suco natural garrafa 500 ml', NULL),
('1398646', 'refrigerantes', 'latas', 'Bebidas lata 395ml', NULL),
('1919648', NULL, 'suco-del-valle-lata', 'Suco Del Valle lata', NULL),
('1981344', NULL, 'picole-ao-leite-capricho', 'Picolé ao leite CAPRICHO', NULL),
('1981346', NULL, 'picole-de-frutas-capricho', 'Picolé de frutas CAPRICHO', NULL),
('1981585', NULL, 'copo-baby-125ml-capricho', 'COPO BABY 125ML CAPRICHO', NULL),
('1981568', NULL, 'picole-tufatta-capricho', 'Picolé tufatta CAPRICHO', NULL),
('1981581', NULL, 'sundae-200-ml-capricho', 'SUNDAE 200 ML CAPRICHO', NULL),
('1988096', NULL, 'pudim-de-copo', 'Pudim De Copo', NULL);

create temp table tmp_cantinho_group_seed (
    source_product_id text not null,
    group_code text not null,
    group_name text not null,
    selection_type text not null,
    required boolean not null,
    min_selections integer,
    max_selections integer,
    sort_order integer not null,
    primary key (source_product_id, group_code)
);

insert into tmp_cantinho_group_seed
(source_product_id, group_code, group_name, selection_type, required,
 min_selections, max_selections, sort_order)
values
('1638379', 'adicionais', 'Adicionais', 'multiple', false, NULL, NULL, 1),
('1663205', 'adicionais', 'Adicionais', 'multiple', false, NULL, NULL, 1),
('1638424', 'adicionais', 'Adicionais', 'multiple', false, NULL, NULL, 1),
('1638425', 'adicionais', 'Adicionais', 'multiple', false, NULL, NULL, 1),
('1896155', 'adicionais', 'Adicionais', 'multiple', false, NULL, NULL, 1),
('1638374', 'adicionais', 'Adicionais', 'multiple', false, NULL, NULL, 1),
('1638377', 'adicionais', 'Adicionais', 'multiple', false, NULL, NULL, 1),
('1638383', 'adicionais', 'Adicionais', 'multiple', false, NULL, NULL, 1),
('1660609', 'adicionais', 'Adicionais', 'multiple', false, NULL, NULL, 1),
('1688563', 'adicionais', 'Adicionais', 'multiple', false, NULL, NULL, 1),
('1697483', 'adicionais', 'Adicionais', 'multiple', false, NULL, NULL, 1),
('1720928', 'adicionais', 'Adicionais', 'multiple', false, NULL, NULL, 1),
('1643775', 'sabores', 'Sabores', 'single', true, 1, 1, 1),
('1398646', 'escolha-sua-bebida', 'escolha sua bebida', 'single', true, 1, 1, 1),
('1919648', 'sabores', 'Sabores', 'multiple', false, NULL, NULL, 1),
('1981344', 'sabores', 'SABORES', 'single', true, 1, 1, 1),
('1981346', 'sabores', 'SABORES', 'single', true, 1, 1, 1),
('1981585', 'sabores', 'SABORES', 'single', true, 1, 1, 1),
('1981568', 'sabores', 'SABORES', 'single', true, 1, 1, 1),
('1981581', 'sabores', 'SABORES', 'single', true, 1, 1, 1),
('1988096', 'sabores', 'Sabores', 'single', true, 1, 1, 1);

create temp table tmp_cantinho_option_seed (
    source_product_id text not null,
    group_code text not null,
    option_code text not null,
    option_name text not null,
    price_mode text not null,
    price_value numeric(10,2) not null,
    is_none_option boolean not null,
    sort_order integer not null,
    primary key (source_product_id, group_code, option_code)
);

insert into tmp_cantinho_option_seed
(source_product_id, group_code, option_code, option_name,
 price_mode, price_value, is_none_option, sort_order)
values
('1638379', 'adicionais', 'nenhum', 'Nenhum', 'add', 0, true, 1),
('1638379', 'adicionais', 'porcao-de-arroz', 'Porção de arroz', 'add', 10, false, 2),
('1638379', 'adicionais', 'porcao-feijao', 'Porçao feijao', 'add', 10, false, 3),
('1663205', 'adicionais', 'nenhum', 'Nenhum', 'add', 0, true, 1),
('1663205', 'adicionais', 'porcao-de-arroz', 'Porção de arroz', 'add', 10, false, 2),
('1663205', 'adicionais', 'porcao-feijao', 'Porçao feijao', 'add', 10, false, 3),
('1638424', 'adicionais', 'nenhum', 'Nenhum', 'add', 0, true, 1),
('1638424', 'adicionais', 'porcao-de-arroz', 'Porção de arroz', 'add', 10, false, 2),
('1638424', 'adicionais', 'porcao-feijao', 'Porçao feijao', 'add', 10, false, 3),
('1638425', 'adicionais', 'nenhum', 'Nenhum', 'add', 0, true, 1),
('1638425', 'adicionais', 'porcao-de-arroz', 'Porção de arroz', 'add', 10, false, 2),
('1638425', 'adicionais', 'porcao-feijao', 'Porçao feijao', 'add', 10, false, 3),
('1896155', 'adicionais', 'nenhum', 'Nenhum', 'add', 0, true, 1),
('1896155', 'adicionais', 'porcao-de-arroz', 'Porção de arroz', 'add', 10, false, 2),
('1896155', 'adicionais', 'porcao-feijao', 'Porçao feijao', 'add', 10, false, 3),
('1638374', 'adicionais', 'nenhum', 'Nenhum', 'add', 0, true, 1),
('1638374', 'adicionais', 'porcao-de-arroz', 'Porção de arroz', 'add', 10, false, 2),
('1638374', 'adicionais', 'porcao-feijao', 'Porçao feijao', 'add', 10, false, 3),
('1638377', 'adicionais', 'nenhum', 'Nenhum', 'add', 0, true, 1),
('1638377', 'adicionais', 'porcao-de-arroz', 'Porção de arroz', 'add', 10, false, 2),
('1638377', 'adicionais', 'porcao-feijao', 'Porçao feijao', 'add', 10, false, 3),
('1638383', 'adicionais', 'nenhum', 'Nenhum', 'add', 0, true, 1),
('1638383', 'adicionais', 'porcao-de-arroz', 'Porção de arroz', 'add', 10, false, 2),
('1638383', 'adicionais', 'porcao-de-feijao', 'Porçao de feijao', 'add', 10, false, 3),
('1660609', 'adicionais', 'nenhum', 'Nenhum', 'add', 0, true, 1),
('1660609', 'adicionais', 'bife-empanado', 'Bife empanado', 'add', 10, false, 2),
('1660609', 'adicionais', 'file-de-frango-empanado', 'Filé de frango empanado', 'add', 10, false, 3),
('1688563', 'adicionais', 'acebolada', 'Acebolada', 'add', 0, false, 1),
('1688563', 'adicionais', 'ovo-frito', 'Ovo frito', 'add', 3, false, 2),
('1697483', 'adicionais', 'acebolada', 'Acebolada', 'add', 0, false, 1),
('1697483', 'adicionais', 'ovo-frito', 'Ovo frito', 'add', 3, false, 2),
('1720928', 'adicionais', 'file-de-frango-empanado', 'Filé de frango empanado', 'add', 10, false, 1),
('1720928', 'adicionais', 'bife-empanado', 'Bife empanado', 'add', 10, false, 2),
('1643775', 'sabores', 'abacaxi', 'Abacaxi', 'add', 0, false, 1),
('1643775', 'sabores', 'abacaxi-com-hortela', 'Abacaxi com hortelã', 'add', 0, false, 2),
('1643775', 'sabores', 'laranja', 'Laranja', 'add', 0, false, 3),
('1643775', 'sabores', 'manga', 'Manga', 'add', 0, false, 4),
('1643775', 'sabores', 'morango', 'Morango', 'add', 0, false, 5),
('1643775', 'sabores', 'goiaba', 'Goiaba', 'add', 0, false, 6),
('1398646', 'escolha-sua-bebida', 'coca-cola', 'coca cola', 'set', 8, false, 1),
('1398646', 'escolha-sua-bebida', 'coca-cola-zero', 'coca cola zero', 'set', 8, false, 2),
('1398646', 'escolha-sua-bebida', 'guarana', 'guarana', 'set', 8, false, 3),
('1398646', 'escolha-sua-bebida', 'guarana-zero', 'guarana zero', 'set', 8, false, 4),
('1398646', 'escolha-sua-bebida', 'fanta-laranja', 'fanta laranja', 'set', 8, false, 5),
('1398646', 'escolha-sua-bebida', 'suco-de-laranja', 'suco de laranja', 'set', 12, false, 6),
('1398646', 'escolha-sua-bebida', 'suco-de-morango', 'suco de morango', 'set', 12, false, 7),
('1398646', 'escolha-sua-bebida', 'suco-de-maracuja', 'suco de maracuja', 'set', 12, false, 8),
('1398646', 'escolha-sua-bebida', 'suco-de-manga-500ml', 'Suco de Manga 500ml', 'set', 12, false, 9),
('1398646', 'escolha-sua-bebida', 'suco-de-abacaxi', 'suco de abacaxi', 'set', 12, false, 10),
('1919648', 'sabores', 'uva', 'Uva', 'add', 0, false, 1),
('1919648', 'sabores', 'manga', 'MANGA', 'add', 0, false, 2),
('1981344', 'sabores', 'chocolate', 'CHOCOLATE', 'add', 0, false, 1),
('1981344', 'sabores', 'coco', 'COCO', 'add', 0, false, 2),
('1981344', 'sabores', 'morango', 'MORANGO', 'add', 0, false, 3),
('1981344', 'sabores', 'milho-verde', 'MILHO VERDE', 'add', 0, false, 4),
('1981344', 'sabores', 'leite-condesado', 'LEITE CONDESADO', 'add', 0, false, 5),
('1981346', 'sabores', 'uva', 'Uva', 'add', 0, false, 1),
('1981346', 'sabores', 'limao', 'Limão', 'add', 0, false, 2),
('1981585', 'sabores', 'napolitano', 'NAPOLITANO', 'add', 0, false, 1),
('1981568', 'sabores', 'brigadeiro', 'BRIGADEIRO', 'add', 0, false, 1),
('1981568', 'sabores', 'bombom', 'BOMBOM', 'add', 0, false, 2),
('1981568', 'sabores', 'seducao', 'SEDUÇAO', 'add', 0, false, 3),
('1981581', 'sabores', 'leitinho-trufado', 'LEITINHO TRUFADO', 'add', 0, false, 1),
('1981581', 'sabores', 'morango', 'MORANGO', 'add', 0, false, 2),
('1981581', 'sabores', 'brigadeiro', 'BRIGADEIRO', 'add', 0, false, 3),
('1988096', 'sabores', 'tradicional', 'Tradicional', 'add', 0, false, 1),
('1988096', 'sabores', 'leite-ninho', 'Leite Ninho', 'add', 0, false, 2),
('1988096', 'sabores', 'doce-de-leite', 'Doce de leite', 'add', 0, false, 3);

-- ------------------------------------------------------------
-- 9) RESOLVE CADA PRODUTO AUDITADO PARA O UUID DO NOSSO BANCO
-- ------------------------------------------------------------
create temp table tmp_cantinho_resolved_products as
select
    m.source_product_id,
    m.target_name as source_name,
    chosen.id as product_id,
    chosen.name as matched_name,
    chosen.slug as matched_slug,
    chosen.size as matched_size
from tmp_cantinho_product_map m
left join lateral (
    select
        p.id,
        p.name,
        p.slug,
        p.size
    from public.products p
    join public.categories c on c.id = p.category_id
    where
        (
            (m.target_slug is not null and p.slug = m.target_slug)
            or
            (
                pg_temp.cantinho_norm(p.name) = pg_temp.cantinho_norm(m.target_name)
                and (
                    m.target_size is null
                    or upper(coalesce(p.size, '')) = upper(m.target_size)
                )
            )
        )
        and (
            m.target_category_slug is null
            or c.slug = m.target_category_slug
        )
    order by
        case when m.target_slug is not null and p.slug = m.target_slug then 0 else 1 end,
        p.updated_at desc,
        p.id
    limit 1
) chosen on true;

-- ------------------------------------------------------------
-- 10) INSERE / ATUALIZA OS GRUPOS
-- ------------------------------------------------------------
insert into public.product_option_groups (
    product_id,
    code,
    name,
    selection_type,
    required,
    min_selections,
    max_selections,
    sort_order,
    active
)
select
    r.product_id,
    g.group_code,
    g.group_name,
    g.selection_type,
    g.required,
    g.min_selections,
    g.max_selections,
    g.sort_order,
    true
from tmp_cantinho_group_seed g
join tmp_cantinho_resolved_products r
    on r.source_product_id = g.source_product_id
where r.product_id is not null
on conflict (product_id, code)
do update set
    name = excluded.name,
    selection_type = excluded.selection_type,
    required = excluded.required,
    min_selections = excluded.min_selections,
    max_selections = excluded.max_selections,
    sort_order = excluded.sort_order,
    active = true;

-- ------------------------------------------------------------
-- 11) INSERE / ATUALIZA AS OPÇÕES
-- ------------------------------------------------------------
insert into public.product_options (
    group_id,
    code,
    name,
    price_mode,
    price_value,
    is_none_option,
    sort_order,
    active
)
select
    gdb.id,
    o.option_code,
    o.option_name,
    o.price_mode,
    o.price_value,
    o.is_none_option,
    o.sort_order,
    true
from tmp_cantinho_option_seed o
join tmp_cantinho_resolved_products r
    on r.source_product_id = o.source_product_id
join public.product_option_groups gdb
    on gdb.product_id = r.product_id
   and gdb.code = o.group_code
where r.product_id is not null
on conflict (group_id, code)
do update set
    name = excluded.name,
    price_mode = excluded.price_mode,
    price_value = excluded.price_value,
    is_none_option = excluded.is_none_option,
    sort_order = excluded.sort_order,
    active = true;

commit;

-- ============================================================
-- CONFERÊNCIA FINAL
-- ============================================================

-- RESUMO:
select
    (select count(*) from tmp_cantinho_product_map) as produtos_auditados_com_opcoes,
    (select count(*) from tmp_cantinho_resolved_products where product_id is not null) as produtos_encontrados_no_nosso_banco,
    (select count(*) from tmp_cantinho_resolved_products where product_id is null) as produtos_nao_encontrados,
    (
        select count(*)
        from tmp_cantinho_group_seed gs
        join tmp_cantinho_resolved_products rp
          on rp.source_product_id = gs.source_product_id
        where rp.product_id is not null
    ) as grupos_esperados_dos_produtos_encontrados,
    (
        select count(*)
        from tmp_cantinho_option_seed os
        join tmp_cantinho_resolved_products rp
          on rp.source_product_id = os.source_product_id
        where rp.product_id is not null
    ) as opcoes_esperadas_dos_produtos_encontrados;

-- MOSTRA O QUE FOI ENCONTRADO:
select
    source_product_id as mepe_id,
    source_name as produto_auditado,
    matched_name as produto_no_supabase,
    matched_slug as slug_no_supabase,
    matched_size as tamanho,
    case
        when product_id is null then 'NAO ENCONTRADO'
        else 'OK'
    end as status
from tmp_cantinho_resolved_products
order by
    case when product_id is null then 0 else 1 end,
    source_name;

-- CONTAGEM REAL NO BANCO PARA OS PRODUTOS RESOLVIDOS:
select
    count(distinct g.id) as grupos_presentes,
    count(o.id) as opcoes_presentes
from public.product_option_groups g
join tmp_cantinho_resolved_products rp
    on rp.product_id = g.product_id
left join public.product_options o
    on o.group_id = g.id
where rp.product_id is not null;
