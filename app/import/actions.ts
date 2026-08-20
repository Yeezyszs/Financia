'use server';

import { revalidatePath } from 'next/cache';
import { buildContainer } from '@/src/infrastructure/config/container';
import { env } from '@/src/infrastructure/config/env';
import { readCsv } from '@/src/infrastructure/gateways/statement/CsvReader';
import type { ImportReport } from '@/src/application/use-cases/ImportStatementFile';

export type ImportState = { report?: ImportReport; error?: string } | null;

export async function importStatement(_previous: ImportState, formData: FormData): Promise<ImportState> {
  const file = formData.get('file');
  const accountId = String(formData.get('accountId') ?? '');

  if (!(file instanceof File) || file.size === 0) return { error: 'Escolha um arquivo.' };
  if (!accountId) return { error: 'Escolha a conta de destino.' };

  try {
    const { useCases } = buildContainer();
    const report = await useCases.importStatement.execute({
      ownerId: env.defaultOwnerId,
      accountId,
      table: readCsv(await file.text()),
    });

    revalidatePath('/');
    return { report };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Falha ao importar.' };
  }
}
