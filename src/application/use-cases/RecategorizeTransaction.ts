import { normalizeMerchant } from '../../domain/entities/Category.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import type { Transaction } from '../../domain/entities/Transaction.js';
import type { CategoryRepository, TransactionRepository } from '../ports/repositories.js';

/**
 * Correcao manual do usuario. O pulo do gato: alem de corrigir esta transacao,
 * grava o estabelecimento como regra da categoria escolhida. E o "aprendizado
 * simples" do briefing - da proxima vez que esse estabelecimento aparecer,
 * a categorizacao automatica ja acerta sozinha.
 */
export class RecategorizeTransaction {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly categories: CategoryRepository,
  ) {}

  async execute(input: {
    transactionId: string;
    categoryId: string;
    /** false quando e uma excecao pontual que nao deve virar regra. */
    learn?: boolean;
  }): Promise<Transaction> {
    const transaction = await this.transactions.findById(input.transactionId);
    if (!transaction) {
      throw new DomainError(`Transacao ${input.transactionId} nao encontrada`, 'TRANSACTION_NOT_FOUND');
    }

    const category = await this.categories.findById(input.categoryId);
    if (!category) {
      throw new DomainError(`Categoria ${input.categoryId} nao encontrada`, 'CATEGORY_NOT_FOUND');
    }
    if (category.ownerId !== transaction.ownerId) {
      throw new DomainError('Categoria pertence a outro usuario', 'CATEGORY_OWNER_MISMATCH');
    }

    const updated = await this.transactions.update(transaction.categorizedAs(category.id));

    // Nao aprende no fallback: "Nao categorizado" como regra categorizaria tudo.
    if ((input.learn ?? true) && !category.isFallback) {
      await this.categories.addRule(category.id, normalizeMerchant(transaction.merchant));
    }

    return updated;
  }
}
