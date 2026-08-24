-- =====================================================================
-- Atualiza o seed para o conjunto enxuto de categorias.
--
-- As regras de sistema acompanham: mercado vai para Alimentação,
-- combustível para Abastecimento, e o que não cabe em nenhuma das sete
-- despesas fica sem regra — melhor entrar sem categoria e ser corrigido
-- (o que vira aprendizado) do que ser jogado em "Outros gastos" e sumir.
-- =====================================================================

create or replace function seed_user_defaults(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat record;
  v_rule record;
  v_category_id uuid;
begin
  for v_cat in
    select * from (values
      ('Salário',        'income'::category_kind,  '#22c55e'),
      ('Renda extra',    'income'::category_kind,  '#4ade80'),
      ('Rendimentos',    'income'::category_kind,  '#16a34a'),
      ('Reembolsos',     'income'::category_kind,  '#86efac'),
      ('Outras receitas','income'::category_kind,  '#bbf7d0'),
      ('Alimentação',    'expense'::category_kind, '#f97316'),
      ('Lazer',          'expense'::category_kind, '#ec4899'),
      ('Parcelas',       'expense'::category_kind, '#a855f7'),
      ('Abastecimento',  'expense'::category_kind, '#3b82f6'),
      ('Educação',       'expense'::category_kind, '#06b6d4'),
      ('Investimentos',  'expense'::category_kind, '#0ea5e9'),
      ('Outros gastos',  'expense'::category_kind, '#64748b'),
      ('Transferências', 'transfer'::category_kind,'#94a3b8')
    ) as c(name, kind, color)
  loop
    insert into categories (user_id, name, kind, color, is_system)
    values (p_user_id, v_cat.name, v_cat.kind, v_cat.color, true)
    on conflict (user_id, name) do nothing;
  end loop;

  for v_rule in
    select * from (values
      ('ifood',              'Alimentação',    10),
      ('rappi',              'Alimentação',    10),
      ('restaurante',        'Alimentação',    20),
      ('padaria',            'Alimentação',    20),
      ('supermercado',       'Alimentação',    10),
      ('atacad',             'Alimentação',    10),
      ('assai',              'Alimentação',    10),
      ('carrefour',          'Alimentação',    10),
      ('posto',              'Abastecimento',  10),
      ('ipiranga',           'Abastecimento',  10),
      ('shell',              'Abastecimento',  10),
      ('netflix',            'Lazer',          10),
      ('spotify',            'Lazer',          10),
      ('cinema',             'Lazer',          20),
      ('faculdade',          'Educação',       10),
      ('curso',              'Educação',       20),
      ('salario',            'Salário',        10),
      ('salário',            'Salário',        10),
      ('rendimento',         'Rendimentos',    10),
      ('pagamento de fatura','Transferências',  1),
      ('pagamento recebido', 'Transferências',  1)
    ) as r(pattern, category_name, priority)
  loop
    select id into v_category_id
      from categories
     where user_id = p_user_id and name = v_rule.category_name;

    if v_category_id is not null then
      insert into category_rules (user_id, category_id, pattern, match_type, priority, source)
      values (p_user_id, v_category_id, v_rule.pattern, 'contains', v_rule.priority, 'system')
      on conflict (user_id, pattern, match_type, account_id) do nothing;
    end if;
  end loop;
end;
$$;
