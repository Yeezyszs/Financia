import { normalizeDescription } from '../value-objects/TransactionFingerprint.js';

export type RuleMatchType = 'contains' | 'exact' | 'regex';
export type RuleSource = 'manual' | 'learned' | 'system';

export interface CategoryRuleProps {
  id: string;
  userId: string;
  categoryId: string;
  pattern: string;
  matchType: RuleMatchType;
  /** Quando definido, a regra só vale para essa conta. */
  accountId: string | null;
  priority: number;
  source: RuleSource;
  isActive: boolean;
}

export class CategoryRule {
  constructor(private readonly props: CategoryRuleProps) {}

  get id(): string { return this.props.id; }
  get userId(): string { return this.props.userId; }
  get categoryId(): string { return this.props.categoryId; }
  get pattern(): string { return this.props.pattern; }
  get matchType(): RuleMatchType { return this.props.matchType; }
  get accountId(): string | null { return this.props.accountId; }
  get priority(): number { return this.props.priority; }
  get source(): RuleSource { return this.props.source; }
  get isActive(): boolean { return this.props.isActive; }

  matches(description: string, accountId: string): boolean {
    if (!this.props.isActive) return false;
    if (this.props.accountId && this.props.accountId !== accountId) return false;

    const target = normalizeDescription(description);
    const pattern = this.props.matchType === 'regex'
      ? this.props.pattern
      : normalizeDescription(this.props.pattern);

    switch (this.props.matchType) {
      case 'exact':
        return target === pattern;
      case 'contains':
        return pattern.length > 0 && target.includes(pattern);
      case 'regex':
        try {
          return new RegExp(pattern, 'i').test(description);
        } catch {
          return false; // regra com regex inválida nunca derruba a importação
        }
    }
  }

  toJSON(): CategoryRuleProps { return { ...this.props }; }
}
