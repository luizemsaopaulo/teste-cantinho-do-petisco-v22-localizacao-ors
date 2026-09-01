-- ============================================================
-- CANTINHO DO PETISCO
-- PREENCHER ADICIONAIS PAGOS / OPÇÕES COM PREÇO
--
-- Fonte: auditoria do site antigo MEPE Food.
-- Produtos com opção paga no relatório: 13
-- Grupos a cadastrar: 13
-- Opções a cadastrar/atualizar: 43
--
-- IMPORTANTE:
-- - NÃO altera nome, preço-base, foto, descrição, categoria ou disponibilidade.
-- - NÃO apaga opções existentes.
-- - É idempotente: pode rodar novamente sem duplicar.
-- - Usa UPSERT nas tabelas product_option_groups e product_options.
-- ============================================================

reset role;

begin;

-- ------------------------------------------------------------
-- 0) CONFERE SE A MIGRAÇÃO DE OPÇÕES JÁ FOI INSTALADA
-- ------------------------------------------------------------
do $$
begin
    if to_regclass('public.products') is null then
        raise exception 'Tabela public.products não existe.';
    end if;

    if to_regclass('public.categories') is null then
        raise exception 'Tabela public.categories não existe.';
    end if;

    if to_regclass('public.product_option_groups') is null then
        raise exception 'Tabela public.product_option_groups não existe. Rode primeiro a migração de opções.';
    end if;

    if to_regclass('public.product_options') is null then
        raise exception 'Tabela public.product_options não existe. Rode primeiro a migração de opções.';
    end if;
end
$$;

-- ------------------------------------------------------------
-- 1) FUNÇÃO TEMPORÁRIA PARA COMPARAR NOMES SEM ACENTO/PONTUAÇÃO
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
-- 2) MAPA DOS 13 PRODUTOS DO RELATÓRIO
-- ------------------------------------------------------------
create temp table tmp_paid_product_map (
    source_product_id text primary key,
    source_name text not null,
    target_category_slug text not null,
    slug_candidates text[] not null,
    name_candidates text[] not null,
    target_size text
);

insert into tmp_paid_product_map
(source_product_id, source_name, target_category_slug, slug_candidates, name_candidates, target_size)
values
('1638379', 'Tilapia Empanada 500gr', 'porcoes', ARRAY['isca-de-tilapia-500g', 'isca-de-tilapia-500gr', 'tilapia-empanada-500g', 'tilapia-empanada-500gr']::text[], ARRAY['Isca de tilápia 500gr', 'Tilapia Empanada 500gr', 'Tilápia Empanada 500gr']::text[], NULL),
('1663205', 'Porçao carne seca 400gr', 'porcoes', ARRAY['carne-seca-acebolada-400g', 'carne-seca-acebolada-400gr']::text[], ARRAY['Carne seca acebolada 400gr', 'Porçao carne seca 400gr', 'Porção carne seca 400gr']::text[], NULL),
('1638424', 'Contra filé acebolado 400gr', 'porcoes', ARRAY['contra-file-acebolado-400g', 'contra-file-acebolado-400gr']::text[], ARRAY['Contra filé acebolado 400gr', 'Contra file acebolado 400gr']::text[], NULL),
('1638425', 'Costelinha de porco 400gr', 'porcoes', ARRAY['costelinha-de-porco-400g', 'costelinha-de-porco-400gr']::text[], ARRAY['Costelinha de porco 400gr']::text[], NULL),
('1896155', 'Porção Mista calabresa acebolada e batata frita', 'porcoes', ARRAY['calabresa-acebolada-e-batata-frita', 'porcao-mista-calabresa-acebolada-e-batata-frita']::text[], ARRAY['Calabresa acebolada e batata frita', 'Porção Mista calabresa acebolada e batata frita']::text[], NULL),
('1638374', 'Calabresa Acebolada 400gr', 'porcoes', ARRAY['calabresa-acebolada-400g', 'calabresa-acebolada-400gr']::text[], ARRAY['Calabresa acebolada 400gr', 'Calabresa Acebolada 400gr']::text[], NULL),
('1638377', 'Frango a Passarinho', 'porcoes', ARRAY['frango-a-passarinho']::text[], ARRAY['Frango a passarinho', 'Frango a Passarinho']::text[], NULL),
('1638383', 'Truta 400gr', 'porcoes', ARRAY['isca-de-truta-400g', 'isca-de-truta-400gr', 'truta-400g', 'truta-400gr']::text[], ARRAY['Isca de truta 400gr', 'Truta 400gr']::text[], NULL),
('1660609', 'Marmita Nhoque recheado queijo', 'marmitas', ARRAY['nhoque-recheado-g']::text[], ARRAY['Nhoque recheado', 'Marmita Nhoque recheado queijo']::text[], NULL),
('1688563', 'Marmita P Bisteca de Porco', 'marmitas', ARRAY['bisteca-de-porco-p']::text[], ARRAY['Bisteca de porco']::text[], 'P'),
('1697483', 'Marmita G Bisteca de Porco', 'marmitas', ARRAY['bisteca-de-porco-g']::text[], ARRAY['Bisteca de porco']::text[], 'G'),
('1720928', 'Marmita G parmegiana de Berinjela', 'marmitas', ARRAY['parmegiana-de-berinjela-g']::text[], ARRAY['Parmegiana de berinjela', 'Marmita G parmegiana de Berinjela']::text[], NULL),
('1398646', 'Bebidas lata 395ml', 'refrigerantes', ARRAY['latas', 'bebidas-lata-395ml', 'bebidas-lata']::text[], ARRAY['Latas', 'Bebidas lata 395ml']::text[], NULL);

