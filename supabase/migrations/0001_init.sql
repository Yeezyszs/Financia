-- =====================================================================
-- Financia — schema inicial (Fase 1: Fundação)
-- Single-user hoje, mas TUDO carrega user_id desde o início para que
-- multiusuário seja só uma questão de UI/convite no futuro.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type account_type as enum ('checking', 'credit_card');
create type institution  as enum ('nubank', 'c6', 'manual');
create type category_kind as enum ('income', 'expense', 'transfer');
create type rule_match_type as enum ('contains', 'exact', 'regex');
create type import_status as enum ('pending', 'completed', 'failed');

-- ---------------------------------------------------------------------
-- users
-- Espelha auth.users do Supabase. O app nunca escreve direto em auth.
-- ---------------------------------------------------------------------
create table users (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null unique,
  name       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- accounts
-- Conta corrente e fatura do cartão são contas SEPARADAS (ver dedupe e
-- reconciliação de pagamento de fatura).
-- ---------------------------------------------------------------------
create table accounts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id) on delete cascade,
  name         text not null,
  type         account_type not null,
  institution  institution not null default 'nubank',
  currency     char(3) not null default 'BRL',
  -- Conta de pagamento associada: para uma account do tipo credit_card,
  -- aponta para a conta corrente que quita a fatura. Usado na
  -- reconciliação fatura x conta corrente.
  settlement_account_id uuid references accounts (id) on delete set null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint accounts_name_unique_per_user unique (user_id, name)
);
create index accounts_user_idx on accounts (user_id) where is_active;

-- ---------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------
create table categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  name       text not null,
  kind       category_kind not null default 'expense',
  color      text,
  icon       text,
  -- categorias criadas pelo seed do sistema (não deletáveis pela UI)
  is_system  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_unique_per_user unique (user_id, name)
);
create index categories_user_idx on categories (user_id);

-- ---------------------------------------------------------------------
-- category_rules
-- Motor de categorização automática. `priority` menor = avaliada antes.
-- Quando o usuário corrige a categoria de uma transação, a UI oferece
-- "lembrar para títulos parecidos" -> cria uma regra com source='learned'.
-- ---------------------------------------------------------------------
create table category_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  pattern     text not null,
  match_type  rule_match_type not null default 'contains',
  -- opcional: restringe a regra a uma conta específica
  account_id  uuid references accounts (id) on delete cascade,
  priority    int not null default 100,
  source      text not null default 'manual' check (source in ('manual', 'learned', 'system')),
  hit_count   int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- nulls not distinct: account_id NULL (regra global) também precisa ser única
  constraint category_rules_pattern_unique_per_user unique nulls not distinct (user_id, pattern, match_type, account_id)
);
create index category_rules_lookup_idx on category_rules (user_id, priority) where is_active;

-- ---------------------------------------------------------------------
-- imports
-- Histórico de importações (tela "Histórico"). file_hash evita reimportar
-- exatamente o mesmo arquivo por acidente.
-- ---------------------------------------------------------------------
create table imports (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users (id) on delete cascade,
  account_id       uuid not null references accounts (id) on delete cascade,
  filename         text not null,
  file_hash        text not null,
  status           import_status not null default 'pending',
  rows_total       int not null default 0,
  rows_imported    int not null default 0,
  rows_duplicated  int not null default 0,
  period_start     date,
  period_end       date,
  error_message    text,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz,
  constraint imports_file_unique_per_account unique (user_id, account_id, file_hash)
);
create index imports_user_created_idx on imports (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- transactions
-- amount_cents: inteiro em centavos, com sinal (negativo = saída).
-- fingerprint: hash de account_id + date + description normalizada +
-- amount + ordinal de repetição. É a chave de dedupe, já que o CSV do
-- Nubank não traz ID nativo.
-- ---------------------------------------------------------------------
create table transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users (id) on delete cascade,
  account_id    uuid not null references accounts (id) on delete cascade,
  import_id     uuid references imports (id) on delete set null,
  category_id   uuid references categories (id) on delete set null,

  occurred_on   date not null,
  description   text not null,
  amount_cents  bigint not null,

  -- Reconciliação fatura x conta corrente: quando a transação é o
  -- pagamento da fatura (ou a quitação do lado do cartão), ela é marcada
  -- como transferência e NÃO entra no somatório de despesas.
  is_transfer   boolean not null default false,
  counterpart_transaction_id uuid references transactions (id) on delete set null,

  -- como a categoria foi definida
  categorized_by text not null default 'uncategorized'
    check (categorized_by in ('uncategorized', 'rule', 'manual')),
  applied_rule_id uuid references category_rules (id) on delete set null,

  source        text not null default 'import' check (source in ('import', 'manual')),
  fingerprint   text not null,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint transactions_amount_not_zero check (amount_cents <> 0),
  constraint transactions_fingerprint_unique unique (user_id, fingerprint)
);
create index transactions_user_date_idx on transactions (user_id, occurred_on desc);
create index transactions_account_date_idx on transactions (account_id, occurred_on desc);
create index transactions_category_idx on transactions (user_id, category_id);
create index transactions_import_idx on transactions (import_id);
-- busca textual simples na listagem
create index transactions_description_trgm_idx on transactions using gin (description gin_trgm_ops);

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['users','accounts','categories','category_rules','transactions'] loop
    execute format(
      'create trigger %I_set_updated_at before update on %I
       for each row execute function set_updated_at()', t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Row Level Security — isolamento por user_id desde já
-- ---------------------------------------------------------------------
alter table users          enable row level security;
alter table accounts       enable row level security;
alter table categories     enable row level security;
alter table category_rules enable row level security;
alter table imports        enable row level security;
alter table transactions   enable row level security;

create policy users_self_access on users
  for all using (auth.uid() = id) with check (auth.uid() = id);

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','category_rules','imports','transactions'] loop
    execute format(
      'create policy %I_owner_access on %I
         for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
  end loop;
end;
$$;
