-- =====================================================================
-- A parcela que a pessoa sabe ter pago, e o extrato não conta.
--
-- Até aqui, "paga" queria dizer uma só coisa: existe uma transação
-- ligada a esta parcela. Isso cobre o parcelamento que nasce dentro do
-- app e é alimentado pela importação — mas não cobre o caso mais comum
-- de todos, que é cadastrar uma compra que já vem sendo paga há meses,
-- de faturas que nunca foram importadas.
--
-- Sem este campo, a alternativa seria inventar transações para
-- representar cobranças que ninguém tem — poluindo o extrato, que é
-- registro de fato, com dado digitado de memória. O extrato continua
-- sendo só o que o banco disse; a baixa manual mora aqui.
--
-- Uma parcela está paga quando tem transação ligada OU está marcada
-- aqui. As duas coisas convivem: marcar como paga não impede o
-- reconhecimento automático de encontrar a cobrança depois.
-- =====================================================================

alter table installments
  add column if not exists settled boolean not null default false;
