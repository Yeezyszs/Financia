import type { EmailParser, ParsedTransaction, RawEmail } from '../../../../application/ports/EmailParser';
import { cleanMerchant, findAmount, findDateTime, findInstallment, findLast4, firstMatch, isRefund } from './patterns';

/**
 * Parser do Nubank.
 *
 * ATENCAO: por padrao o Nubank notifica compra por PUSH, nao por e-mail. Para
 * este parser receber alguma coisa, e preciso ligar a notificacao por e-mail
 * no app (Perfil > Notificacoes). Se nao houver e-mail de compra na caixa, a
 * conta Nubank fica sem ingestao automatica - a alternativa e importar CSV
 * da fatura, o que fica para uma fase posterior.
 *
 * Os regex abaixo foram escritos a partir do formato conhecido e ainda NAO
 * foram validados contra e-mail real. Rode `npm run explore` e ajuste com o
 * dump em maos antes de confiar.
 */
export class NubankEmailParser implements EmailParser {
  readonly institution = 'nubank';

  canParse(email: RawEmail): boolean {
    const haystack = `${email.subject} ${email.body}`;
    // Restritivo de proposito: o mesmo remetente manda fatura fechada,
    // fatura vencendo e aviso de pagamento, que nao sao transacoes.
    if (/fatura\s+(fechada|vencendo|dispon[ií]vel)|pagamento\s+confirmado|extrato/i.test(email.subject)) {
      return false;
    }
    return /compra\s+(aprovada|realizada)|transa[cç][aã]o\s+aprovada|estorno/i.test(haystack);
  }

  parse(email: RawEmail): ParsedTransaction | null {
    const text = `${email.subject}\n${email.body}`;

    const amount = findAmount(text);
    if (!amount) return null;

    const merchant = firstMatch(text, [
      /\bem\s+([A-Z0-9][^\n,.]{2,60}?)(?:\s+no dia|\s+em\s+\d{2}\/|[,.\n]|$)/i,
      /estabelecimento:?\s*([^\n]{2,60})/i,
      /compra\s+(?:aprovada|realizada)\s+(?:em|no)\s+([^\n,.]{2,60})/i,
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
