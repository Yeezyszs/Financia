import { describe, expect, it } from 'vitest';
import { CategoryRule, type CategoryRuleProps } from '../../../src/domain/entities/CategoryRule.js';

function rule(overrides: Partial<CategoryRuleProps> = {}) {
  return new CategoryRule({
    id: 'r1',
    userId: 'u1',
    categoryId: 'c1',
    pattern: 'ifood',
    matchType: 'contains',
    accountId: null,
    priority: 10,
    source: 'system',
    isActive: true,
    ...overrides,
  });
}

describe('CategoryRule', () => {
  it('casa por trecho ignorando acento e caixa', () => {
    expect(rule().matches('IFOOD *RESTAURANTE', 'acc-1')).toBe(true);
    expect(rule({ pattern: 'farmácia' }).matches('FARMACIA PAGUE MENOS', 'acc-1')).toBe(true);
  });

  it('respeita a conta quando a regra é restrita', () => {
    const scoped = rule({ accountId: 'acc-2' });
    expect(scoped.matches('ifood', 'acc-1')).toBe(false);
    expect(scoped.matches('ifood', 'acc-2')).toBe(true);
  });

  it('regra inativa nunca casa', () => {
    expect(rule({ isActive: false }).matches('ifood', 'acc-1')).toBe(false);
  });

  it('regex inválida não derruba a importação', () => {
    expect(rule({ matchType: 'regex', pattern: '([' }).matches('qualquer', 'acc-1')).toBe(false);
  });
});
