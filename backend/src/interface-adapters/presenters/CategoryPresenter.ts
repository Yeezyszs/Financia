import type { Category } from '../../domain/entities/Category.js';

export const CategoryPresenter = {
  toHttp(category: Category) {
    return {
      id: category.id,
      name: category.name,
      kind: category.kind,
      color: category.color,
      icon: category.icon,
      isSystem: category.isSystem,
    };
  },
};
