import { useEffect, useState } from 'react';

/**
 * Layout que muda de forma (tabela vira cartão, nav vai para o rodapé)
 * precisa da decisão em JS, não só em CSS — não dá para "esconder" uma
 * tabela e mostrar cartões sem renderizar as duas coisas.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = (event: MediaQueryListEvent) => setMatches(event.matches);

    setMatches(list.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return matches;
}

/** Ponto onde a tabela de transações deixa de caber. */
export const MOBILE = '(max-width: 720px)';
