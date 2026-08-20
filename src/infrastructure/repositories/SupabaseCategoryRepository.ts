import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category } from '../../domain/entities/Category';
import type { CategoryRepository } from '../../application/ports/repositories';
import { toCategory, type CategoryRow } from './rows';

/** Traz as regras junto na mesma query: categorizar faz N+1 se buscar separado. */
const WITH_RULES = '*, category_rules(match, learned)';

export class SupabaseCategoryRepository implements CategoryRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listByOwner(ownerId: string): Promise<Category[]> {
    const { data, error } = await this.db.from('categories').select(WITH_RULES).eq('owner_id', ownerId).order('name');
    if (error) throw new Error(`Falha ao listar categorias: ${error.message}`);
    return (data as unknown as CategoryRow[]).map(toCategory);
  }

  async findById(id: string): Promise<Category | null> {
    const { data, error } = await this.db.from('categories').select(WITH_RULES).eq('id', id).maybeSingle();
    if (error) throw new Error(`Falha ao buscar categoria ${id}: ${error.message}`);
    return data ? toCategory(data as unknown as CategoryRow) : null;
  }

  async findFallback(ownerId: string): Promise<Category | null> {
    const { data, error } = await this.db
      .from('categories')
      .select(WITH_RULES)
      .eq('owner_id', ownerId)
      .eq('is_fallback', true)
      .maybeSingle();
    if (error) throw new Error(`Falha ao buscar categoria fallback: ${error.message}`);
    return data ? toCategory(data as unknown as CategoryRow) : null;
  }

  async addRule(categoryId: string, match: string): Promise<void> {
    // Corrigir duas vezes o mesmo estabelecimento nao pode explodir: a regra
    // ja existe e isso e exatamente o resultado desejado.
    const { error } = await this.db
      .from('category_rules')
      .upsert({ category_id: categoryId, match, learned: true }, { onConflict: 'category_id,match', ignoreDuplicates: true });
    if (error) throw new Error(`Falha ao gravar regra aprendida: ${error.message}`);
  }
}
