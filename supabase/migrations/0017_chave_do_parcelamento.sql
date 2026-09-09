-- =====================================================================
-- A chave que liga a compra parcelada às linhas dela na fatura.
--
-- As tabelas de parcelamento existem desde a 0002 e nunca foram usadas.
-- Faltava isto: um campo de casamento separado da descrição. A descrição
-- é para ler ("Notebook da Bia"), a chave é para casar — e as duas
-- precisam poder divergir, senão renomear o plano quebraria o vínculo
-- com as parcelas que ainda vão chegar.
--
-- Quando o plano nasce a partir de uma transação já importada, a chave
-- vem do descritor do banco e o casamento é exato. Quando nasce digitado,
-- vem do que a pessoa escreveu — e aí o vínculo depende de o nome se
-- parecer com o que a fatura publica.
-- =====================================================================

alter table installment_plans
  add column if not exists merchant_key text not null default '';

create index if not exists installment_plans_key_idx
  on installment_plans (user_id, merchant_key);
