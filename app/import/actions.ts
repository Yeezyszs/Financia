'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/src/infrastructure/config/session';
import { readCsv } from '@/src/infrastructure/gateways/statement/CsvReader';
import type { ImportReport } from '@/src/application/use-cases/ImportStatementFile';

export type ImportState = { report?: ImportReport; error?: string } | null;

export async function importStatement(_previous: ImportState, formData: FormData): Promise<ImportState> {
  const file = formData.get('file');
  const accountId = String(formData.get('accountId') ?? '');

  if (!(file instanceof File) || file.size === 0) return { error: 'Escolha um arquivo.' };
  if (!accountId) return { error: 'Escolha a conta de destino.' };

  try {
    const { ownerId, container } = await requireSession();
    const report = await container.useCases.importStatement.execute({
      ownerId,
      accountId,
      table: readCsv(await file.text()),
    });

    revalidatePath('/');
    return { report };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Falha ao importar.' };
  }
}
