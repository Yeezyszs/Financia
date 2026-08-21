-- =====================================================================
-- Seed por usuário: categorias padrão + regras de categorização iniciais.
-- Idempotente — pode rodar de novo sem duplicar.
-- Uso: select seed_user_defaults('<user_id>');
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
      ('Outras Receitas','income'::category_kind,  '#4ade80'),
      ('Alimentação',    'expense'::category_kind, '#f97316'),
      ('Mercado',        'expense'::category_kind, '#fb923c'),
      ('Transporte',     'expense'::category_kind, '#3b82f6'),
      ('Moradia',        'expense'::category_kind, '#8b5cf6'),
      ('Saúde',          'expense'::category_kind, '#ef4444'),
      ('Educação',       'expense'::category_kind, '#06b6d4'),
      ('Lazer',          'expense'::category_kind, '#ec4899'),
      ('Assinaturas',    'expense'::category_kind, '#a855f7'),
      ('Compras',        'expense'::category_kind, '#eab308'),
      ('Serviços',       'expense'::category_kind, '#64748b'),
      ('Taxas e Juros',  'expense'::category_kind, '#dc2626'),
      ('Transferências', 'transfer'::category_kind,'#94a3b8'),
      ('Sem Categoria',  'expense'::category_kind, '#cbd5e1')
    ) as c(name, kind, color)
  loop
    insert into categories (user_id, name, kind, color, is_system)
    values (p_user_id, v_cat.name, v_cat.kind, v_cat.color, true)
    on conflict (user_id, name) do nothing;
  end loop;

  for v_rule in
    select * from (values
      ('ifood',            'Alimentação',    10),
      ('rappi',            'Alimentação',    10),
      ('restaurante',      'Alimentação',    20),
      ('padaria',          'Alimentação',    20),
      ('supermercado',     'Mercado',        10),
      ('atacad',           'Mercado',        10),
      ('assai',            'Mercado',        10),
      ('carrefour',        'Mercado',        10),
      ('uber',             'Transporte',     10),
      ('99app',            'Transporte',     10),
      ('posto',            'Transporte',     20),
      ('estacionamento',   'Transporte',     20),
      ('netflix',          'Assinaturas',    10),
      ('spotify',          'Assinaturas',    10),
      ('amazon prime',     'Assinaturas',    10),
      ('drogaria',         'Saúde',          10),
      ('farmacia',         'Saúde',          10),
      ('farmácia',         'Saúde',          10),
      ('aluguel',          'Moradia',        10),
      ('energia',          'Moradia',        20),
      ('condominio',       'Moradia',        20),
      ('salario',          'Salário',        10),
      ('salário',          'Salário',        10),
      ('pagamento de fatura','Transferências', 1),
      ('pagamento recebido','Transferências', 1)
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
