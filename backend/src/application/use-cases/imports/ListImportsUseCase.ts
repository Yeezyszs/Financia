import type { Import } from '../../../domain/entities/Import.js';
import type { ImportRepository } from '../../ports/repositories/ImportRepository.js';

export class ListImportsUseCase {
  constructor(private readonly imports: ImportRepository) {}

  async execute(input: { userId: string; limit?: number; offset?: number }): Promise<Import[]> {
    return this.imports.listByUser(input.userId, {
      limit: Math.min(input.limit ?? 30, 100),
      offset: input.offset ?? 0,
    });
  }
}
