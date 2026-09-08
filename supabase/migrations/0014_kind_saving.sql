-- =====================================================================
-- Aporte não é gasto.
--
-- Até aqui uma compra de Tesouro Direto entrava na despesa, porque o
-- valor é negativo. Mas dinheiro que sai da conta e vira patrimônio não
-- foi consumido — foi trocado de bolso. Misturar os dois faz a taxa de
-- poupança aparecer como uma fração do que é: nos dados de agosto/2026,
-- 18% no lugar de 63%.
--
-- O novo `kind` fica isolado nesta migration porque o Postgres não deixa
-- usar um valor de enum na mesma transação que o criou.
-- =====================================================================

alter type category_kind add value if not exists 'saving';
