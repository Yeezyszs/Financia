/** Layout do export do Nubank descrito no briefing: date,title,amount */
export const EXTRATO_ISO = `date,title,amount
2026-08-01,Transferência recebida - SALARIO EMPRESA LTDA,8500.00
2026-08-02,Compra no débito - PADARIA SAO JORGE,-18.50
2026-08-02,Compra no débito - PADARIA SAO JORGE,-18.50
2026-08-03,Pagamento de fatura,-2350.90
2026-08-04,Uber *TRIP,-27.80
`;

/** Variação com cabeçalho em português e data dd/mm/aaaa */
export const EXTRATO_BR = `Data,Valor,Identificador,Descrição
01/08/2026,"8.500,00",6a1f-abc,Transferência recebida - SALARIO EMPRESA LTDA
02/08/2026,"-18,50",6a1f-abd,Compra no débito - PADARIA SAO JORGE
`;

/** Fatura: na fatura do cartão a compra vem POSITIVA (valor cobrado). */
export const FATURA = `date,title,amount
2026-08-05,Ifood *Restaurante,64.90
2026-08-06,Netflix.com,55.90
2026-08-10,Pagamento recebido,-2350.90
`;
