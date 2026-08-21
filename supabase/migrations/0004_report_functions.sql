-- =====================================================================
-- Agregações do dashboard. Ficam no banco para não trafegar N transações
-- só para somar. Transferências (pagamento de fatura) são excluídas.
-- =====================================================================

create or replace function transactions_totals_by_category(
  p_user_id     uuid,
  p_from        date default null,
  p_to          date default null,
  p_account_ids uuid[] default null
)
returns table (category_id uuid, total_cents bigint, tx_count bigint)
language sql
stable
set search_path = public
as $$
  select t.category_id,
         sum(t.amount_cents)::bigint as total_cents,
         count(*)::bigint            as tx_count
    from transactions t
   where t.user_id = p_user_id
     and not t.is_transfer
     and (p_from is null or t.occurred_on >= p_from)
     and (p_to   is null or t.occurred_on <= p_to)
     and (p_account_ids is null or t.account_id = any (p_account_ids))
   group by t.category_id;
$$;

create or replace function transactions_monthly_totals(
  p_user_id uuid,
  p_year    int
)
returns table (month text, income_cents bigint, expense_cents bigint)
language sql
stable
set search_path = public
as $$
  select to_char(t.occurred_on, 'YYYY-MM') as month,
         coalesce(sum(t.amount_cents) filter (where t.amount_cents > 0), 0)::bigint as income_cents,
         coalesce(sum(-t.amount_cents) filter (where t.amount_cents < 0), 0)::bigint as expense_cents
    from transactions t
   where t.user_id = p_user_id
     and not t.is_transfer
     and extract(year from t.occurred_on) = p_year
   group by 1
   order by 1;
$$;
