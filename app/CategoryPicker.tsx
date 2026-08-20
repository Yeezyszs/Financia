'use client';

import { useState, useTransition } from 'react';
import { recategorize } from './actions';

interface Props {
  transactionId: string;
  categoryId: string | null;
  isPending: boolean;
  categories: Array<{ id: string; name: string }>;
}

export function CategoryPicker({ transactionId, categoryId, isPending, categories }: Props) {
  const [value, setValue] = useState(categoryId ?? '');
  const [saving, startTransition] = useTransition();

  return (
    <select
      value={value}
      disabled={saving}
      // Destaca o que ainda esta no fallback: e a fila de trabalho do usuario.
      className={isPending ? 'pending' : ''}
      aria-label="Categoria da transacao"
      onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        startTransition(() => {
          void recategorize(transactionId, next);
        });
      }}
    >
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </select>
  );
}
