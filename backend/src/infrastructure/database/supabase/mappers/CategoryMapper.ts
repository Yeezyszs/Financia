import { Category, type CategoryProps } from '../../../../domain/entities/Category.js';

export interface CategoryRow {
  id: string;
  user_id: string;
  name: string;
  kind: CategoryProps['kind'];
  color: string | null;
  icon: string | null;
  is_system: boolean;
}

export const CategoryMapper = {
  toDomain(row: CategoryRow): Category {
    return new Category({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      kind: row.kind,
      color: row.color,
      icon: row.icon,
      isSystem: row.is_system,
    });
  },

  toRow(category: Category): CategoryRow {
    return {
      id: category.id,
      user_id: category.userId,
      name: category.name,
      kind: category.kind,
      color: category.color,
      icon: category.icon,
      is_system: category.isSystem,
    };
  },
};
