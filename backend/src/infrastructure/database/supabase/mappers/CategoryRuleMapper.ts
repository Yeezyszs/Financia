import { CategoryRule, type CategoryRuleProps } from '../../../../domain/entities/CategoryRule.js';

export interface CategoryRuleRow {
  id: string;
  user_id: string;
  category_id: string;
  pattern: string;
  match_type: CategoryRuleProps['matchType'];
  account_id: string | null;
  priority: number;
  source: CategoryRuleProps['source'];
  is_active: boolean;
}

export const CategoryRuleMapper = {
  toDomain(row: CategoryRuleRow): CategoryRule {
    return new CategoryRule({
      id: row.id,
      userId: row.user_id,
      categoryId: row.category_id,
      pattern: row.pattern,
      matchType: row.match_type,
      accountId: row.account_id,
      priority: row.priority,
      source: row.source,
      isActive: row.is_active,
    });
  },

  toRow(rule: CategoryRule): CategoryRuleRow {
    return {
      id: rule.id,
      user_id: rule.userId,
      category_id: rule.categoryId,
      pattern: rule.pattern,
      match_type: rule.matchType,
      account_id: rule.accountId,
      priority: rule.priority,
      source: rule.source,
      is_active: rule.isActive,
    };
  },
};
