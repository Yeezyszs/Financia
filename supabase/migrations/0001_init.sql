-- Financia - schema inicial
-- Convencoes:
--   * dinheiro sempre em centavos (bigint). Nunca float/numeric com casas.
--   * owner_id aponta para auth.users: multi-usuario ja preparado, sem custo hoje.
--   * RLS ligada em tudo desde o inicio - ligar depois exige reauditar cada query.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- accounts
create type account_type as enum ('conta_corrente', 'cartao_credito');

create table accounts (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  institution  text not null check (length(trim(institution)) > 0),
  type         account_type not null,
  last4        text check (last4 ~ '^[0-9]{4}$'),
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);

create index accounts_owner_idx on accounts (owner_id) where archived = false;

-- -------------------------------------------------------------- categories
create table categories (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  is_fallback boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (owner_id, name)
);

-- Exatamente uma categoria fallback por usuario: sem ela a ingestao trava.
create unique index categories_single_fallback_idx
  on categories (owner_id) where is_fallback;

-- Regra de categorizacao. `match` guardado ja normalizado (upper, sem acento)
-- pela mesma funcao que normaliza o estabelecimento na hora de comparar.
create table category_rules (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories (id) on delete cascade,
  match       text not null check (length(trim(match)) > 0),
  learned     boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (category_id, match)
);

create index category_rules_category_idx on category_rules (category_id);

-- ----------------------------------------------------------- email_sources
create table email_sources (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  account_id       uuid not null references accounts (id) on delete cascade,
  institution      text not null,
  -- Resolve qual EmailParser roda. Casa com EmailParser.institution no codigo.
  parser_strategy  text not null,
  -- Allowlist de remetentes: barra e-mail de phishing imitando o banco.
  from_addresses   text[] not null check (array_length(from_addresses, 1) > 0),
  subject_contains text,
  enabled          boolean not null default true,
  -- Ultimo historyId do Gmail processado. E daqui que o sync incremental parte.
  last_history_id  text,
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now()
);

create index email_sources_owner_enabled_idx on email_sources (owner_id) where enabled;

-- ------------------------------------------------------------ transactions
create type transaction_status as enum ('pendente', 'categorizada', 'conciliada');
create type transaction_kind   as enum ('purchase', 'refund');
create type transaction_origin as enum ('email', 'manual');

create table transactions (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users (id) on delete cascade,
  account_id        uuid not null references accounts (id) on delete restrict,
  category_id       uuid references categories (id) on delete set null,
  amount_cents      bigint not null,
  currency          text not null default 'BRL',
  merchant          text not null check (length(trim(merchant)) > 0),
  occurred_at       timestamptz not null,
  kind              transaction_kind not null default 'purchase',
  status            transaction_status not null default 'pendente',
  origin            transaction_origin not null default 'email',
  -- Message-ID do Gmail. NULL quando lancamento manual.
  raw_source_id     text,
  -- Estorno aponta para a compra original; a compra nunca e deletada.
  reversal_of_id    uuid references transactions (id) on delete set null,
  installment_current smallint,
  installment_total   smallint,
  created_at        timestamptz not null default now(),

  -- Sinal coerente com o tipo: compra positiva, estorno negativo.
  constraint transactions_sign_matches_kind check (
    (kind = 'purchase' and amount_cents >= 0) or
    (kind = 'refund'   and amount_cents <  0)
  ),
  constraint transactions_installment_pair check (
    (installment_current is null) = (installment_total is null)
  )
);

-- ESTA e a garantia de idempotencia da ingestao. Nao e o SELECT-antes-do-INSERT
-- no codigo: dois jobs concorrentes (cron + webhook do Pub/Sub) passariam pelo
-- SELECT ao mesmo tempo e gravariam duplicado. O indice nao deixa.
create unique index transactions_raw_source_unique_idx
  on transactions (owner_id, raw_source_id) where raw_source_id is not null;

create index transactions_owner_date_idx on transactions (owner_id, occurred_at desc);
create index transactions_account_date_idx on transactions (account_id, occurred_at desc);
create index transactions_pending_idx on transactions (owner_id) where status = 'pendente';

-- ------------------------------------------------------------------- RLS
alter table accounts       enable row level security;
alter table categories     enable row level security;
alter table category_rules enable row level security;
alter table email_sources  enable row level security;
alter table transactions   enable row level security;

create policy accounts_owner on accounts
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy categories_owner on categories
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy email_sources_owner on email_sources
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy transactions_owner on transactions
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- category_rules nao tem owner_id proprio: herda pela categoria.
create policy category_rules_owner on category_rules
  for all using (
    exists (select 1 from categories c where c.id = category_id and c.owner_id = auth.uid())
  ) with check (
    exists (select 1 from categories c where c.id = category_id and c.owner_id = auth.uid())
  );
