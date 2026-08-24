import type {
  FinancialSnapshot,
  RecurringItem,
} from '../../application/use-cases/insights/GetFinancialSnapshotUseCase.js';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function reais(cents: number): string {
  return (
    (cents / 100)
      .toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
      })
      // O Intl separa "R$" do número com espaço não separável (U+00A0).
      // Num texto feito para ser copiado e colado, espaço comum evita
      // surpresa em editor e em busca dentro do próprio texto.
      .replace(/\u00a0/g, ' ')
  );
}

function mesPorExtenso(month: string): string {
  const indice = Number(month.slice(5, 7)) - 1;
  return `${MESES[indice] ?? month}/${month.slice(0, 4)}`;
}

function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function percentual(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

function tabelaRecorrentes(itens: RecurringItem[], colunaValor: string): string[] {
  return [
    `| Item | ${colunaValor} | Meses | Última | Categoria |`,
    '| --- | ---: | ---: | --- | --- |',
    ...itens.map((item) => {
      const valor = item.kind === 'subscription' ? item.typicalCents : item.monthlyAverageCents;
      return `| ${item.label} | ${reais(valor)} | ${item.monthsSeen} | ${diaMes(item.lastSeen)} | ${item.categoryName ?? '—'} |`;
    }),
  ];
}

/**
 * Transforma o retrato financeiro num texto pronto para colar numa
 * conversa com um assistente.
 *
 * O texto carrega o próprio enquadramento — quem é, o que são os
 * números, o que já foi excluído deles — porque a alternativa é o
 * usuário ter que reescrever esse contexto toda vez, e sem ele o
 * conselho sai genérico ou baseado em suposição errada (por exemplo,
 * contar o pagamento da fatura como se fosse uma despesa a mais).
 */
export function snapshotToMarkdown(snapshot: FinancialSnapshot): string {
  const ref = mesPorExtenso(snapshot.period.referenceMonth);
  const primeiro = snapshot.monthlySeries[0]?.month;
  const janela = primeiro
    ? `${mesPorExtenso(primeiro)} a ${ref}`
    : `${snapshot.months} meses até ${ref}`;

  const mesAtual = snapshot.monthlySeries.find(
    (m) => m.month === snapshot.period.referenceMonth,
  );
  const despesaMedia = snapshot.expense.monthlyAverageCents;
  const assinaturasAtivas = snapshot.subscriptions.filter(
    (item) => item.lastSeen.slice(0, 7) >= snapshot.period.referenceMonth,
  );

  const linhas: string[] = [
    `# Resumo financeiro — ${ref}`,
    '',
    'Estes são meus dados reais de gastos, exportados do meu app de controle financeiro.',
    'Gostaria de ajuda para entender para onde meu dinheiro está indo e onde dá para economizar.',
    '',
    '**Contexto para ler os números:**',
    '',
    `- Período: ${janela} (${snapshot.transactionCount} transações).`,
    '- Transferências entre minhas próprias contas (como o pagamento da fatura do cartão) já',
    '  estão excluídas — elas não são despesa, apenas dinheiro mudando de lugar.',
    '- "Assinatura" é gasto recorrente de valor estável, que eu poderia cancelar por inteiro.',
    '  "Recorrente variável" é hábito com valor que muda (mercado, delivery) — dá para reduzir,',
    '  não para zerar.',
    '- Valores em reais.',
    '',
    `## Mês de referência (${ref})`,
    '',
  ];

  if (mesAtual) {
    const saldo = mesAtual.incomeCents - mesAtual.expenseCents;
    linhas.push(
      `- Receitas: ${reais(mesAtual.incomeCents)}`,
      `- Despesas: ${reais(mesAtual.expenseCents)}`,
      `- Saldo: ${reais(saldo)}`,
      '',
    );
  } else {
    linhas.push('Sem movimento registrado neste mês.', '');
  }

  linhas.push(
    `## Média dos últimos ${snapshot.monthlySeries.length} meses`,
    '',
    `- Receita média: ${reais(snapshot.income.monthlyAverageCents)}`,
    `- Despesa média: ${reais(despesaMedia)}`,
    `- Gasto fixo (assinaturas ativas): ${reais(snapshot.fixedMonthlyCents)} por mês` +
      ` — ${percentual(snapshot.fixedMonthlyCents, despesaMedia)}% da despesa`,
    `- Gasto variável: ${reais(snapshot.variableMonthlyCents)} por mês`,
    '',
  );

  if (assinaturasAtivas.length > 0) {
    linhas.push(
      `## Assinaturas ativas (${assinaturasAtivas.length})`,
      '',
      ...tabelaRecorrentes(assinaturasAtivas, 'Valor/mês'),
      '',
    );
  }

  if (snapshot.recurring.length > 0) {
    linhas.push(
      `## Gastos recorrentes de valor variável (${snapshot.recurring.length})`,
      '',
      ...tabelaRecorrentes(snapshot.recurring.slice(0, 10), 'Média/mês'),
      '',
    );
  }

  const tendencias = snapshot.trends.filter((t) => t.currentCents > 0).slice(0, 12);
  if (tendencias.length > 0) {
    linhas.push(
      '## Despesas por categoria neste mês',
      '',
      '| Categoria | Este mês | Média dos meses anteriores | Variação |',
      '| --- | ---: | ---: | ---: |',
      ...tendencias.map((t) => {
        const variacao =
          t.averageCents > 0 ? `${t.changePercent > 0 ? '+' : ''}${t.changePercent}%` : '—';
        return `| ${t.name} | ${reais(t.currentCents)} | ${reais(t.averageCents)} | ${variacao} |`;
      }),
      '',
    );
  }

  if (snapshot.monthlySeries.length > 1) {
    linhas.push(
      '## Evolução mensal',
      '',
      '| Mês | Receitas | Despesas | Saldo |',
      '| --- | ---: | ---: | ---: |',
      ...snapshot.monthlySeries.map(
        (m) =>
          `| ${mesPorExtenso(m.month)} | ${reais(m.incomeCents)} | ${reais(m.expenseCents)} |` +
          ` ${reais(m.incomeCents - m.expenseCents)} |`,
      ),
      '',
    );
  }

  linhas.push(
    '## O que eu gostaria de saber',
    '',
    '1. Onde estão as maiores oportunidades de economia, em ordem de impacto?',
    '2. Alguma assinatura parece não valer o que custa, ou parece duplicada?',
    '3. Alguma categoria cresceu de um jeito que eu deveria olhar com atenção?',
    '4. Como está o equilíbrio entre gasto fixo e variável, e o que isso significa na prática?',
    '',
    'Pode me questionar se algum número parecer estranho — a categorização é automática e',
    'pode ter errado em alguns casos.',
  );

  return linhas.join('\n');
}
