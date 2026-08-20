import { Transaction } from '../../domain/entities/Transaction.js';
import type { EmailSource } from '../../domain/entities/EmailSource.js';
import type { RawEmail, EmailParserRegistry } from '../ports/EmailParser.js';
import type { IdGenerator } from '../ports/IdGenerator.js';
import type { TransactionRepository } from '../ports/repositories.js';
import type { CategorizeTransaction } from './CategorizeTransaction.js';

export type IngestOutcome =
  | { status: 'ingested'; transaction: Transaction }
  | { status: 'duplicate'; rawSourceId: string }
  | { status: 'not_a_transaction'; rawSourceId: string }
  | { status: 'rejected_sender'; rawSourceId: string };

/**
 * Coracao da ingestao. Note o que este use case NAO sabe: qual banco mandou o
 * e-mail, como o corpo esta formatado, se veio do Gmail ou de IMAP. Ele so
 * conhece a interface EmailParser, resolvida por EmailSource.parserStrategy.
 * Adicionar banco = escrever parser + cadastrar fonte. Este arquivo nao muda.
 */
export class IngestTransactionFromEmail {
  constructor(
    private readonly parsers: EmailParserRegistry,
    private readonly transactions: TransactionRepository,
    private readonly categorize: CategorizeTransaction,
    private readonly ids: IdGenerator,
  ) {}

  async execute(email: RawEmail, source: EmailSource): Promise<IngestOutcome> {
    // Remetente fora da allowlist da fonte: pode ser phishing imitando o banco.
    if (!source.accepts(email.from)) {
      return { status: 'rejected_sender', rawSourceId: email.id };
    }

    const parser = this.parsers.resolve(source.parserStrategy);
    if (!parser.canParse(email)) {
      return { status: 'not_a_transaction', rawSourceId: email.id };
    }

    const parsed = parser.parse(email);
    if (!parsed) {
      return { status: 'not_a_transaction', rawSourceId: email.id };
    }

    // Estorno vira transacao propria ligada a original, nunca DELETE da compra.
    const reversalOf = parsed.kind === 'refund' ? await this.findOriginalPurchase(source, parsed.merchant) : null;

    const { categoryId } = await this.categorize.execute({
      ownerId: source.ownerId,
      merchant: parsed.merchant,
    });

    const transaction = new Transaction({
      id: this.ids.next(),
      ownerId: source.ownerId,
      accountId: source.accountId,
      amount: parsed.amount,
      merchant: parsed.merchant,
      occurredAt: parsed.occurredAt,
      kind: parsed.kind,
      categoryId,
      origin: 'email',
      rawSourceId: email.id,
      reversalOfId: reversalOf,
      installment: parsed.installment ?? null,
    });

    // Idempotencia: quem decide e o unique index em raw_source_id la no banco.
    // O mesmo e-mail relido (repoll, retry do Pub/Sub) cai aqui e vira no-op.
    const saved = await this.transactions.createIfAbsent(transaction);
    if (!saved) {
      return { status: 'duplicate', rawSourceId: email.id };
    }

    return { status: 'ingested', transaction: saved };
  }

  /**
   * Casa o estorno com a compra original pelo par (conta, estabelecimento),
   * pegando a mais recente. Heuristica: o e-mail de estorno raramente cita a
   * compra original, entao nao da para casar por id. Se nao achar, o estorno
   * entra solto - continua contando certo no consolidado.
   */
  private async findOriginalPurchase(source: EmailSource, merchant: string): Promise<string | null> {
    const recent = await this.transactions.list({
      ownerId: source.ownerId,
      accountId: source.accountId,
      limit: 100,
    });
    const original = recent.find((t) => t.kind === 'purchase' && t.merchant === merchant);
    return original?.id ?? null;
  }
}
