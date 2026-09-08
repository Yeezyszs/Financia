-- =====================================================================
-- Saldo: o app passa a saber quanto existe, não só quanto se moveu.
--
-- Sem estoque não há reserva de emergência, que é o indicador nº 1 de
-- saúde financeira ("quantos meses eu sobrevivo sem renda"). O Financia
-- importa CSV esporádico e nunca vai ter saldo em tempo real, então o
-- modelo é âncora + movimento: alguém diz quanto havia numa data, e as
-- transações posteriores levam esse número até hoje.
--
-- A âncora é uma linha por (conta, data) e não um campo em `accounts`
-- porque as duas fontes convivem: o que a pessoa digita e o que o
-- extrato traz. Guardar só o último apagaria o histórico e impediria
-- recalcular quando uma transação antiga é corrigida.
-- =====================================================================

create table account_balances (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users (id) on delete cascade,
  account_id    uuid not null references accounts (id) on delete cascade,
  -- Saldo ao fim deste dia: as transações do próprio dia já estão nele.
  on_date       date not null,
  -- Pode ser negativo: conta no vermelho é um saldo como outro qualquer.
  balance_cents bigint not null,
  source        text not null check (source in ('manual', 'statement')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint account_balances_unique_per_day unique (account_id, on_date)
);

create index account_balances_lookup_idx
  on account_balances (user_id, account_id, on_date desc);

create trigger account_balances_set_updated_at
  before update on account_balances
  for each row execute function set_updated_at();

alter table account_balances enable row level security;

create policy account_balances_owner on account_balances
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on account_balances to authenticated;
