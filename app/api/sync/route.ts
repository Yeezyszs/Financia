import { NextResponse } from 'next/server';
import { buildContainer } from '@/src/infrastructure/config/container';
import { env } from '@/src/infrastructure/config/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Sync por busca (nao incremental). Tres papeis:
 *   1. rede de seguranca se uma notificacao do Pub/Sub se perder
 *   2. backfill do historico na primeira execucao (?days=90)
 *   3. renovacao do watch do Gmail, que o Google expira a cada 7 dias
 *
 * Chamado pelo cron da Vercel (vercel.json) e manualmente durante o setup.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const days = Number(new URL(request.url).searchParams.get('days') ?? '3');
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const { useCases, gmail, repositories } = buildContainer();

    const report = await useCases.sync.execute({ ownerId: env.defaultOwnerId, since });

    // Renova o watch na mesma passada: um watch expirado significa parar de
    // receber push sem nenhum erro aparente, que e o pior tipo de falha.
    const watch = await gmail.watch(env.googlePubsubTopic);
    const state = await repositories.gmailSyncState.get(env.defaultOwnerId);
    await repositories.gmailSyncState.save({
      ownerId: env.defaultOwnerId,
      emailAddress: state?.emailAddress ?? 'me',
      historyId: state?.historyId ?? watch.historyId,
      watchExpiresAt: new Date(Number(watch.expiration)),
    });

    return NextResponse.json({ ok: true, since: since.toISOString(), ...report });
  } catch (error) {
    console.error('[sync] falhou', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'erro desconhecido' },
      { status: 500 },
    );
  }
}
