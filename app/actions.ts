'use server';

import { revalidatePath } from 'next/cache';
import { buildContainer } from '@/src/infrastructure/config/container';

/**
 * Correcao manual de categoria. Alem de corrigir a transacao, o use case grava
 * o estabelecimento como regra - da proxima vez a categorizacao acerta sozinha.
 */
export async function recategorize(transactionId: string, categoryId: string): Promise<void> {
  const { useCases } = buildContainer();
  await useCases.recategorize.execute({ transactionId, categoryId });
  revalidatePath('/');
}
