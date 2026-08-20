import { describe, expect, it } from 'vitest';
import { CategorizeTransaction } from '../../src/application/use-cases/CategorizeTransaction';
import { Category } from '../../src/domain/entities/Category';
import { FakeCategoryRepository, category } from '../fakes';

const fallback = new Category({ id: 'cat-0', ownerId: 'pedro', name: 'Nao categorizado' });

describe('CategorizeTransaction', () => {
  it('casa por palavra-chave ignorando caixa e acento', async () => {
    const repo = new FakeCategoryRepository([fallback, category('cat-1', 'Alimentacao', ['PADARIA'])]);
    const useCase = new CategorizeTransaction(repo);

    const result = await useCase.execute({ ownerId: 'pedro', merchant: 'Padaria São João Ltda' });

    expect(result).toEqual({ categoryId: 'cat-1', matched: true });
  });

  it('prefere a regra mais especifica quando duas casam', async () => {
    const repo = new FakeCategoryRepository([
      fallback,
      category('cat-transporte', 'Transporte', ['UBER']),
      category('cat-comida', 'Alimentacao', ['UBER EATS']),
    ]);
    const useCase = new CategorizeTransaction(repo);

    const result = await useCase.execute({ ownerId: 'pedro', merchant: 'UBER EATS SAO PAULO' });

    expect(result.categoryId).toBe('cat-comida');
  });

  it('cai no fallback quando nada casa', async () => {
    const repo = new FakeCategoryRepository([fallback, category('cat-1', 'Alimentacao', ['IFOOD'])]);
    const useCase = new CategorizeTransaction(repo);

    const result = await useCase.execute({ ownerId: 'pedro', merchant: 'ESTABELECIMENTO DESCONHECIDO' });

    expect(result).toEqual({ categoryId: 'cat-0', matched: false });
  });

  it('falha alto se o usuario nao tem fallback cadastrado', async () => {
    const useCase = new CategorizeTransaction(new FakeCategoryRepository([]));
    await expect(useCase.execute({ ownerId: 'pedro', merchant: 'X' })).rejects.toThrow(/fallback/);
  });
});
