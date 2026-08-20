import { DomainError } from '../errors/DomainError.js';

export interface CategoryRule {
  /** Trecho procurado no nome do estabelecimento, ja normalizado (upper, sem acento). */
  match: string;
  /** Regra criada pela correcao manual do usuario, nao pelo seed inicial. */
  learned: boolean;
}

export interface CategoryProps {
  id: string;
  ownerId: string;
  name: string;
  rules?: CategoryRule[];
}

/** Categoria usada quando nenhuma regra casa. Nunca deixa transacao sem categoria. */
export const UNCATEGORIZED = 'Nao categorizado';

export class Category {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly rules: CategoryRule[];

  constructor(props: CategoryProps) {
    if (props.name.trim() === '') {
      throw new DomainError('Categoria precisa de um nome', 'CATEGORY_NAME_REQUIRED');
    }
    this.id = props.id;
    this.ownerId = props.ownerId;
    this.name = props.name.trim();
    this.rules = props.rules ?? [];
  }

  get isFallback(): boolean {
    return this.name === UNCATEGORIZED;
  }

  matches(normalizedMerchant: string): boolean {
    return this.rules.some((rule) => normalizedMerchant.includes(rule.match));
  }
}

/**
 * Normalizacao usada tanto pelas regras quanto pelo matching: maiuscula, sem
 * acento, sem pontuacao, espacos colapsados. "Padaria Sao Joao" -> "PADARIA SAO JOAO".
 * As duas pontas precisam usar a mesma funcao, senao a regra nunca casa.
 */
export function normalizeMerchant(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
