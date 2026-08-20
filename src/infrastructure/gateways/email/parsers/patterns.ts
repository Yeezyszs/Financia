import { Money } from '../../../../domain/entities/Money';

/**
 * Padroes que se repetem em e-mail de banco brasileiro, independente da marca.
 * Cada parser combina esses blocos com as regras especificas do seu template,
 * em vez de cada um reinventar o regex de valor e de data.
 */

const AMOUNT = /R\$\s*([\d.]+,\d{2})/i;
const DATE_TIME = /(\d{2})\/(\d{2})\/(\d{4})(?:\s*(?:as|às|,)?\s*(\d{2}):(\d{2}))?/i;
const LAST4 = /(?:final|terminado em|n[uú]mero)\s*(?:com\s*)?(\d{4})/i;
const INSTALLMENT = /parcela\s*(\d{1,2})\s*(?:de|\/)\s*(\d{1,2})/i;

/** Termos que marcam estorno/cancelamento em vez de compra. */
const REFUND_TERMS = /\b(estorno|estornad[ao]|cancelament[o]|cancelad[ao]|reembolso|devolu[cç][aã]o)\b/i;

export function findAmount(text: string): Money | null {
  const match = AMOUNT.exec(text);
  return match?.[1] ? Money.fromBRLString(match[1]) : null;
}

/**
 * Data no fuso de Sao Paulo (UTC-3). O e-mail escreve horario local sem dizer
 * o fuso; se interpretar como UTC, toda compra depois das 21h cai no dia
 * seguinte e o relatorio mensal erra a virada do mes.
 */
export function findDateTime(text: string, fallback: Date): Date {
  const match = DATE_TIME.exec(text);
  if (!match) return fallback;

  const [, day, month, year, hour, minute] = match;
  const iso = `${year}-${month}-${day}T${hour ?? '12'}:${minute ?? '00'}:00-03:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function findLast4(text: string): string | undefined {
  return LAST4.exec(text)?.[1];
}

export function findInstallment(text: string): { current: number; total: number } | undefined {
  const match = INSTALLMENT.exec(text);
  if (!match?.[1] || !match[2]) return undefined;
  return { current: Number(match[1]), total: Number(match[2]) };
}

export function isRefund(text: string): boolean {
  return REFUND_TERMS.test(text);
}

/**
 * Limpa o nome que a maquininha manda. Estabelecimento vem cheio de sufixo de
 * adquirente e cidade: "IFOOD*IFOOD SAO PAULO BR" -> "IFOOD". Sem isso, cada
 * variacao do mesmo lugar viraria uma regra de categoria diferente.
 */
export function cleanMerchant(raw: string): string {
  return raw
    .split('*')[0]!
    .replace(/\s+(BR|BRA|BRASIL)$/i, '')
    .replace(/\s+\d{6,}$/, '')
    .replace(/[.,;]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Primeiro grupo capturado entre varios regex candidatos. Templates mudam. */
export function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}
