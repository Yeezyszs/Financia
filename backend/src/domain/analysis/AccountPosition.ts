/**
 * Quanto existe hoje em cada conta.
 *
 * Conta corrente e cartão respondem perguntas diferentes e por isso são
 * calculados de formas diferentes:
 *
 *   - Conta corrente tem *saldo*: uma âncora conhecida mais o que se
 *     moveu depois dela.
 *   - Cartão não tem saldo, tem *fatura em aberto*: o que foi comprado e
 *     ainda não foi pago. Somar uma "âncora" de cartão não faria sentido
 *     — o extrato do cartão não publica saldo nenhum.
 *
 * As duas se juntam no patrimônio líquido: o que se tem menos o que já
 * se deve. É esse número, e não a soma dos saldos, que diz se o mês que
 * vem cabe.
 */
export interface Ancora {
  onDate: string;
  balanceCents: number;
}

export interface MovimentoAnalisavel {
  occurredOn: string;
  amountCents: number;
  isTransfer: boolean;
}

/**
 * Saldo de conta corrente: a âncora mais recente somada a tudo que veio
 * *depois* dela. Transações do próprio dia da âncora já estão dentro do
 * número informado — contá-las de novo dobraria o movimento do dia.
 *
 * Transferências entram: elas não são despesa, mas mexem no saldo. O que
 * não conta para gasto conta para caixa.
 */
export function saldoDaConta(
  ancora: Ancora | null,
  movimentos: MovimentoAnalisavel[],
): { balanceCents: number; asOf: string | null } {
  if (!ancora) return { balanceCents: 0, asOf: null };

  const posteriores = movimentos.filter((m) => m.occurredOn > ancora.onDate);
  const movimento = posteriores.reduce((soma, m) => soma + m.amountCents, 0);

  return { balanceCents: ancora.balanceCents + movimento, asOf: ancora.onDate };
}

/**
 * Fatura em aberto de um cartão: o que foi comprado depois do último
 * pagamento reconhecido.
 *
 * O pagamento aparece no cartão como entrada marcada como transferência
 * — é o "Pagamento recebido" da fatura. Tudo que veio depois dele ainda
 * não foi pago. Sem nenhum pagamento no histórico, o cartão inteiro está
 * em aberto, que é o certo: nada foi quitado.
 *
 * Devolve valor positivo — é uma dívida, e dívida se lê como quantia.
 */
export function faturaEmAberto(movimentos: MovimentoAnalisavel[]): {
  amountCents: number;
  sinceDate: string | null;
} {
  const pagamentos = movimentos
    .filter((m) => m.isTransfer && m.amountCents > 0)
    .map((m) => m.occurredOn)
    .sort();
  const ultimoPagamento = pagamentos[pagamentos.length - 1] ?? null;

  const emAberto = movimentos.filter(
    (m) => !m.isTransfer && (!ultimoPagamento || m.occurredOn > ultimoPagamento),
  );

  // As compras estão negativas; a dívida é o oposto delas.
  const total = emAberto.reduce((soma, m) => soma - m.amountCents, 0);

  return { amountCents: Math.max(total, 0), sinceDate: ultimoPagamento };
}
