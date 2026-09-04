import { Category, type CategoryKind } from '../../../domain/entities/Category.js';
import { DomainError } from '../../../domain/errors/DomainError.js';
import type { CategoryRepository } from '../../ports/repositories/CategoryRepository.js';
import type { IdGenerator } from '../../ports/services/IdGenerator.js';

export interface CreateCategoryInput {
  userId: string;
  name: string;
  kind?: CategoryKind;
}

export interface CreateCategoryOutput {
  category: Category;
  /** Falso quando o nome já existia e a categoria antiga foi reaproveitada. */
  created: boolean;
}

/**
 * Cria uma categoria pelo nome digitado.
 *
 * Nome repetido não é erro: quem digita "Lazer" numa transação enquanto
 * "Lazer" já existe quer aquela categoria, não uma segunda igual. A
 * comparação ignora maiúsculas e acentos de caixa, senão "lazer" viraria
 * uma categoria separada de "Lazer" e o relatório apareceria dividido em
 * duas fatias que são a mesma coisa.
 */
export class CreateCategoryUseCase {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: CreateCategoryInput): Promise<CreateCategoryOutput> {
    const name = input.name.trim().replace(/\s+/g, ' ');
    if (!name) throw new DomainError('A categoria precisa de um nome', 'INVALID_CATEGORY');
    if (name.length > 40) {
      throw new DomainError('Nome de categoria muito longo (máx. 40)', 'INVALID_CATEGORY');
    }

    const existentes = await this.categories.listByUser(input.userId);
    const igual = existentes.find(
      (categoria) => categoria.name.localeCompare(name, 'pt-BR', { sensitivity: 'base' }) === 0,
    );
    if (igual) return { category: igual, created: false };

    const category = new Category({
      id: this.ids.generate(),
      userId: input.userId,
      name,
      kind: input.kind ?? 'expense',
      color: null,
      icon: null,
      isSystem: false,
    });

    return { category: await this.categories.create(category), created: true };
  }
}
