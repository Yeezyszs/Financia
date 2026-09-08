/**
 * Confronta o que a descrição diz com o sinal do valor.
 *
 * A convenção de sinal é a coisa que mais varia entre exports de banco, e
 * quando ela sai errada sai errada em silêncio: uma "Transferência
 * enviada" gravada como entrada infla a receita e não aparece em lugar
 * nenhum. Nos dados reais isso aconteceu com três lançamentos.
 *
 * O extrato já carrega a resposta no próprio texto — "enviada", "pago",
 * "compra" são saída; "recebida", "estorno", "rendimento" são entrada. É
 * uma conferência de plausibilidade, não uma verdade: quando o texto e o
 * sinal discordam, alguém precisa olhar. Por isso ela avisa e não
 * corrige — corrigir sozinha trocaria um erro invisível por outro.
 */
export type Direcao = 'entrada' | 'saida';

const SAIDA = [
  'transferencia enviada',
  'transferencia enviado',
  'pix enviado',
  'pagamento efetuado',
  'pagamento de',
  'compra no debito',
  'compra no credito',
  'compra com cartao',
  'debito automatico',
  'saque',
  'tarifa',
  'anuidade',
  'juros de',
  'multa',
  'iof',
];

const ENTRADA = [
  'transferencia recebida',
  'pix recebido',
  'estorno',
  'reembolso',
  'rendimento',
  'resgate',
  'cashback',
  'deposito',
  'credito de',
  'pagamento recebido',
];

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * O que o texto promete, ou `null` quando não promete nada. Casa em
 * qualquer posição porque bancos prefixam a descrição de formas
 * diferentes ("Compra no débito - X", "X - compra no débito").
 */
export function direcaoPelaDescricao(description: string): Direcao | null {
  const texto = normalizar(description);

  // Entrada primeiro: "pagamento recebido" contém "pagamento", que está
  // na lista de saída — o termo mais específico tem que ganhar.
  if (ENTRADA.some((termo) => texto.includes(termo))) return 'entrada';
  if (SAIDA.some((termo) => texto.includes(termo))) return 'saida';
  return null;
}

export interface SinalSuspeito {
  occurredOn: string;
  description: string;
  amountCents: number;
  /** O que o texto dizia. O sinal gravado é o oposto disto. */
  esperado: Direcao;
}

/** Linhas em que o texto e o sinal discordam. */
export function conferirSinais(
  rows: { occurredOn: string; description: string; amountCents: number }[],
): SinalSuspeito[] {
  const suspeitos: SinalSuspeito[] = [];

  for (const row of rows) {
    const esperado = direcaoPelaDescricao(row.description);
    if (!esperado) continue;

    const real: Direcao = row.amountCents > 0 ? 'entrada' : 'saida';
    if (real !== esperado) {
      suspeitos.push({
        occurredOn: row.occurredOn,
        description: row.description,
        amountCents: row.amountCents,
        esperado,
      });
    }
  }

  return suspeitos;
}
