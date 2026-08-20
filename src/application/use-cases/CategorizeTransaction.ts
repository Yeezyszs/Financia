import { normalizeMerchant } from '../../domain/entities/Category.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import type { CategoryRepository } from '../ports/repositories.js';

/**
 * Resolve a categoria de um estabelecimento por regra deterministica.
 * Sem ML nesta fase: regra que casa, casa; o resto cai no fallback e espera
 * a correcao manual, que vira regra nova.
 */
export class CategorizeTransaction {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(input: { ownerId: string; merchant: string }): Promise<{ categoryId: string; matched: boolean }> {
    const normalized = normalizeMerchant(input.merchant);
    const all = await this.categories.listByOwner(input.ownerId);

    // Regra mais longa primeiro: "UBER EATS" deve ganhar de "UBER".
    const candidates = all
      .flatMap((category) => category.rules.map((rule) => ({ category, rule })))
      .sort((a, b) => b.rule.match.length - a.rule.match.length);

    const hit = candidates.find(({ rule }) => normalized.includes(rule.match));
    if (hit) {
      return { categoryId: hit.category.id, matched: true };
    }

    const fallback = await this.categories.findFallback(input.ownerId);
    if (!fallback) {
      throw new DomainError('Categoria fallback "Nao categorizado" nao existe para este usuario', 'CATEGORY_FALLBACK_MISSING');
    }
    return { categoryId: fallback.id, matched: false };
  }
}
