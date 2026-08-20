import { Money } from '../../../../domain/entities/Money';
import type { StatementTable } from '../../../../application/ports/StatementParser';

/**
 * Deteccao de colunas por cabecalho E por conteudo. So por cabecalho e fragil:
 * cada banco nomeia diferente ("Descricao", "Titulo", "Historico", "Memo") e
 * alguns exportam sem cabecalho nenhum. Olhar o conteudo cobre esses casos.
 */

const DATE_HEADERS = /^(data|date|dt|data\s*(da\s*)?(compra|transa|lan[cç])|movimenta)/i;
const AMOUNT_HEADERS = /^(valor|amount|value|montante|quantia|r\$)/i;
const MERCHANT_HEADERS = /^(descri|titulo|t[ií]tulo|estabelec|lan[cç]amento|hist[oó]rico|memo|detalhe|referencia)/i;

/** Aceita ISO (2026-08-20) e BR (20/08/2026), com hora opcional. */
export function parseDate(raw: string): Date | null {
  const text = raw.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return atSaoPaulo(iso[1]!, iso[2]!, iso[3]!);

  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(text);
  if (br) return atSaoPaulo(br[3]!, br[2]!, br[1]!);

  // Ano com 2 digitos: 20/08/26. Assume 2000+, que e o unico caso plausivel
  // num extrato bancario.
  const short = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(text);
  if (short) return atSaoPaulo(`20${short[3]!}`, short[2]!, short[1]!);

  return null;
}

/**
 * Meio-dia em Sao Paulo. Extrato traz so a data, sem hora; ancorar em meio-dia
 * evita que conversao de fuso empurre o lancamento para o dia vizinho, que
 * erraria a virada do mes no relatorio.
 */
function atSaoPaulo(year: string, month: string, day: string): Date | null {
  const date = new Date(`${year}-${month}-${day}T12:00:00-03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseAmount(raw: string): Money | null {
  const text = raw.trim();
  if (text === '') return null;

  // Contabilidade escreve negativo entre parenteses: (89,90).
  const parenthesized = /^\((.+)\)$/.exec(text);
  const body = parenthesized?.[1] ?? text;
  const negative = Boolean(parenthesized) || body.trimStart().startsWith('-');

  try {
    const money = Money.fromBRLString(body.replace(/^-/, ''));
    return negative ? money.negated() : money;
  } catch {
    return null;
  }
}

/** Fracao das linhas em que a coluna e interpretavel pelo predicado. */
function hitRate(table: StatementTable, index: number, predicate: (value: string) => boolean): number {
  const sample = table.rows.slice(0, 30);
  if (sample.length === 0) return 0;
  const hits = sample.filter((row) => predicate(row[index] ?? '')).length;
  return hits / sample.length;
}

function findColumn(
  table: StatementTable,
  headerPattern: RegExp,
  contentPredicate: (value: string) => boolean,
): number {
  const scores = table.headers.map((header, index) => {
    const byHeader = headerPattern.test(header.trim()) ? 1 : 0;
    const byContent = hitRate(table, index, contentPredicate);
    // O conteudo pesa mais que o nome: cabecalho mente, dado nao.
    return { index, score: byContent * 2 + byHeader };
  });

  const best = scores.sort((a, b) => b.score - a.score)[0];
  return best && best.score > 0.5 ? best.index : -1;
}

export interface DetectedColumns {
  date: number;
  amount: number;
  merchant: number;
}

export function detectColumns(table: StatementTable): DetectedColumns {
  const date = findColumn(table, DATE_HEADERS, (v) => parseDate(v) !== null);
  const amount = findColumn(table, AMOUNT_HEADERS, (v) => parseAmount(v) !== null);

  // Estabelecimento e o que sobra: a coluna de texto mais longa que nao e
  // data nem valor. Serve para os bancos que nomeiam a coluna de forma
  // imprevisivel.
  const taken = new Set([date, amount]);
  const merchantByHeader = table.headers.findIndex(
    (h, i) => !taken.has(i) && MERCHANT_HEADERS.test(h.trim()),
  );

  const merchant =
    merchantByHeader >= 0
      ? merchantByHeader
      : table.headers
          .map((_, index) => index)
          .filter((index) => !taken.has(index))
          .map((index) => ({
            index,
            length: average(table.rows.slice(0, 30).map((row) => (row[index] ?? '').length)),
          }))
          .sort((a, b) => b.length - a.length)[0]?.index ?? -1;

  return { date, amount, merchant };
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}
