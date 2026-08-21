import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category } from '../../../../domain/entities/Category.js';
import type { CategoryRepository } from '../../../../application/ports/repositories/CategoryRepository.js';
import { CategoryMapper, type CategoryRow } from '../mappers/CategoryMapper.js';

const TABLE = 'categories';

export class SupabaseCategoryRepository implements CategoryRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findById(userId: string, id: string): Promise<Category | null> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? CategoryMapper.toDomain(data as CategoryRow) : null;
  }

  async findByName(userId: string, name: string): Promise<Category | null> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .ilike('name', name)
      .maybeSingle();
    if (error) throw error;
    return data ? CategoryMapper.toDomain(data as CategoryRow) : null;
  }

  async listByUser(userId: string): Promise<Category[]> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('name');
    if (error) throw error;
    return (data as CategoryRow[]).map(CategoryMapper.toDomain);
  }

  async create(category: Category): Promise<Category> {
    const { data, error } = await this.db
      .from(TABLE)
      .insert(CategoryMapper.toRow(category))
      .select()
      .single();
    if (error) throw error;
    return CategoryMapper.toDomain(data as CategoryRow);
  }

  async update(category: Category): Promise<Category> {
    const { data, error } = await this.db
      .from(TABLE)
      .update(CategoryMapper.toRow(category))
      .eq('user_id', category.userId)
      .eq('id', category.id)
      .select()
      .single();
    if (error) throw error;
    return CategoryMapper.toDomain(data as CategoryRow);
  }

  async delete(userId: string, id: string): Promise<void> {
    const { error } = await this.db.from(TABLE).delete().eq('user_id', userId).eq('id', id);
    if (error) throw error;
  }
}
