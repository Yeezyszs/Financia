import { createHash } from 'node:crypto';

/**
 * Dedupe de reimportação.
 *
 * O CSV do Nubank não traz ID de transação, então a identidade de uma
 * linha é (conta, data, título normalizado, valor). O problema: duas
 * compras iguais no mesmo dia (dois cafés de R$ 8,00) são linhas
 * legítimas e distintas — por isso entra o `ordinal`, que é a posição da
 * repetição dentro do arquivo. Reimportar o mesmo extrato gera os mesmos
 * ordinais e portanto os mesmos fingerprints; um extrato novo com uma
 * terceira repetição gera ordinal 2, que ainda não existe no banco.
 */
export function buildFingerprint(input: {
  accountId: string;
  occurredOn: string; // YYYY-MM-DD
  description: string;
  amountCents: number;
  ordinal?: number;
}): string {
  const parts = [
    input.accountId,
    input.occurredOn,
    normalizeDescription(input.description),
    String(input.amountCents),
    String(input.ordinal ?? 0),
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

/**
 * Normalização usada tanto no fingerprint quanto no match de regras de
 * categoria: minúsculo, sem acento, sem pontuação, espaços colapsados.
 */
export function normalizeDescription(description: string): string {
  return description
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Atribui o ordinal de repetição a linhas idênticas dentro de um arquivo. */
export function assignOrdinals<T>(rows: T[], keyOf: (row: T) => string): number[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const key = keyOf(row);
    const next = seen.get(key) ?? 0;
    seen.set(key, next + 1);
    return next;
  });
}
