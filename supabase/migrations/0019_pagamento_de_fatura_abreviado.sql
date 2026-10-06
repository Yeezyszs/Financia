-- =====================================================================
-- O pagamento de fatura que o app do C6 escreve abreviado.
--
-- O extrato antigo dizia "PAGAMENTO DE FATURA CARTAO C6", e a regra
-- semeada em 0003 pegava. O formato que o app exporta hoje diz
-- "PGTO FAT CARTAO C6", que não casa com nada — e aí o pagamento entra
-- como despesa comum.
--
-- Isso não é um erro de rótulo, é contagem dobrada: as compras do mês
-- já contaram como gasto quando a fatura foi importada, e o pagamento
-- dela é só o dinheiro saindo da conta para quitar o que já foi contado.
-- Sem a marca de transferência, o mês inteiro aparece pior do que foi.
--
-- Vale para quem já existe, não só para quem se cadastrar depois: a
-- função de seed roda uma vez por usuário, e os usuários atuais já
-- passaram por ela.
-- =====================================================================

insert into category_rules (user_id, category_id, pattern, match_type, priority, source)
select c.user_id, c.id, r.pattern, 'contains', 1, 'system'
  from categories c
 cross join (values ('pgto fat'), ('pagto fatura'), ('pgto fatura')) as r(pattern)
 where c.name = 'Transferências'
   and c.kind = 'transfer'
on conflict (user_id, pattern, match_type, account_id) do nothing;
