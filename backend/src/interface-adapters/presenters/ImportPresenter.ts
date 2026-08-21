import type { Import } from '../../domain/entities/Import.js';

export const ImportPresenter = {
  toHttp(record: Import) {
    const props = record.toJSON();
    return {
      id: props.id,
      accountId: props.accountId,
      filename: props.filename,
      status: props.status,
      rowsTotal: props.rowsTotal,
      rowsImported: props.rowsImported,
      rowsDuplicated: props.rowsDuplicated,
      periodStart: props.periodStart,
      periodEnd: props.periodEnd,
      errorMessage: props.errorMessage,
      createdAt: props.createdAt.toISOString(),
      completedAt: props.completedAt?.toISOString() ?? null,
    };
  },
};
