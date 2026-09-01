-- ============================================================
-- CANTINHO DO PETISCO - V9
-- MIGRAÇÃO: QUANTIDADE POR ADICIONAL
--
-- Objetivo:
--   - adicional pode ter quantidade própria (ex.: 3 ovos, 2 arrozes);
--   - por padrão, opções do grupo "Adicionais" ficam com quantidade
--     habilitada e SEM limite;
--   - no ADM é possível desativar quantidade ou informar um limite;
--   - sabores / escolha única continuam funcionando normalmente.
--
-- Pode executar novamente: a migração não duplica colunas e NÃO
-- sobrescreve configurações de quantidade já feitas no ADM após a
-- primeira instalação.
-- ============================================================

reset role;

begin;

do $$
declare
    v_added_allow boolean := false;
begin
    if to_regclass('public.product_options') is null then
        raise exception 'Tabela public.product_options não existe. Rode primeiro MIGRACAO_OPCOES_ADICIONAIS.sql.';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'product_options'
          and column_name = 'allow_quantity'
    ) then
        alter table public.product_options
            add column allow_quantity boolean not null default false;
        v_added_allow := true;
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'product_options'
          and column_name = 'max_quantity'
    ) then
        alter table public.product_options
            add column max_quantity integer;
    end if;

    -- Só faz a configuração automática na PRIMEIRA inclusão da coluna.
    -- Assim, se o usuário alterar no ADM e executar este SQL de novo,
    -- a preferência dele não é sobrescrita.
    if v_added_allow then
        update public.product_options o
        set
            allow_quantity = (
                not o.is_none_option
                and coalesce(o.price_mode, 'add') = 'add'
                and exists (
                    select 1
                    from public.product_option_groups g
                    where g.id = o.group_id
                      and (
                          lower(coalesce(g.code, '')) like '%adicion%'
                          or lower(coalesce(g.name, '')) like '%adicion%'
                      )
                )
            ),
            max_quantity = null;
    end if;
end
$$;

alter table public.product_options
    drop constraint if exists product_options_max_quantity_check;

alter table public.product_options
    add constraint product_options_max_quantity_check
    check (max_quantity is null or max_quantity >= 1);

commit;

-- ============================================================
-- CONFERÊNCIA FINAL
-- ============================================================
select
    count(*) filter (where o.allow_quantity = true) as opcoes_com_quantidade,
    count(*) filter (where o.allow_quantity = true and o.max_quantity is null) as quantidade_ilimitada,
    count(*) filter (where o.allow_quantity = true and o.max_quantity is not null) as quantidade_com_limite
from public.product_options o;

-- Lista as opções que ficaram com quantidade habilitada.
select
    p.name as produto,
    p.size,
    g.name as grupo,
    o.name as opcao,
    o.price_value as valor_unitario,
    o.allow_quantity as permite_quantidade,
    case
        when o.max_quantity is null then 'ILIMITADO'
        else o.max_quantity::text
    end as limite
from public.product_options o
join public.product_option_groups g on g.id = o.group_id
join public.products p on p.id = g.product_id
where o.allow_quantity = true
order by p.name, p.size nulls first, g.sort_order, o.sort_order;
