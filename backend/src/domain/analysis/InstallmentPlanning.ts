import { lerParcela } from './InstallmentTag.js';

/**
 * Chave que liga uma compra parcelada às linhas dela na fatura.
 *
 * É a descrição sem a marca de parcela e sem ruído de pontuação:
 * "App*Upsaintgermainb - Parcela 4/6" e "App*Upsaintgermainb - Parcela
 * 5/6" caem na mesma chave, que é o que permite reconhecer as duas como
 * a mesma compra.
 *
 * Não reaproveita o `merchantKey` da análise de recorrência de propósito:
 * aquele corta no asterisco para agrupar "Ifood *A" com "Ifood *B", e
 * aqui isso seria destrutivo — reduziria "App*Upsaintgermainb" a "app",
 * juntando compras que não têm nada a ver.
 */
export function chaveDaCompra(description: string): string {
  return description
    .replace(/\bparcela\s+\d{1,2}\s*(?:\/|\s+de\s+)\s*\d{1,2}\s*\)?\s*$/i, '')
    .replace(/\(\d{1,2}\s*(?:\/|\s+de\s+)\s*\d{1,2}\)\s*$/, '')
    .replace(/\s[-–]\s\d{1,2}\/\d{1,2}\s*$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Uma transação casa com um plano quando a chave bate e o total de
 * parcelas confere.
 *
 * O total faz parte da identidade: duas compras no mesmo lugar, uma em
 * 6x e outra em 10x, são planos diferentes — e a fatura diz qual é qual.
 */
export function casaComPlano(
  description: string,
  plano: { merchantKey: string; installments: number },
): { numero: number } | null {
  const parcela = lerParcela(description);
  if (!parcela || parcela.total !== plano.installments) return null;

  const chave = chaveDaCompra(description);
  if (!chave || !plano.merchantKey) return null;

  // Contém em vez de igual: o cadastro manual raramente reproduz o
  // descritor do banco letra por letra, e exigir isso faria o vínculo
  // falhar justamente em quem digitou. O piso de 4 caracteres evita que
  // uma chave curta case com meio mundo.
  const casa =
    chave === plano.merchantKey ||
    (plano.merchantKey.length >= 4 && chave.includes(plano.merchantKey)) ||
    (chave.length >= 4 && plano.merchantKey.includes(chave));

  return casa ? { numero: parcela.numero } : null;
}

/** Último dia do mês, para o dia 31 não escorregar para março. */
function ultimoDia(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
}

/**
 * As N parcelas de um plano: uma por mês a partir da primeira cobrança,
 * com o total repartido em centavos.
 *
 * O resto da divisão vai todo na primeira parcela. É o que os bancos
 * fazem, e garante que a soma das partes seja exatamente o total — 1000
 * em 3 vezes vira 333,34 + 333,33 + 333,33, e não três de 333,33 que
 * perdem um centavo pelo caminho.
 */
export function gerarParcelas(input: {
  totalCents: number;
  installments: number;
  firstChargeOn: string;
}): { number: number; dueOn: string; amountCents: number }[] {
  const base = Math.floor(input.totalCents / input.installments);
  const resto = input.totalCents - base * input.installments;

  const [ano, mes, dia] = input.firstChargeOn.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');

  return Array.from({ length: input.installments }, (_, i) => {
    const alvo = new Date(Date.UTC(ano ?? 0, (mes ?? 1) - 1 + i, 1));
    const anoAlvo = alvo.getUTCFullYear();
    const mesAlvo = alvo.getUTCMonth();
    const diaAlvo = Math.min(dia ?? 1, ultimoDia(anoAlvo, mesAlvo));

    return {
      number: i + 1,
      dueOn: `${anoAlvo}-${pad(mesAlvo + 1)}-${pad(diaAlvo)}`,
      amountCents: i === 0 ? base + resto : base,
    };
  });
}
