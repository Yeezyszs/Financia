import type { CategoryRule } from '../../../domain/entities/CategoryRule.js';

export interface CategoryRuleRepository {
  /** Regras ativas do usuário, já ordenadas por prioridade crescente. */
  listActiveByUser(userId: string): Promise<CategoryRule[]>;
  findById(userId: string, id: string): Promise<CategoryRule | null>;

  /** Busca a regra global de um padrão — usada para não duplicar aprendizado. */
  findByPattern(
    userId: string,
    pattern: string,
    matchType: CategoryRule['matchType'],
  ): Promise<CategoryRule | null>;
  create(rule: CategoryRule): Promise<CategoryRule>;
  update(rule: CategoryRule): Promise<CategoryRule>;
  delete(userId: string, id: string): Promise<void>;
  incrementHits(ruleIds: string[]): Promise<void>;
}
