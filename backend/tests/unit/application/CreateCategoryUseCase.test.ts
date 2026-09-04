import { describe, expect, it } from 'vitest';
import { CreateCategoryUseCase } from '../../../src/application/use-cases/categories/CreateCategoryUseCase.js';
import { Category } from '../../../src/domain/entities/Category.js';
import {
  InMemoryCategoryRepository,
  SequentialIds,
  USER_ID,
} from '../../doubles/InMemoryRepositories.js';

function categoria(id: string, name: string, kind: 'income' | 'expense' = 'expense') {
  return new Category({
    id,
    userId: USER_ID,
    name,
    kind,
    color: null,
    icon: null,
    isSystem: true,
  });
}

describe('CreateCategoryUseCase', () => {
  it('cria a categoria com o nome digitado', async () => {
    const repo = new InMemoryCategoryRepository([]);
    const useCase = new CreateCategoryUseCase(repo, new SequentialIds());

    const { category, created } = await useCase.execute({
      userId: USER_ID,
      name: '  Pet  ',
      kind: 'expense',
    });

    expect(created).toBe(true);
    expect(category.name).toBe('Pet');
    expect(category.isSystem).toBe(false);
    expect(repo.categories).toHaveLength(1);
  });

  it('reaproveita a categoria existente em vez de duplicar o nome', async () => {
    const repo = new InMemoryCategoryRepository([categoria('c1', 'Lazer')]);
    const useCase = new CreateCategoryUseCase(repo, new SequentialIds());

    const { category, created } = await useCase.execute({ userId: USER_ID, name: 'lazer' });

    expect(created).toBe(false);
    expect(category.id).toBe('c1');
    expect(repo.categories).toHaveLength(1);
  });

  it('trata acento e caixa como o mesmo nome', async () => {
    const repo = new InMemoryCategoryRepository([categoria('c1', 'Alimentação')]);
    const useCase = new CreateCategoryUseCase(repo, new SequentialIds());

    const { created, category } = await useCase.execute({ userId: USER_ID, name: 'alimentacao' });

    expect(created).toBe(false);
    expect(category.id).toBe('c1');
  });

  it('recusa nome vazio', async () => {
    const useCase = new CreateCategoryUseCase(
      new InMemoryCategoryRepository([]),
      new SequentialIds(),
    );

    await expect(useCase.execute({ userId: USER_ID, name: '   ' })).rejects.toThrow(/nome/i);
  });
});
