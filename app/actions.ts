'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/src/infrastructure/config/session';

/**
 * Correcao manual de categoria. Alem de corrigir a transacao, o use case grava
 * o estabelecimento como regra - da proxima vez a categorizacao acerta sozinha.
 */
export async function recategorize(transactionId: string, categoryId: string): Promise<void> {
  // Sem ownerId vindo do cliente: quem manda e a sessao. A RLS ainda barraria
  // uma transacao de outro dono, mas depender so dela seria contar com a
  // ultima linha de defesa.
  const { container } = await requireSession();
  await container.useCases.recategorize.execute({ transactionId, categoryId });
  revalidatePath('/');
}
