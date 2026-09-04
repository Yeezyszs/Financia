import { DomainError, NotFoundError } from '../../../domain/errors/DomainError.js';
import type { ImportRepository } from '../../ports/repositories/ImportRepository.js';
import type { TransactionRepository } from '../../ports/repositories/TransactionRepository.js';

/**
 * Inverte o sinal de todas as transações de uma importação.
 *
 * A convenção de sinal é a coisa que mais varia entre exports de banco, e
 * quando ela sai errada sai errada para o arquivo inteiro. Corrigir linha
 * a linha uma fatura de trinta compras não é uma opção real, então a
 * correção acompanha a unidade em que o erro acontece: a importação.
 */
export class FlipImportSignsUseCase {
  constructor(
    private readonly imports: ImportRepository,
    private readonly transactions: TransactionRepository,
  ) {}

  async execute(input: { userId: string; importId: string }): Promise<{ affected: number }> {
    const record = await this.imports.findById(input.userId, input.importId);
    if (!record) throw new NotFoundError('Importação', input.importId);

    if (record.status !== 'completed') {
      throw new DomainError(
        'Só dá para inverter os sinais de uma importação concluída.',
        'IMPORT_NOT_COMPLETED',
      );
    }

    const affected = await this.transactions.flipSignsForImport(input.userId, record.id);
    return { affected };
  }
}
