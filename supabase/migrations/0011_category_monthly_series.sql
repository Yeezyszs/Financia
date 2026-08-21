-- =====================================================================
-- Série mensal por categoria — a base de "quanto isso mudou desde
-- maio", que os totais de um mês só não respondem.
--
-- Fica no banco pela mesma razão das outras agregações: somar 2 mil
-- linhas no Postgres é barato, trafegá-las até o Node para somar em
-- memória não é.
-- =====================================================================

create or replace function transactions_category_series(
  p_user_id uuid,
  p_from    date,
  p_to      date
)
returns table (
  month         text,
  category_id   uuid,
  income_cents  bigint,
  expense_cents bigint,
  tx_count      bigint
)
language sql
stable
set search_path = public
as $$
  select to_char(t.occurred_on, 'YYYY-MM') as month,
         t.category_id,
         coalesce(sum(t.amount_cents) filter (where t.amount_cents > 0), 0)::bigint  as income_cents,
         coalesce(sum(-t.amount_cents) filter (where t.amount_cents < 0), 0)::bigint as expense_cents,
         count(*)::bigint as tx_count
    from transactions t
   where t.user_id = p_user_id
     and not t.is_transfer
     and t.occurred_on between p_from and p_to
   group by 1, 2
   order by 1, 2;
$$;

grant execute on function transactions_category_series(uuid, date, date) to authenticated;
