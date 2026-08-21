import type { Category } from '../../../domain/entities/Category.js';

export interface CategoryRepository {
  findById(userId: string, id: string): Promise<Category | null>;
  findByName(userId: string, name: string): Promise<Category | null>;
  listByUser(userId: string): Promise<Category[]>;
  create(category: Category): Promise<Category>;
  update(category: Category): Promise<Category>;
  delete(userId: string, id: string): Promise<void>;
}
