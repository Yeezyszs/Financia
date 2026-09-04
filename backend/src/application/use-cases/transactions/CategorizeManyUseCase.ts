import { DomainError, NotFoundError } from '../../../domain/errors/DomainError.js';
import type { CategoryRepository } from '../../ports/repositories/CategoryRepository.js';
import type { TransactionRepository } from '../../ports/repositories/TransactionRepository.js';

/** Teto por chamada: acima disso a tela deve paginar o trabalho. */
const MAX_IDS = 500;

/**
 * Aplica uma categoria a um conjunto escolhido na tela.
 *
 * De propósito não aprende regra nenhuma. A categorização de uma
 * transação por vez sabe de qual estabelecimento veio a escolha e pode
 * generalizar; um lote de trinta linhas costuma juntar estabelecimentos
 * diferentes, e uma regra tirada dali generalizaria a partir de uma
 * coincidência.
 */
export class CategorizeManyUseCase {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly categories: CategoryRepository,
  ) {}

  async execute(input: {
    userId: string;
    transactionIds: string[];
    categoryId: string;
  }): Promise<{ affected: number }> {
    if (input.transactionIds.length === 0) {
      throw new DomainError('Nenhuma transação selecionada', 'EMPTY_SELECTION');
    }
    if (input.transactionIds.length > MAX_IDS) {
      throw new DomainError(`Máximo de ${MAX_IDS} transações por vez`, 'SELECTION_TOO_LARGE');
    }

    const category = await this.categories.findById(input.userId, input.categoryId);
    if (!category) throw new NotFoundError('Categoria', input.categoryId);

    const affected = await this.transactions.setCategoryForMany(
      input.userId,
      input.transactionIds,
      category.id,
      category.kind === 'transfer',
      'manual',
    );

    return { affected };
  }
}