-- ------------------------------------------------------------
-- 3) GRUPOS DO RELATÓRIO
-- ------------------------------------------------------------
create temp table tmp_paid_group_seed (
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

insert into tmp_paid_group_seed
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
('1398646', 'escolha-sua-bebida', 'escolha sua bebida', 'single', true, 1, 1, 1);

-- ------------------------------------------------------------
-- 4) OPÇÕES E PREÇOS DO RELATÓRIO
--
-- price_mode = add:
--   soma ao preço-base do produto.
--
-- price_mode = set:
--   define o preço final da unidade escolhida.
--   Usado apenas em "Bebidas lata 395ml".
-- ------------------------------------------------------------
create temp table tmp_paid_option_seed (
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

insert into tmp_paid_option_seed
(source_product_id, group_code, option_code, option_name,
 price_mode, price_value, is_none_option, sort_order)
values
('1638379', 'adicionais', 'nenhum', 'Nenhum', 'add', 0.00, true, 1),
('1638379', 'adicionais', 'porcao-de-arroz', 'Porção de arroz', 'add', 10.00, false, 2),
('1638379', 'adicionais', 'porcao-feijao', 'Porçao feijao', 'add', 10.00, false, 3),
('1663205', 'adicionais', 'nenhum', 'Nenhum', 'add', 0.00, true, 1),
('1663205', 'adicionais', 'porcao-de-arroz', 'Porção de arroz', 'add', 10.00, false, 2),
('1663205', 'adicionais', 'porcao-feijao', 'Porçao feijao', 'add', 10.00, false, 3),
('1638424', 'adicionais', 'nenhum', 'Nenhum', 'add', 0.00, true, 1),
('1638424', 'adicionais', 'porcao-de-arroz', 'Porção de arroz', 'add', 10.00, false, 2),
('1638424', 'adicionais', 'porcao-feijao', 'Porçao feijao', 'add', 10.00, false, 3),
('1638425', 'adicionais', 'nenhum', 'Nenhum', 'add', 0.00, true, 1),
('1638425', 'adicionais', 'porcao-de-arroz', 'Porção de arroz', 'add', 10.00, false, 2),
('1638425', 'adicionais', 'porcao-feijao', 'Porçao feijao', 'add', 10.00, false, 3),
('1896155', 'adicionais', 'nenhum', 'Nenhum', 'add', 0.00, true, 1),
('1896155', 'adicionais', 'porcao-de-arroz', 'Porção de arroz', 'add', 10.00, false, 2),
('1896155', 'adicionais', 'porcao-feijao', 'Porçao feijao', 'add', 10.00, false, 3),
('1638374', 'adicionais', 'nenhum', 'Nenhum', 'add', 0.00, true, 1),
('1638374', 'adicionais', 'porcao-de-arroz', 'Porção de arroz', 'add', 10.00, false, 2),
('1638374', 'adicionais', 'porcao-feijao', 'Porçao feijao', 'add', 10.00, false, 3),
('1638377', 'adicionais', 'nenhum', 'Nenhum', 'add', 0.00, true, 1),
('1638377', 'adicionais', 'porcao-de-arroz', 'Porção de arroz', 'add', 10.00, false, 2),
('1638377', 'adicionais', 'porcao-feijao', 'Porçao feijao', 'add', 10.00, false, 3),
('1638383', 'adicionais', 'nenhum', 'Nenhum', 'add', 0.00, true, 1),
('1638383', 'adicionais', 'porcao-de-arroz', 'Porção de arroz', 'add', 10.00, false, 2),
('1638383', 'adicionais', 'porcao-de-feijao', 'Porçao de feijao', 'add', 10.00, false, 3),
('1660609', 'adicionais', 'nenhum', 'Nenhum', 'add', 0.00, true, 1),
('1660609', 'adicionais', 'bife-empanado', 'Bife empanado', 'add', 10.00, false, 2),
('1660609', 'adicionais', 'file-de-frango-empanado', 'Filé de frango empanado', 'add', 10.00, false, 3),
('1688563', 'adicionais', 'acebolada', 'Acebolada', 'add', 0.00, false, 1),
('1688563', 'adicionais', 'ovo-frito', 'Ovo frito', 'add', 3.00, false, 2),
('1697483', 'adicionais', 'acebolada', 'Acebolada', 'add', 0.00, false, 1),
('1697483', 'adicionais', 'ovo-frito', 'Ovo frito', 'add', 3.00, false, 2),
('1720928', 'adicionais', 'file-de-frango-empanado', 'Filé de frango empanado', 'add', 10.00, false, 1),
('1720928', 'adicionais', 'bife-empanado', 'Bife empanado', 'add', 10.00, false, 2),
('1398646', 'escolha-sua-bebida', 'coca-cola', 'coca cola', 'set', 8.00, false, 1),
('1398646', 'escolha-sua-bebida', 'coca-cola-zero', 'coca cola zero', 'set', 8.00, false, 2),
('1398646', 'escolha-sua-bebida', 'guarana', 'guarana', 'set', 8.00, false, 3),
('1398646', 'escolha-sua-bebida', 'guarana-zero', 'guarana zero', 'set', 8.00, false, 4),
('1398646', 'escolha-sua-bebida', 'fanta-laranja', 'fanta laranja', 'set', 8.00, false, 5),
('1398646', 'escolha-sua-bebida', 'suco-de-laranja', 'suco de laranja', 'set', 12.00, false, 6),
('1398646', 'escolha-sua-bebida', 'suco-de-morango', 'suco de morango', 'set', 12.00, false, 7),
('1398646', 'escolha-sua-bebida', 'suco-de-maracuja', 'suco de maracuja', 'set', 12.00, false, 8),
('1398646', 'escolha-sua-bebida', 'suco-de-manga-500ml', 'Suco de Manga 500ml', 'set', 12.00, false, 9),
('1398646', 'escolha-sua-bebida', 'suco-de-abacaxi', 'suco de abacaxi', 'set', 12.00, false, 10);

-- ------------------------------------------------------------
-- 5) LOCALIZA OS PRODUTOS NO BANCO ATUAL
-- Primeiro por slug; se necessário, tenta nome normalizado.
-- A categoria e o tamanho protegem contra associação errada.
-- ------------------------------------------------------------
create temp table tmp_paid_resolved as
select
    m.source_product_id,
    m.source_name,
    chosen.id as product_id,
    chosen.name as matched_name,
    chosen.slug as matched_slug,
    chosen.size as matched_size,
    chosen.category_name,
    chosen.category_slug
