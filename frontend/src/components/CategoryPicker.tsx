import { useState, type ReactNode } from 'react';
import type { Category } from '../api/types.js';

/** Valor reservado para a última opção, que abre a caixa de edição. */
const ESCREVER = '__escrever__';

/**
 * Seletor de categoria de uma transação.
 *
 * É um `select` nativo de propósito: no celular ele abre a roda do
 * sistema, que é mais confortável que qualquer lista customizada, e no
 * teclado já vem com navegação e busca por letra de graça.
 *
 * A última opção não é uma categoria: ela abre a caixa onde dá para
 * escrever um nome novo. Fica aqui, e não num botão ao lado, porque é
 * neste menu que se percebe que nenhuma das opções serve.
 */
export function CategoryPicker({
  value,
  categories,
  onChange,
  onEscrever,
  disabled,
  id,
}: {
  value: string | null;
  categories: Category[];
  onChange: (categoryId: string | null) => void | Promise<void>;
  /** Quando existe, o menu ganha a opção de escrever uma categoria nova. */
  onEscrever?: () => void;
  disabled?: boolean;
  id?: string;
}): ReactNode {
  const [salvando, setSalvando] = useState(false);

  async function alterar(proximo: string): Promise<void> {
    if (proximo === ESCREVER) {
      onEscrever?.();
      return;
    }

    setSalvando(true);
    try {
      await onChange(proximo === '' ? null : proximo);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <select
      {...(id ? { id } : {})}
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
      {onEscrever ? <option value={ESCREVER}>✎ escrever categoria / observação…</option> : null}
    </select>
  );
}
