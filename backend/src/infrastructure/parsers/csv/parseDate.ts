import { DomainError } from '../../../domain/errors/DomainError.js';

/**
 * Normaliza para YYYY-MM-DD. Os exports do Nubank aparecem em ISO
 * (fatura) e em dd/mm/aaaa (extrato), então aceitamos os dois — e nada
 * além disso, para um formato ambíguo não virar transação com data errada.
 */
export function parseStatementDate(raw: string): string {
  const value = raw.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return assertRealDate(iso[1]!, iso[2]!, iso[3]!, value);

  const br = /^(\d{2})[/.-](\d{2})[/.-](\d{4})$/.exec(value);
  if (br) return assertRealDate(br[3]!, br[2]!, br[1]!, value);

  throw new DomainError(`Data em formato não reconhecido: "${raw}"`, 'INVALID_DATE');
}

function assertRealDate(year: string, month: string, day: string, original: string): string {
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  const valid =
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day);

  if (!valid) throw new DomainError(`Data inexistente: "${original}"`, 'INVALID_DATE');
  return `${year}-${month}-${day}`;
}
