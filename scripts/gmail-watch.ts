/**
 * Registra (ou renova) o watch do Gmail apontando para o topico do Pub/Sub.
 *
 *   npm run gmail:watch
 *
 * Setup no Google Cloud, uma vez:
 *   1. Criar topico Pub/Sub, ex: projects/<projeto>/topics/gmail-financia
 *   2. Dar Pub/Sub Publisher no topico para gmail-api-push@system.gserviceaccount.com
 *   3. Criar subscription do tipo Push apontando para
 *      https://<seu-app>.vercel.app/api/gmail/webhook?token=<PUBSUB_VERIFICATION_TOKEN>
 *
 * O watch expira em 7 dias. O cron diario em /api/sync renova sozinho - este
 * script serve para o primeiro registro e para debug.
 */
import { GmailClient } from '../src/infrastructure/gateways/email/GmailClient';
import { GoogleOAuthTokenProvider } from '../src/infrastructure/gateways/email/GoogleOAuthTokenProvider';
import { env } from '../src/infrastructure/config/env';

async function main(): Promise<void> {
  const gmail = new GmailClient(
    new GoogleOAuthTokenProvider({
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      refreshToken: env.googleRefreshToken,
    }),
  );

  const result = await gmail.watch(env.googlePubsubTopic);
  console.log('Watch registrado.');
  console.log('  historyId:', result.historyId);
  console.log('  expira em:', new Date(Number(result.expiration)).toLocaleString('pt-BR'));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
