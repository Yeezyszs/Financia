/**
 * Modo exploracao: dumpa e-mails de banco reais da caixa para o disco.
 *
 * Escrever parser adivinhando o formato e a forma mais rapida de perder uma
 * tarde. Rode isto ANTES de mexer nos regex:
 *
 *   npm run explore                      # remetentes de banco dos ultimos 90 dias
 *   npm run explore -- --dump nubank     # dumpa os corpos daquele remetente
 *
 * Os arquivos saem em .explore/ (ignorado pelo git) porque contem dados
 * financeiros reais - nunca commitar.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { GmailClient } from '../src/infrastructure/gateways/email/GmailClient';
import { GoogleOAuthTokenProvider } from '../src/infrastructure/gateways/email/GoogleOAuthTokenProvider';
import { env } from '../src/infrastructure/config/env';

const BANK_TERMS = [
  'nubank', 'c6bank', 'c6 bank', 'itau', 'bradesco', 'santander', 'inter',
  'btg', 'caixa', 'banco do brasil', 'will bank', 'neon', 'original',
];

async function main(): Promise<void> {
  const gmail = new GmailClient(
    new GoogleOAuthTokenProvider({
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      refreshToken: env.googleRefreshToken,
    }),
  );

  const dumpFilter = process.argv.includes('--dump')
    ? process.argv[process.argv.indexOf('--dump') + 1]
    : null;

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const query = dumpFilter
    ? `from:${dumpFilter}`
    : BANK_TERMS.map((term) => `from:${term}`).join(' OR ');

  console.log(`Buscando: ${query}\nDesde: ${since.toLocaleDateString('pt-BR')}\n`);
  const emails = await gmail.search({ query, after: since, maxResults: dumpFilter ? 30 : 100 });

  if (emails.length === 0) {
    console.log('Nenhum e-mail encontrado. Possiveis motivos:');
    console.log('  - o banco notifica so por push (caso comum do Nubank)');
    console.log('  - a notificacao por e-mail esta desligada no app do banco');
    console.log('  - o remetente usa um dominio que nao esta em BANK_TERMS');
    return;
  }

  if (!dumpFilter) {
    // Visao agregada: quem manda quanto, e com quais assuntos. E daqui que sai
    // a decisao de qual banco vira o primeiro parser.
    const bySender = new Map<string, { count: number; subjects: Set<string> }>();
    for (const email of emails) {
      const sender = email.from.match(/<(.+?)>/)?.[1] ?? email.from;
      const entry = bySender.get(sender) ?? { count: 0, subjects: new Set<string>() };
      entry.count += 1;
      entry.subjects.add(email.subject);
      bySender.set(sender, entry);
    }

    for (const [sender, { count, subjects }] of [...bySender].sort((a, b) => b[1].count - a[1].count)) {
      console.log(`\n${sender}  (${count} e-mails)`);
      for (const subject of [...subjects].slice(0, 8)) console.log(`   - ${subject}`);
      if (subjects.size > 8) console.log(`   ... e mais ${subjects.size - 8} assuntos`);
    }
    console.log(`\nProximo passo: npm run explore -- --dump <remetente>`);
    return;
  }

  await mkdir('.explore', { recursive: true });
  for (const email of emails) {
    const name = `.explore/${dumpFilter}-${email.id}.txt`;
    await writeFile(
      name,
      [`FROM: ${email.from}`, `SUBJECT: ${email.subject}`, `DATE: ${email.receivedAt.toISOString()}`, '', email.body].join('\n'),
      'utf-8',
    );
  }
  console.log(`${emails.length} e-mails dumpados em .explore/`);
  console.log('Anonimize um exemplar de cada formato e salve em tests/fixtures/ antes de ajustar o parser.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
