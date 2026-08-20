/**
 * Obtem o refresh token do Gmail uma vez, para colar no .env.
 *
 *   npm run gmail:auth
 *
 * Pre-requisitos no Google Cloud Console:
 *   1. Projeto criado, Gmail API habilitada
 *   2. OAuth consent screen: tipo "External", seu e-mail como usuario de teste
 *   3. Credencial "OAuth client ID" do tipo "Web application", com
 *      http://localhost:3000/oauth/callback nos redirect URIs autorizados
 *
 * IMPORTANTE: publique o app como "In production" na consent screen. Em modo
 * "Testing" o Google expira o refresh token em 7 DIAS e a ingestao para de
 * funcionar sozinha. Publicar sem passar pela verificacao do Google funciona
 * para a propria conta - so mostra uma tela de aviso no consentimento.
 */
import { createServer } from 'node:http';
import { loadDotEnv } from '../src/infrastructure/config/env';

loadDotEnv();

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/oauth/callback';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Defina ${name} no .env antes de rodar este script.`);
  return value;
}

async function main(): Promise<void> {
  const clientId = required('GOOGLE_CLIENT_ID');
  const clientSecret = required('GOOGLE_CLIENT_SECRET');

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPE);
  // Sem estes dois o Google devolve so access token na segunda autorizacao em
  // diante, e o refresh token nunca aparece.
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  console.log('\nAbra esta URL no navegador e autorize:\n');
  console.log(authUrl.toString());
  console.log('\nAguardando o callback em', REDIRECT_URI, '...\n');

  const code = await waitForCode();

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) throw new Error(`Troca do code falhou (${response.status}): ${await response.text()}`);

  const data = (await response.json()) as { refresh_token?: string };
  if (!data.refresh_token) {
    throw new Error(
      'Google nao devolveu refresh_token. Isso acontece quando a conta ja autorizou este app antes: ' +
        'revogue o acesso em https://myaccount.google.com/permissions e rode de novo.',
    );
  }

  console.log('\nCole no .env:\n');
  console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}\n`);
}

function waitForCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost:3000');
      if (url.pathname !== '/oauth/callback') {
        res.writeHead(404).end();
        return;
      }

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<p>${code ? 'Autorizado. Pode fechar esta aba.' : `Erro: ${error}`}</p>`);
      server.close();

      if (code) resolve(code);
      else reject(new Error(`Autorizacao negada: ${error}`));
    });
    server.listen(3000);
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
