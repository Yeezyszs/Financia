-- Extrato importado nao e nem e-mail nem lancamento manual. Sem valor proprio,
-- a procedencia da transacao se perde - e ela decide, por exemplo, se o valor
-- e provisorio (aviso de compra) ou final (o que o banco cobrou).
alter type transaction_origin add value if not exists 'statement';
