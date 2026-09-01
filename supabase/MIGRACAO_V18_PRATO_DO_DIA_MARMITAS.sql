-- ============================================================
-- CANTINHO DO PETISCO — V19
-- PRATO DO DIA COM VÁRIAS MARMITAS + ADICIONAIS PADRÃO
--
-- Execute UMA VEZ no SQL Editor do Supabase.
-- Pode ser executado novamente: operações principais são idempotentes.
-- ============================================================

reset role;
begin;

-- ------------------------------------------------------------
-- 1) PRATO DO DIA: permitir vários pratos no mesmo dia
-- ------------------------------------------------------------
alter table public.daily_specials
    drop constraint if exists daily_specials_weekday_key;

drop index if exists public.daily_specials_weekday_unique_idx;

create unique index if not exists daily_specials_weekday_product_unique_idx
    on public.daily_specials(weekday, product_id);

create index if not exists daily_specials_weekday_active_idx
    on public.daily_specials(weekday, active);

-- ------------------------------------------------------------
-- 2) Garantir suporte de quantidade por adicional
-- ------------------------------------------------------------
alter table public.product_options
    add column if not exists allow_quantity boolean not null default false;

alter table public.product_options
    add column if not exists max_quantity integer;

alter table public.product_options
    drop constraint if exists product_options_max_quantity_check;

alter table public.product_options
    add constraint product_options_max_quantity_check
    check (max_quantity is null or max_quantity >= 1);

-- ------------------------------------------------------------
-- 3) ARROZ CARRETEIRO — Marmita M e G
-- ------------------------------------------------------------
do $$
declare
    v_cat uuid;
begin
    select id into v_cat
    from public.categories
    where lower(slug) = 'marmitas'
    limit 1;

    if v_cat is null then
        raise exception 'Categoria Marmitas não encontrada.';
    end if;

    insert into public.products
        (category_id, name, slug, size, description, price, image_path,
         active, available, featured, sort_order)
    values
        (v_cat, 'Arroz carreteiro', 'arroz-carreteiro-m', 'M', null, 24.99, null, true, true, false, 900),
        (v_cat, 'Arroz carreteiro', 'arroz-carreteiro-g', 'G', null, 29.99, null, true, true, false, 901)
    on conflict (category_id, slug) do update
    set name = excluded.name,
        size = excluded.size,
        price = excluded.price,
        active = true,
        available = true;
end
$$;

-- ------------------------------------------------------------
-- 4) ADICIONAIS PARA TODAS AS MARMITAS
--
-- Todas, exceto Feijoada:
--   Nenhum; Ovo 3; Frango empanado 10; Contra-filé empanado 15;
--   Porção arroz 10; Porção feijão 10; Salada pequena 3.
--
-- Feijoada recebe os mesmos + Bisteca 10 + Toscana 10.
-- O grupo é obrigatório, mas "Nenhum" é uma resposta válida.
-- Adicionais pagos aceitam quantidade própria, sem limite.
-- ------------------------------------------------------------
do $$
declare
    v_cat uuid;
    r record;
    v_group uuid;
