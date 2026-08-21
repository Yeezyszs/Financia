export type CategoryKind = 'income' | 'expense' | 'transfer';

export interface CategoryProps {
  id: string;
  userId: string;
  name: string;
  kind: CategoryKind;
  color: string | null;
  icon: string | null;
  isSystem: boolean;
}

export class Category {
  constructor(private readonly props: CategoryProps) {}

  get id(): string { return this.props.id; }
  get userId(): string { return this.props.userId; }
  get name(): string { return this.props.name; }
  get kind(): CategoryKind { return this.props.kind; }
  get color(): string | null { return this.props.color; }
  get icon(): string | null { return this.props.icon; }
  get isSystem(): boolean { return this.props.isSystem; }

  /** Categoria de transferência nunca entra em receita/despesa. */
  get countsTowardTotals(): boolean { return this.props.kind !== 'transfer'; }

  toJSON(): CategoryProps { return { ...this.props }; }
}
