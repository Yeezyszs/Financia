import { Import, type ImportProps } from '../../../../domain/entities/Import.js';

export interface ImportRow {
  id: string;
  user_id: string;
  account_id: string;
  filename: string;
  file_hash: string;
  status: ImportProps['status'];
  rows_total: number;
  rows_imported: number;
  rows_duplicated: number;
  period_start: string | null;
  period_end: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export const ImportMapper = {
  toDomain(row: ImportRow): Import {
    return new Import({
      id: row.id,
      userId: row.user_id,
      accountId: row.account_id,
      filename: row.filename,
      fileHash: row.file_hash,
      status: row.status,
      rowsTotal: row.rows_total,
      rowsImported: row.rows_imported,
      rowsDuplicated: row.rows_duplicated,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      errorMessage: row.error_message,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
    });
  },

  toRow(record: Import): ImportRow {
    const props = record.toJSON();
    return {
      id: props.id,
      user_id: props.userId,
      account_id: props.accountId,
      filename: props.filename,
      file_hash: props.fileHash,
      status: props.status,
      rows_total: props.rowsTotal,
      rows_imported: props.rowsImported,
      rows_duplicated: props.rowsDuplicated,
      period_start: props.periodStart,
      period_end: props.periodEnd,
      error_message: props.errorMessage,
      created_at: props.createdAt.toISOString(),
      completed_at: props.completedAt ? props.completedAt.toISOString() : null,
    };
  },
};