begin
    select id into v_cat
    from public.categories
    where lower(slug) = 'marmitas'
    limit 1;

    for r in
        select id, name
        from public.products
        where category_id = v_cat
    loop
        insert into public.product_option_groups
            (product_id, code, name, selection_type, required,
             min_selections, max_selections, sort_order, active)
        values
            (r.id, 'adicionais', 'Adicionais', 'multiple', true, 1, null, 90, true)
        on conflict (product_id, code) do update
        set name='Adicionais', selection_type='multiple', required=true,
            min_selections=1, max_selections=null, sort_order=90, active=true
        returning id into v_group;

        if v_group is null then
            select id into v_group
            from public.product_option_groups
            where product_id=r.id and code='adicionais';
        end if;

        -- Evita dois grupos antigos de "Adicionais" aparecendo juntos.
        update public.product_option_groups
        set active=false
        where product_id=r.id
          and id<>v_group
          and (lower(coalesce(name,'')) like '%adicion%'
               or lower(coalesce(code,'')) like '%adicion%');

        -- Desativa opções antigas do grupo e reativa apenas a lista V19.
        update public.product_options
        set active=false
        where group_id=v_group;

        insert into public.product_options
            (group_id, code, name, price_mode, price_value,
             is_none_option, allow_quantity, max_quantity, sort_order, active)
        values
            (v_group,'nenhum','Nenhum','add',0,true,false,null,1,true),
            (v_group,'ovo','Ovo','add',3,false,true,null,2,true),
            (v_group,'frango-empanado','Frango empanado','add',10,false,true,null,3,true),
            (v_group,'contra-file-empanado','Contra filé empanado','add',15,false,true,null,4,true),
            (v_group,'porcao-arroz','Porção de arroz','add',10,false,true,null,5,true),
            (v_group,'porcao-feijao','Porção de feijão','add',10,false,true,null,6,true),
            (v_group,'salada-pequena','Salada pequena','add',3,false,true,null,7,true)
        on conflict (group_id, code) do update
        set name=excluded.name, price_mode=excluded.price_mode,
            price_value=excluded.price_value,
            is_none_option=excluded.is_none_option,
            allow_quantity=excluded.allow_quantity,
            max_quantity=excluded.max_quantity,
            sort_order=excluded.sort_order, active=true;

        if lower(r.name) like '%feijoada%' then
            insert into public.product_options
                (group_id, code, name, price_mode, price_value,
                 is_none_option, allow_quantity, max_quantity, sort_order, active)
            values
                (v_group,'bisteca','Bisteca','add',10,false,true,null,8,true),
                (v_group,'toscana','Toscana','add',10,false,true,null,9,true)
            on conflict (group_id, code) do update
            set name=excluded.name, price_mode=excluded.price_mode,
                price_value=excluded.price_value,
                is_none_option=excluded.is_none_option,
                allow_quantity=excluded.allow_quantity,
                max_quantity=excluded.max_quantity,
                sort_order=excluded.sort_order, active=true;
        end if;
    end loop;
end
$$;

-- ------------------------------------------------------------
-- 5) FRANGO COM CREME DE MILHO
-- Escolha obrigatória: Empanado ou Grelhado.
-- ------------------------------------------------------------
do $$
declare
    v_cat uuid;
    r record;
    v_group uuid;
begin
    select id into v_cat from public.categories where lower(slug)='marmitas' limit 1;

    for r in
        select id
        from public.products
        where category_id=v_cat
          and lower(name) like '%creme de milho%'
    loop
        insert into public.product_option_groups
            (product_id, code, name, selection_type, required,
             min_selections, max_selections, sort_order, active)
        values
            (r.id,'preparo','Preparo','single',true,1,1,10,true)
        on conflict (product_id, code) do update
        set name='Preparo', selection_type='single', required=true,
            min_selections=1, max_selections=1, sort_order=10, active=true
        returning id into v_group;

        if v_group is null then
            select id into v_group from public.product_option_groups
            where product_id=r.id and code='preparo';
        end if;

        insert into public.product_options
            (group_id, code, name, price_mode, price_value,
             is_none_option, allow_quantity, max_quantity, sort_order, active)
        values
            (v_group,'empanado','Empanado','add',0,false,false,null,1,true),
            (v_group,'grelhado','Grelhado','add',0,false,false,null,2,true)
        on conflict (group_id, code) do update
        set name=excluded.name, price_mode='add', price_value=0,
            is_none_option=false, allow_quantity=false,
            max_quantity=null, sort_order=excluded.sort_order, active=true;
    end loop;
end
$$;

commit;

-- ============================================================
-- CONFERÊNCIA FINAL
-- ============================================================
select
    d.weekday,
    case d.weekday
      when 0 then 'Domingo' when 1 then 'Segunda-feira'
      when 2 then 'Terça-feira' when 3 then 'Quarta-feira'
      when 4 then 'Quinta-feira' when 5 then 'Sexta-feira'
      when 6 then 'Sábado'
    end as dia,
    p.name as prato,
    p.size,
    d.active
from public.daily_specials d
join public.products p on p.id=d.product_id
order by case when d.weekday=0 then 7 else d.weekday end, p.name, p.size;

select p.name, p.size, g.name as grupo, o.name as opcao,
       o.price_value, o.allow_quantity, o.active
from public.products p
join public.categories c on c.id=p.category_id and c.slug='marmitas'
join public.product_option_groups g on g.product_id=p.id and g.active
join public.product_options o on o.group_id=g.id and o.active
where g.code in ('adicionais','preparo')
order by p.name, p.size, g.sort_order, o.sort_order;

-- OBSERVAÇÃO IMPORTANTE:
-- Os valores diferentes de Strogonoff de frango/carne ainda não foram
-- informados nesta conversa. Por segurança, esta migração NÃO inventa
-- preço para a opção Carne. O painel V19 já permite configurar esse grupo
-- obrigatório assim que os dois valores forem definidos.
