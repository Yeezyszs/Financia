import type { Category } from '../../../domain/entities/Category.js';
import type { CategoryRepository } from '../../ports/repositories/CategoryRepository.js';

export class ListCategoriesUseCase {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(input: { userId: string }): Promise<Category[]> {
    return this.categories.listByUser(input.userId);
  }
}
