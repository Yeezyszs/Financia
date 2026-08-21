export type ImportStatus = 'pending' | 'completed' | 'failed';

export interface ImportProps {
  id: string;
  userId: string;
  accountId: string;
  filename: string;
  /** sha256 do arquivo — barra reimportação do mesmo arquivo. */
  fileHash: string;
  status: ImportStatus;
  rowsTotal: number;
  rowsImported: number;
  rowsDuplicated: number;
  periodStart: string | null;
  periodEnd: string | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export class Import {
  constructor(private readonly props: ImportProps) {}

  get id(): string { return this.props.id; }
  get userId(): string { return this.props.userId; }
  get accountId(): string { return this.props.accountId; }
  get filename(): string { return this.props.filename; }
  get fileHash(): string { return this.props.fileHash; }
  get status(): ImportStatus { return this.props.status; }
  get rowsTotal(): number { return this.props.rowsTotal; }
  get rowsImported(): number { return this.props.rowsImported; }
  get rowsDuplicated(): number { return this.props.rowsDuplicated; }

  complete(stats: { rowsTotal: number; rowsImported: number; rowsDuplicated: number; periodStart: string | null; periodEnd: string | null }): Import {
    return new Import({
      ...this.props,
      ...stats,
      status: 'completed',
      completedAt: new Date(),
    });
  }

  fail(message: string): Import {
    return new Import({
      ...this.props,
      status: 'failed',
      errorMessage: message,
      completedAt: new Date(),
    });
  }

  toJSON(): ImportProps { return { ...this.props }; }
}
