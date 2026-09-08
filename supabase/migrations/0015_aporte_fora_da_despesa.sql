-- =====================================================================
-- Consequências do kind 'saving' (ver 0014).
--
-- A série mensal soma por sinal, sem olhar categoria, então é aqui que a
-- exclusão precisa acontecer — no total por categoria quem separa é o
-- caso de uso, que já recebe uma linha por categoria.
-- =====================================================================

-- A assinatura ganhou uma coluna, e `create or replace` não muda o tipo
-- de retorno de uma função que já existe.
drop function if exists transactions_monthly_totals(uuid, int);

create function transactions_monthly_totals(
  p_user_id uuid,
  p_year    int
)
returns table (month text, income_cents bigint, expense_cents bigint, saving_cents bigint)
language sql
stable
set search_path = public
as $$
  select to_char(t.occurred_on, 'YYYY-MM') as month,
         coalesce(sum(t.amount_cents) filter (
           where t.amount_cents > 0 and coalesce(c.kind, 'expense') <> 'saving'
         ), 0)::bigint as income_cents,
         coalesce(sum(-t.amount_cents) filter (
           where t.amount_cents < 0 and coalesce(c.kind, 'expense') <> 'saving'
         ), 0)::bigint as expense_cents,
         -- Líquido, e com o sinal invertido: aporte entra positivo e um
         -- resgate abate. Somar em módulo faria resgatar parecer guardar.
         coalesce(sum(-t.amount_cents) filter (
           where coalesce(c.kind, 'expense') = 'saving'
         ), 0)::bigint as saving_cents
    from transactions t
    left join categories c on c.id = t.category_id
   where t.user_id = p_user_id
     and not t.is_transfer
     and extract(year from t.occurred_on) = p_year
   group by 1
   order by 1;
$$;

revoke execute on function transactions_monthly_totals(uuid, int) from anon, public;
grant execute on function transactions_monthly_totals(uuid, int) to authenticated;

-- Investimentos passa a ser aporte. É a categoria que motivou tudo isto.
update categories set kind = 'saving', updated_at = now() where name = 'Investimentos';
