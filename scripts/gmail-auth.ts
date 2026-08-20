/**
 * Obtem o refresh token do Gmail uma vez.
 *
 *   npm run gmail:auth      (ou npm run authorize)
 *
 * Aceita os dois jeitos de fornecer a credencial:
 *
 *   a) credentials.json na raiz - o arquivo que o Cloud Console baixa. Serve
 *      tanto para client tipo "App para computador" (chave `installed`) quanto
 *      "Aplicativo da Web" (chave `web`).
 *   b) GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no .env.
 *
 * O (a) e mais comodo no setup; o (b) e o que roda em producao, onde nao ha
 * disco para guardar arquivo. Se os dois existirem, credentials.json ganha.
 *
 * IMPORTANTE: publique o app como "In production" na tela de consentimento.
 * Em modo "Testing" o Google expira o refresh token em 7 DIAS e a ingestao
 * para sozinha, sem erro visivel. Publicar sem passar pela verificacao do
 * Google funciona para a propria conta - so mostra uma tela de aviso.
 */
import { createServer } from 'node:http';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { loadDotEnv } from '../src/infrastructure/config/env';

// O .env pode nem existir ainda se a credencial vier de credentials.json.
try {
  loadDotEnv();
} catch {
  /* sem .env: segue com credentials.json */
}

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const CALLBACK_PORT = 3000;

interface Credentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  origin: string;
}

/** Formato do JSON do Cloud Console: `installed` (desktop) ou `web`. */
interface CredentialsFile {
  installed?: { client_id: string; client_secret: string; redirect_uris?: string[] };
  web?: { client_id: string; client_secret: string; redirect_uris?: string[] };
}

function readCredentials(): Credentials {
  if (existsSync('credentials.json')) {
    const file = JSON.parse(readFileSync('credentials.json', 'utf-8')) as CredentialsFile;
    const client = file.installed ?? file.web;
    if (!client?.client_id || !client.client_secret) {
      throw new Error('credentials.json nao tem a chave "installed" nem "web" com client_id e client_secret.');
    }

    // Client de desktop normalmente registra "http://localhost" sem porta;
    // o Google aceita qualquer porta no loopback, mas a URL enviada precisa
    // apontar para a porta onde este script realmente escuta.
    const registered = client.redirect_uris?.[0] ?? `http://localhost:${CALLBACK_PORT}`;
    const url = new URL(registered);
    if (!url.port) url.port = String(CALLBACK_PORT);

    return {
      clientId: client.client_id,
      clientSecret: client.client_secret,
      redirectUri: url.toString().replace(/\/$/, url.pathname === '/' ? '' : '/'),
      origin: 'credentials.json',
    };
  }

  const clientId = process.env['GOOGLE_CLIENT_ID'];
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    throw new Error(
      'Credencial nao encontrada. Escolha um caminho:\n' +
        '  - baixe o JSON do Cloud Console e salve como credentials.json na raiz, ou\n' +
        '  - preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env',
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri: process.env['GOOGLE_REDIRECT_URI'] ?? `http://localhost:${CALLBACK_PORT}/oauth/callback`,
    origin: '.env',
  };
}

async function main(): Promise<void> {
  const credentials = readCredentials();
  console.log(`Credencial lida de ${credentials.origin}`);
  console.log(`Redirect URI: ${credentials.redirectUri}\n`);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', credentials.clientId);
  authUrl.searchParams.set('redirect_uri', credentials.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPE);
  // Sem estes dois o Google devolve so access token quando a conta ja
  // autorizou este app antes, e o refresh token nunca aparece.
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  console.log('Abra esta URL no navegador e autorize:\n');
  console.log(authUrl.toString());
  console.log(`\nAguardando o callback em localhost:${CALLBACK_PORT} ...\n`);

  const code = await waitForCode();

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: credentials.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Troca do code falhou (${response.status}): ${await response.text()}\n\n` +
        'Se disser redirect_uri_mismatch, o URI acima nao esta cadastrado no client OAuth.',
    );
  }

  const data = (await response.json()) as { refresh_token?: string };
  if (!data.refresh_token) {
    throw new Error(
      'Google nao devolveu refresh_token. Acontece quando a conta ja autorizou este app antes: ' +
        'revogue em https://myaccount.google.com/permissions e rode de novo.',
    );
  }

  saveToEnv(data.refresh_token);
}

/** Grava no .env em vez de pedir copy-paste: o token e longo e truncar da erro obscuro. */
function saveToEnv(refreshToken: string): void {
  const line = `GOOGLE_REFRESH_TOKEN=${refreshToken}`;

  if (!existsSync('.env')) {
    console.log(`\n.env nao existe. Crie com \`cp .env.example .env\` e adicione:\n\n${line}\n`);
    return;
  }

  const current = readFileSync('.env', 'utf-8');
  const existing = /^GOOGLE_REFRESH_TOKEN=(.*)$/m.exec(current);

  if (existing?.[1]?.trim()) {
    // Sobrescrever apagaria um token que talvez ainda funcione noutro ambiente.
    console.log(`\nJa existe GOOGLE_REFRESH_TOKEN no .env. Se quiser trocar, substitua por:\n\n${line}\n`);
    return;
  }

  appendFileSync('.env', `${current.endsWith('\n') ? '' : '\n'}${line}\n`, 'utf-8');
  console.log('\nRefresh token gravado no .env. Proximo passo:\n\n  npm run explore\n');
}

function waitForCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${CALLBACK_PORT}`);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      // Aceita qualquer caminho: client de desktop redireciona para "/", client
      // web para o path cadastrado. Sem isto, um dos dois tomaria 404 aqui.
      if (!code && !error) {
        res.writeHead(404).end();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<p>${code ? 'Autorizado. Pode fechar esta aba.' : `Erro: ${error}`}</p>`);
      server.close();

      if (code) resolve(code);
      else reject(new Error(`Autorizacao negada: ${error}`));
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'EADDRINUSE'
          ? new Error(`Porta ${CALLBACK_PORT} ocupada. Feche o \`npm run dev\` e rode de novo.`)
          : err,
      );
    });
    server.listen(CALLBACK_PORT);
  });
}

main().catch((error: unknown) => {
  console.error('\n' + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
