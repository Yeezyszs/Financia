import { NotFoundError } from '../../../domain/errors/DomainError.js';
import type { ImportRepository } from '../../ports/repositories/ImportRepository.js';
import type { TransactionRepository } from '../../ports/repositories/TransactionRepository.js';

/**
 * Desfaz uma importação inteira: apaga as transações que vieram dela e o
 * registro no histórico.
 *
 * É a saída para o arquivo que entrou no lugar errado — na conta errada,
 * pelo layout errado. Sem isso, o único jeito de consertar seria apagar
 * transação por transação, e o hash do arquivo continuaria no histórico
 * barrando a reimportação correta.
 *
 * As transações vão primeiro. Na ordem inversa, uma falha no meio deixaria
 * transações sem importação nenhuma — invisíveis para qualquer correção
 * feita pela tela. Assim, uma falha deixa a importação ainda listada e a
 * operação pode ser repetida.
 */
export class DeleteImportUseCase {
  constructor(
    private readonly imports: ImportRepository,
    private readonly transactions: TransactionRepository,
  ) {}

  async execute(input: {
    userId: string;
    importId: string;
  }): Promise<{ deletedTransactions: number }> {
    const record = await this.imports.findById(input.userId, input.importId);
    if (!record) throw new NotFoundError('Importação', input.importId);

    const deletedTransactions = await this.transactions.deleteByImport(input.userId, record.id);
    await this.imports.delete(input.userId, record.id);

    return { deletedTransactions };
  }
}
