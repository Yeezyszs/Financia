import { readFileSync } from 'node:fs';

/**
 * Carrega o .env para os scripts de linha de comando.
 *
 * O Next carrega .env sozinho, mas `tsx` nao - sem isto, `npm run explore`
 * falharia dizendo que a variavel nao existe mesmo com o arquivo preenchido.
 * Parser proprio em vez de dotenv: sao 12 linhas contra uma dependencia, e
 * `node --env-file` morre com "not found" quando o arquivo nao existe, que e
 * exatamente o caso em que a pessoa mais precisa de uma mensagem util.
 *
 * Nao sobrescreve variavel ja definida no processo: em producao quem manda e
 * a Vercel, nao um .env que por acaso tenha ido junto.
 */
export function loadDotEnv(path = '.env'): void {
  let content: string;
  try {
    content = readFileSync(path, 'utf-8');
  } catch {
    throw new Error(
      `Arquivo ${path} nao encontrado. Crie a partir do modelo:\n\n  cp .env.example .env\n\n` +
        'Depois preencha as variaveis (veja SETUP.md).',
    );
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["'](.*)["']$/, '$1');
    if (value !== '' && process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * Le e valida env vars uma vez, com erro claro. Ler process.env espalhado pelo
 * codigo faz a falta de uma variavel aparecer como `undefined` num lugar
 * aleatorio, meia hora depois do deploy.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variavel de ambiente obrigatoria nao definida: ${name}.\n` +
        'Preencha no .env (local) ou nas Environment Variables da Vercel. Veja SETUP.md.',
    );
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return required('SUPABASE_URL');
  },
  get supabaseServiceRoleKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
  get googleClientId() {
    return required('GOOGLE_CLIENT_ID');
  },
  get googleClientSecret() {
    return required('GOOGLE_CLIENT_SECRET');
  },
  get googleRefreshToken() {
    return required('GOOGLE_REFRESH_TOKEN');
  },
  get googlePubsubTopic() {
    return required('GOOGLE_PUBSUB_TOPIC');
  },
  get pubsubVerificationToken() {
    return required('PUBSUB_VERIFICATION_TOKEN');
  },
  get cronSecret() {
    return required('CRON_SECRET');
  },
  get defaultOwnerId() {
    return required('DEFAULT_OWNER_ID');
  },
};
