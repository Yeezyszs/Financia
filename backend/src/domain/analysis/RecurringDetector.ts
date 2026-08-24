export interface AnalyzableTransaction {
  occurredOn: string;
  description: string;
  amountCents: number;
  categoryId: string | null;
}

export type RecurrenceKind = 'subscription' | 'recurring';

export interface RecurringGroup {
  /** Rótulo legível, tirado da ocorrência mais recente. */
  label: string;
  /** Chave normalizada usada no agrupamento. */
  key: string;
  kind: RecurrenceKind;
  occurrences: number;
  /** Em quantos meses distintos apareceu. */
  monthsSeen: number;
  /** Mediana dos valores, sempre positiva. */
  typicalCents: number;
  /** Quanto pesa por mês, em média, no período analisado. */
  monthlyAverageCents: number;
  firstSeen: string;
  lastSeen: string;
  categoryId: string | null;
}

/**
 * Prefixos que os bancos colam na frente do estabelecimento e que só
 * atrapalham o agrupamento: "Compra no débito - ASSAI" e "ASSAI" são o
 * mesmo lugar.
 */
const RUIDO = [
  'compra no debito',
  'compra no credito',
  'compra com cartao',
  'pagamento de',
  'pagamento',
  'transferencia recebida',
  'transferencia enviada',
  'transferencia',
  'pix enviado',
  'pix recebido',
  'debito automatico',
];

/**
 * Reduz a descrição ao estabelecimento.
 *
 * A ordem das duas limpezas importa, porque elas puxam para lados
 * opostos: em "Compra no débito - ASSAI" o que interessa vem *depois* do
 * traço, e em "Ifood *Restaurante Sabor" vem *antes* do asterisco. Por
 * isso o prefixo do banco sai primeiro e só então cortamos no asterisco.
 *
 * A normalização aqui é própria — a do fingerprint apagaria o asterisco,
 * que é justamente o separador de que precisamos.
 */
export function merchantKey(description: string): string {
  let texto = description
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9*\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const prefixo of RUIDO) {
    if (texto.startsWith(prefixo)) {
      texto = texto.slice(prefixo.length).replace(/^[\s-]+/, '').trim();
      break;
    }
  }

  // o detalhe da compra vem depois do asterisco: "ifood *lugar" -> "ifood"
  const asterisco = texto.indexOf('*');
  if (asterisco > 2) texto = texto.slice(0, asterisco).trim();

  // parcelas: "magazine luiza 3 12" e "... 4 12" são a mesma compra
  texto = texto.replace(/\b\d{1,2}\s+\d{1,2}$/, '').trim();

  // número solto no fim raramente identifica o estabelecimento
  texto = texto.replace(/\s+\d+$/, '').trim();

  return texto.replace(/[\s-]+$/, '').trim();
}

/** "assai atacadista" -> "Assai Atacadista" */
function titulo(chave: string): string {
  return chave
    .split(' ')
    .map((palavra) => palavra.charAt(0).toUpperCase() + palavra.slice(1))
    .join(' ');
}

function mediana(valores: number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? Math.round(((ordenados[meio - 1] ?? 0) + (ordenados[meio] ?? 0)) / 2)
    : (ordenados[meio] ?? 0);
}

export interface DetectOptions {
  /** Mínimo de meses distintos para considerar recorrente. */
  minMonths?: number;
  /** Quanto o valor pode variar para ainda ser "assinatura". */
  toleranciaValor?: number;
  /** Ocorrências por mês aceitas para ainda ser "assinatura". */
  maxPorMes?: number;
}

/**
 * Encontra o que se repete mês a mês.
 *
 * Duas categorias saem daqui, e a diferença importa para o conselho:
 * `subscription` é valor praticamente fixo (Netflix, aluguel) — dá para
 * cancelar e economizar o valor inteiro; `recurring` é hábito com valor
 * variável (mercado, iFood) — dá para reduzir, não para zerar.
 */
export function detectRecurring(
  transactions: AnalyzableTransaction[],
  options: DetectOptions = {},
): RecurringGroup[] {
  const minMonths = options.minMonths ?? 3;
  const tolerancia = options.toleranciaValor ?? 0.2;
  const maxPorMes = options.maxPorMes ?? 1.3;

  const grupos = new Map<string, AnalyzableTransaction[]>();

  for (const transaction of transactions) {
    // Só saídas: receita recorrente é salário, não gasto a cortar.
    if (transaction.amountCents >= 0) continue;

    const chave = merchantKey(transaction.description);
    if (chave.length < 3) continue;

    const lista = grupos.get(chave);
    if (lista) lista.push(transaction);
    else grupos.set(chave, [transaction]);
  }

  const resultado: RecurringGroup[] = [];

  for (const [chave, lista] of grupos) {
    const meses = new Set(lista.map((t) => t.occurredOn.slice(0, 7)));
    if (meses.size < minMonths) continue;

    const valores = lista.map((t) => Math.abs(t.amountCents));
    const tipico = mediana(valores);
    if (tipico === 0) continue;

    const dentroDaFaixa = valores.filter(
      (valor) => Math.abs(valor - tipico) <= tipico * tolerancia,
    ).length;
    const valorEstavel = dentroDaFaixa / valores.length >= 0.7;

    // Cadência importa tanto quanto o valor. Quatro compras por mês num
    // atacadista podem ter valores parecidos, mas não são assinatura —
    // e contá-las como gasto fixo inflaria o número que se usa para
    // planejar o mês. Assinatura cobra uma vez por ciclo.
    const porMes = lista.length / meses.size;
    const kind: RecurrenceKind =
      valorEstavel && porMes <= maxPorMes ? 'subscription' : 'recurring';

    const ordenadas = [...lista].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
    const maisRecente = ordenadas[ordenadas.length - 1]!;
    const total = valores.reduce((soma, valor) => soma + valor, 0);

    // Quando as descrições variam ("Ifood *Restaurante A", "*B"), a mais
    // recente é um rótulo arbitrário: qualquer uma delas serviria e
    // nenhuma representa o grupo. Aí o nome do estabelecimento é melhor.
    const descricoes = new Set(lista.map((t) => t.description));
    const label = descricoes.size === 1 ? maisRecente.description : titulo(chave);

    resultado.push({
      key: chave,
      label,
      kind,
      occurrences: lista.length,
      monthsSeen: meses.size,
      typicalCents: tipico,
      monthlyAverageCents: Math.round(total / meses.size),
      firstSeen: ordenadas[0]!.occurredOn,
      lastSeen: maisRecente.occurredOn,
      categoryId: maisRecente.categoryId,
    });
  }

  // Maior peso mensal primeiro: é o que interessa para economizar.
  return resultado.sort((a, b) => b.monthlyAverageCents - a.monthlyAverageCents);
}