from tmp_paid_product_map m
left join lateral (
    select
        p.id,
        p.name,
        p.slug,
        p.size,
        c.name as category_name,
        c.slug as category_slug
    from public.products p
    join public.categories c
      on c.id = p.category_id
    where c.slug = m.target_category_slug
      and (
          p.slug = any(m.slug_candidates)
          or exists (
              select 1
              from unnest(m.name_candidates) n(candidate_name)
              where pg_temp.cantinho_norm(p.name)
                    = pg_temp.cantinho_norm(n.candidate_name)
          )
      )
      and (
          m.target_size is null
          or upper(coalesce(p.size, '')) = upper(m.target_size)
      )
    order by
        case when p.slug = any(m.slug_candidates) then 0 else 1 end,
        p.updated_at desc,
        p.id
    limit 1
) chosen on true;

-- ------------------------------------------------------------
-- 6) CADASTRA/ATUALIZA OS GRUPOS
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
from tmp_paid_group_seed g
join tmp_paid_resolved r
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
-- 7) CADASTRA/ATUALIZA AS OPÇÕES E OS PREÇOS
-- ------------------------------------------------------------
insert into public.product_options (
    group_id,
    code,
    name,
    price_mode,
    price_value,
    is_none_option,
    allow_quantity,
    max_quantity,
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
    (o.group_code = 'adicionais' and not o.is_none_option and o.price_mode = 'add'),
    null,
    o.sort_order,
    true
from tmp_paid_option_seed o
join tmp_paid_resolved r
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
    allow_quantity = excluded.allow_quantity,
    max_quantity = excluded.max_quantity,
    sort_order = excluded.sort_order,
    active = true;

commit;

-- ============================================================
-- CONFERÊNCIA FINAL
-- ============================================================

-- O IDEAL É:
-- produtos_esperados = 13
-- produtos_encontrados = 13
-- produtos_nao_encontrados = 0
-- grupos_esperados = 13
-- opcoes_esperadas = 43
select
    (select count(*) from tmp_paid_product_map) as produtos_esperados,
    (select count(*) from tmp_paid_resolved where product_id is not null) as produtos_encontrados,
    (select count(*) from tmp_paid_resolved where product_id is null) as produtos_nao_encontrados,
    (
        select count(*)
        from tmp_paid_group_seed g
        join tmp_paid_resolved r using (source_product_id)
        where r.product_id is not null
    ) as grupos_esperados_dos_encontrados,
    (
        select count(*)
        from tmp_paid_option_seed o
        join tmp_paid_resolved r using (source_product_id)
        where r.product_id is not null
    ) as opcoes_esperadas_dos_encontrados;

-- Mostra produto por produto.
select
    r.source_product_id as mepe_id,
    r.source_name as produto_do_relatorio,
    r.matched_name as produto_no_supabase,
    r.matched_slug as slug_no_supabase,
    r.matched_size as tamanho,
    case when r.product_id is null then 'NAO ENCONTRADO' else 'OK' end as status
from tmp_paid_resolved r
order by
    case when r.product_id is null then 0 else 1 end,
    r.source_name;

-- Mostra exatamente o que ficou gravado para esses produtos.
select
    p.name as produto,
    p.slug,
    p.size,
    g.name as grupo,
    g.selection_type as tipo,
    g.required as obrigatorio,
    o.name as opcao,
    o.price_mode,
    o.price_value as valor,
    o.active
from tmp_paid_resolved r
join public.products p
  on p.id = r.product_id
join public.product_option_groups g
  on g.product_id = p.id
join public.product_options o
  on o.group_id = g.id
where r.product_id is not null
  and exists (
      select 1
      from tmp_paid_group_seed gs
      where gs.source_product_id = r.source_product_id
        and gs.group_code = g.code
  )
order by p.name, p.size nulls first, g.sort_order, o.sort_order;
