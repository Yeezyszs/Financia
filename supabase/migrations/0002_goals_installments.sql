-- =====================================================================
-- Metas e Parcelas — tabelas mínimas para as telas do protótipo.
-- Ficam como stub no MVP: schema pronto, sem regra de negócio pesada.
-- =====================================================================

create table goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users (id) on delete cascade,
  name           text not null,
  target_cents   bigint not null check (target_cents > 0),
  saved_cents    bigint not null default 0,
  due_on         date,
  is_archived    boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint goals_name_unique_per_user unique (user_id, name)
);
create index goals_user_idx on goals (user_id) where not is_archived;

-- Compra parcelada: um "pai" com o total, e cada parcela referenciando
-- a transação que a representa na fatura (quando ela for importada).
create table installment_plans (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users (id) on delete cascade,
  account_id     uuid not null references accounts (id) on delete cascade,
  description    text not null,
  total_cents    bigint not null check (total_cents > 0),
  installments   int not null check (installments > 1),
  first_charge_on date not null,
  category_id    uuid references categories (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index installment_plans_user_idx on installment_plans (user_id);

create table installments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users (id) on delete cascade,
  plan_id        uuid not null references installment_plans (id) on delete cascade,
  number         int not null check (number > 0),
  due_on         date not null,
  amount_cents   bigint not null check (amount_cents > 0),
  transaction_id uuid references transactions (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint installments_number_unique_per_plan unique (plan_id, number)
);
create index installments_user_due_idx on installments (user_id, due_on);

do $$
declare t text;
begin
  foreach t in array array['goals','installment_plans'] loop
    execute format(
      'create trigger %I_set_updated_at before update on %I
       for each row execute function set_updated_at()', t, t);
  end loop;

  foreach t in array array['goals','installment_plans','installments'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_owner_access on %I
         for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
  end loop;
end;
$$;
