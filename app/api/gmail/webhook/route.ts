import { NextResponse } from 'next/server';
import { buildContainer } from '@/src/infrastructure/config/container';
import { env } from '@/src/infrastructure/config/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PubSubEnvelope {
  message?: { data?: string; messageId?: string };
  subscription?: string;
}

/**
 * Endpoint que recebe o push do Gmail via Pub/Sub.
 *
 * Regra de ouro do Pub/Sub: 2xx = "processei, pode esquecer"; qualquer outra
 * coisa = redelivery. Por isso payload malformado devolve 200 (retentar nao
 * vai consertar um JSON quebrado, so gera loop infinito), enquanto falha de
 * processamento devolve 500 para o Pub/Sub tentar de novo.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get('token');
  if (token !== env.pubsubVerificationToken) {
    // 401 e proposital: endpoint publico sem validacao aceitaria qualquer POST.
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let notification: { emailAddress: string; historyId: string };
  try {
    const envelope = (await request.json()) as PubSubEnvelope;
    const raw = envelope.message?.data;
    if (!raw) return NextResponse.json({ ok: true, skipped: 'envelope sem data' });

    notification = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as typeof notification;
  } catch {
    return NextResponse.json({ ok: true, skipped: 'payload malformado' });
  }

  try {
    const { useCases } = buildContainer();
    const report = await useCases.ingestFromNotification.execute({
      ownerId: env.defaultOwnerId,
      emailAddress: notification.emailAddress,
      historyId: String(notification.historyId),
    });

    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    console.error('[gmail-webhook] falha ao processar notificacao', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'erro desconhecido' },
      { status: 500 },
    );
  }
}
