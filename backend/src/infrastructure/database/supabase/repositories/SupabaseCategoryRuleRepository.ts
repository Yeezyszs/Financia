import type { SupabaseClient } from '@supabase/supabase-js';
import type { CategoryRule } from '../../../../domain/entities/CategoryRule.js';
import type { CategoryRuleRepository } from '../../../../application/ports/repositories/CategoryRuleRepository.js';
import { CategoryRuleMapper, type CategoryRuleRow } from '../mappers/CategoryRuleMapper.js';

const TABLE = 'category_rules';

export class SupabaseCategoryRuleRepository implements CategoryRuleRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listActiveByUser(userId: string): Promise<CategoryRule[]> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('priority', { ascending: true });
    if (error) throw error;
    return (data as CategoryRuleRow[]).map(CategoryRuleMapper.toDomain);
  }

  async findById(userId: string, id: string): Promise<CategoryRule | null> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? CategoryRuleMapper.toDomain(data as CategoryRuleRow) : null;
  }

  async findByPattern(
    userId: string,
    pattern: string,
    matchType: CategoryRule['matchType'],
  ): Promise<CategoryRule | null> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .eq('pattern', pattern)
      .eq('match_type', matchType)
      .is('account_id', null)
      .maybeSingle();
    if (error) throw error;
    return data ? CategoryRuleMapper.toDomain(data as CategoryRuleRow) : null;
  }

  async create(rule: CategoryRule): Promise<CategoryRule> {
    const { data, error } = await this.db
      .from(TABLE)
      .insert(CategoryRuleMapper.toRow(rule))
      .select()
      .single();
    if (error) throw error;
    return CategoryRuleMapper.toDomain(data as CategoryRuleRow);
  }

  async update(rule: CategoryRule): Promise<CategoryRule> {
    const { data, error } = await this.db
      .from(TABLE)
      .update(CategoryRuleMapper.toRow(rule))
      .eq('user_id', rule.userId)
      .eq('id', rule.id)
      .select()
      .single();
    if (error) throw error;
    return CategoryRuleMapper.toDomain(data as CategoryRuleRow);
  }

  async delete(userId: string, id: string): Promise<void> {
    const { error } = await this.db.from(TABLE).delete().eq('user_id', userId).eq('id', id);
    if (error) throw error;
  }

  /** Contador de uso das regras — alimenta "quais regras estão pegando". */
  async incrementHits(ruleIds: string[]): Promise<void> {
    if (ruleIds.length === 0) return;
    const { error } = await this.db.rpc('increment_rule_hits', { p_rule_ids: ruleIds });
    if (error) throw error;
  }
}
