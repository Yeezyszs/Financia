-- O historyId do Gmail e por CAIXA DE E-MAIL, nao por fonte: uma unica
-- notificacao do Pub/Sub cobre Nubank e C6 ao mesmo tempo. Guardar o
-- checkpoint em email_sources faria cada fonte avancar o cursor por conta
-- propria e engolir os e-mails da outra.

create table gmail_sync_state (
  owner_id         uuid primary key references auth.users (id) on delete cascade,
  email_address    text not null,
  -- Ponto de partida do proximo sync incremental.
  history_id       text,
  -- O watch do Gmail morre em 7 dias; o cron diario renova antes disso.
  watch_expires_at timestamptz,
  updated_at       timestamptz not null default now()
);

alter table gmail_sync_state enable row level security;

create policy gmail_sync_state_owner on gmail_sync_state
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Redundante agora que o checkpoint vive em gmail_sync_state.
alter table email_sources drop column if exists last_history_id;
