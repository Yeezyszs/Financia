import { useState, type ReactNode } from 'react';
import type { Category } from '../api/types.js';

/**
 * Seletor de categoria de uma transação.
 *
 * É um `select` nativo de propósito: no celular ele abre a roda do
 * sistema, que é mais confortável que qualquer lista customizada, e no
 * teclado já vem com navegação e busca por letra de graça.
 */
export function CategoryPicker({
  value,
  categories,
  onChange,
  disabled,
}: {
  value: string | null;
  categories: Category[];
  onChange: (categoryId: string | null) => void | Promise<void>;
  disabled?: boolean;
}): ReactNode {
  const [salvando, setSalvando] = useState(false);

  async function alterar(proximo: string): Promise<void> {
    setSalvando(true);
    try {
      await onChange(proximo === '' ? null : proximo);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <select
      className={value ? 'category-picker' : 'category-picker sem-categoria'}
      value={value ?? ''}
      disabled={disabled || salvando}
      onChange={(e) => void alterar(e.target.value)}
      aria-label="Categoria da transação"
    >
      <option value="">sem categoria</option>
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </select>
  );
}
