import type { EmailParser, ParsedTransaction, RawEmail } from '../../../../application/ports/EmailParser';
import { cleanMerchant, findAmount, findDateTime, findInstallment, findLast4, firstMatch, isRefund } from './patterns';

/**
 * Parser do C6 Bank.
 *
 * O C6 manda o corpo em HTML pesado, entao o GmailClient prefere o text/plain
 * do multipart e so cai no strip de HTML se nao houver alternativa.
 *
 * Regex escritos a partir do formato conhecido, ainda NAO validados contra
 * e-mail real. Rode `npm run explore` e ajuste antes de confiar.
 */
export class C6EmailParser implements EmailParser {
  readonly institution = 'c6';

  canParse(email: RawEmail): boolean {
    const haystack = `${email.subject} ${email.body}`;
    if (/fatura|extrato|limite\s+dispon[ií]vel|proposta|seguro/i.test(email.subject)) {
      return false;
    }
    return /compra\s+(aprovada|autorizada|realizada)|transa[cç][aã]o|estorno|cancelament/i.test(haystack);
  }

  parse(email: RawEmail): ParsedTransaction | null {
    const text = `${email.subject}\n${email.body}`;

    const amount = findAmount(text);
    if (!amount) return null;

    const merchant = firstMatch(text, [
      /estabelecimento:?\s*([^\n]{2,60})/i,
      /\bem\s+([A-Z0-9][^\n,.]{2,60}?)(?:\s+no dia|\s+em\s+\d{2}\/|[,.\n]|$)/i,
      /local:?\s*([^\n]{2,60})/i,
    ]);
    if (!merchant) return null;

    const refund = isRefund(text);
    const installment = findInstallment(text);
    const last4 = findLast4(text);

    return {
      amount: refund ? amount.negated() : amount,
      merchant: cleanMerchant(merchant),
      occurredAt: findDateTime(text, email.receivedAt),
      kind: refund ? 'refund' : 'purchase',
      ...(last4 ? { last4 } : {}),
      ...(installment ? { installment } : {}),
    };
  }
}
