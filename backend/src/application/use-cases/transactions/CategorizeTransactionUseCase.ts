import { CategoryRule } from '../../../domain/entities/CategoryRule.js';
import type { Transaction } from '../../../domain/entities/Transaction.js';
import { NotFoundError } from '../../../domain/errors/DomainError.js';
import { merchantKey } from '../../../domain/analysis/RecurringDetector.js';
import type { CategoryRepository } from '../../ports/repositories/CategoryRepository.js';
import type { CategoryRuleRepository } from '../../ports/repositories/CategoryRuleRepository.js';
import type { TransactionRepository } from '../../ports/repositories/TransactionRepository.js';
import type { IdGenerator } from '../../ports/services/IdGenerator.js';

/**
 * Regra aprendida entra à frente das do sistema, mas atrás das de
 * transferência (prioridade 1). Uma correção sua deve vencer o palpite
 * genérico do seed — mas não pode fazer o pagamento da fatura voltar a
 * contar como despesa.
 */
const PRIORIDADE_APRENDIDA = 5;

/** Chave curta demais viraria uma regra que casa com meio extrato. */
const TAMANHO_MINIMO_DA_CHAVE = 3;

export interface CategorizeTransactionInput {
  userId: string;
  transactionId: string;
  /** null remove a categoria. */
  categoryId: string | null;
  /** Cria (ou atualiza) uma regra para o mesmo estabelecimento. */
  remember?: boolean;
}

export interface CategorizeTransactionOutput {
  transaction: Transaction;
  /** Regra criada ou atualizada, quando `remember`. */
  learnedPattern: string | null;
  /** Quantas outras transações do mesmo estabelecimento foram atualizadas. */
  alsoUpdated: number;
}

export class CategorizeTransactionUseCase {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly categories: CategoryRepository,
    private readonly rules: CategoryRuleRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: CategorizeTransactionInput): Promise<CategorizeTransactionOutput> {
    const transaction = await this.transactions.findById(input.userId, input.transactionId);
    if (!transaction) throw new NotFoundError('Transação', input.transactionId);

    const category = input.categoryId
      ? await this.categories.findById(input.userId, input.categoryId)
      : null;
    if (input.categoryId && !category) throw new NotFoundError('Categoria', input.categoryId);

    // Categoria de transferência marca a transação como transferência, do
    // mesmo jeito que na importação: os totais precisam concordar,
    // independentemente de quem escolheu a categoria.
    const isTransfer = category?.kind === 'transfer';
    const atualizada = category
      ? transaction.categorize(category.id, 'manual')
      : transaction.uncategorize();

    const salva = await this.transactions.update(
      isTransfer ? atualizada.markAsTransfer() : atualizada.asRegularEntry(),
    );

    if (!input.remember || !category) {
      return { transaction: salva, learnedPattern: null, alsoUpdated: 0 };
    }

    const pattern = merchantKey(transaction.description);
    if (pattern.length < TAMANHO_MINIMO_DA_CHAVE) {
      return { transaction: salva, learnedPattern: null, alsoUpdated: 0 };
    }

    await this.saveRule(input.userId, pattern, category.id);
    const alsoUpdated = await this.applyToSimilar(input.userId, pattern, category, salva.id);

    return { transaction: salva, learnedPattern: pattern, alsoUpdated };
  }

  /** Uma regra por padrão: corrigir de novo reaponta a mesma regra. */
  private async saveRule(userId: string, pattern: string, categoryId: string): Promise<void> {
    const existente = await this.rules.findByPattern(userId, pattern, 'contains');

    if (existente) {
      await this.rules.update(
        new CategoryRule({ ...existente.toJSON(), categoryId, isActive: true }),
      );
      return;
    }

    await this.rules.create(
      new CategoryRule({
        id: this.ids.generate(),
        userId,
        categoryId,
        pattern,
        matchType: 'contains',
        accountId: null,
        priority: PRIORIDADE_APRENDIDA,
        source: 'learned',
        isActive: true,
      }),
    );
  }

  /**
   * Aplica a escolha ao passado — é o que evita ter de repetir a mesma
   * correção trinta vezes.
   *
   * Só toca no que a própria pessoa não categorizou à mão: uma decisão
   * manual anterior é informação, não ruído, e sobrescrevê-la em massa
   * seria desfazer trabalho sem avisar.
   */
  private async applyToSimilar(
    userId: string,
    pattern: string,
    category: { id: string; kind: string },
    exceptId: string,
  ): Promise<number> {
    const candidatas = await this.transactions.listRecategorizable(userId);
    const isTransfer = category.kind === 'transfer';

    const alvos = candidatas.filter(
      (candidata) =>
        candidata.id !== exceptId &&
        candidata.categoryId !== category.id &&
        merchantKey(candidata.description) === pattern,
    );

    if (alvos.length === 0) return 0;

    await this.transactions.setCategoryForMany(
      userId,
      alvos.map((alvo) => alvo.id),
      category.id,
      isTransfer,
    );

    return alvos.length;
  }
}
