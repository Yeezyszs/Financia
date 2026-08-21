-- =====================================================================
-- transactions_totals_by_category passa a devolver entrada e saída
-- separadas.
--
-- Somar com sinal dentro da categoria distorce o total: uma categoria
-- com estorno (compra -100 + estorno +100) somava zero, e uma com
-- estorno maior que a compra virava "receita". Separando os dois lados,
-- despesa é despesa e estorno é estorno.
-- =====================================================================

drop function if exists transactions_totals_by_category(uuid, date, date, uuid[]);

create function transactions_totals_by_category(
  p_user_id     uuid,
  p_from        date default null,
  p_to          date default null,
  p_account_ids uuid[] default null
)
returns table (
  category_id  uuid,
  income_cents bigint,
  expense_cents bigint,
  tx_count     bigint
)
language sql
stable
set search_path = public
as $$
  select t.category_id,
         coalesce(sum(t.amount_cents) filter (where t.amount_cents > 0), 0)::bigint  as income_cents,
         coalesce(sum(-t.amount_cents) filter (where t.amount_cents < 0), 0)::bigint as expense_cents,
         count(*)::bigint as tx_count
    from transactions t
   where t.user_id = p_user_id
     and not t.is_transfer
     and (p_from is null or t.occurred_on >= p_from)
     and (p_to   is null or t.occurred_on <= p_to)
     and (p_account_ids is null or t.account_id = any (p_account_ids))
   group by t.category_id;
$$;

revoke execute on function transactions_totals_by_category(uuid, date, date, uuid[])
  from anon, authenticated, public;
