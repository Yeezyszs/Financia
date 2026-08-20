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
import { env, loadDotEnv } from '../src/infrastructure/config/env';

/**
 * Dominio e melhor que nome: `from:c6 bank` quebra a sintaxe do Gmail (o que
 * vem depois do espaco vira busca solta) e `from:inter` casaria com qualquer
 * remetente que contenha "inter", tipo "internacional".
 */
const BANK_DOMAINS = [
  'nubank.com.br',
  'c6bank.com.br',
  'bancointer.com.br',
  'itau.com.br',
  'bradesco.com.br',
  'santander.com.br',
  'btgpactual.com',
  'bb.com.br',
  'caixa.gov.br',
  'willbank.com.br',
  'neon.com.br',
  'original.com.br',
  'xpi.com.br',
];

loadDotEnv();

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
    : BANK_DOMAINS.map((domain) => `from:${domain}`).join(' OR ');

  console.log(`Buscando: ${query}\nDesde: ${since.toLocaleDateString('pt-BR')}\n`);
  const emails = await gmail.search({ query, after: since, maxResults: dumpFilter ? 30 : 100 });

  if (emails.length === 0) {
    console.log('Nenhum e-mail encontrado. Possiveis motivos:');
    console.log('  - o banco notifica so por push (caso comum do Nubank)');
    console.log('  - a notificacao por e-mail esta desligada no app do banco');
    console.log('  - o remetente usa um dominio fora da lista BANK_DOMAINS do script');
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
      for (const subject of subjects) console.log(`   - ${subject}`);
    }
    await sweepForTransactions(gmail, since);
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

/**
 * Busca por palavra tipica de notificacao de compra, sem filtrar remetente.
 * A visao por remetente pode enganar: se o banco manda 40 e-mails de
 * marketing e 1 de transacao, o de transacao se perde no meio. Aqui a
 * pergunta e direta - existe QUALQUER e-mail de compra nesta caixa?
 */
async function sweepForTransactions(gmail: GmailClient, since: Date): Promise<void> {
  const terms = [
    'subject:"compra aprovada"',
    'subject:"compra realizada"',
    'subject:"transacao aprovada"',
    'subject:"transação aprovada"',
    'subject:"compra no cartao"',
    'subject:"compra no cartão"',
    'subject:"voce fez uma compra"',
    'subject:"você fez uma compra"',
    'subject:"gasto aprovado"',
  ];

  console.log('\n' + '='.repeat(60));
  console.log('Varredura por e-mail de transacao (qualquer remetente)');
  console.log('='.repeat(60));

  const found = await gmail.search({ query: terms.join(' OR '), after: since, maxResults: 25 });

  if (found.length === 0) {
    console.log('\nNenhum e-mail de notificacao de compra encontrado.');
    console.log('Confirma que os bancos desta caixa notificam compra por push, nao por e-mail.');
    console.log('Ver SETUP.md, secao "Quando o banco nao manda e-mail de compra".');
    return;
  }

  console.log(`\n${found.length} e-mail(s) de transacao encontrados:\n`);
  for (const email of found) {
    const sender = /<(.+?)>/.exec(email.from)?.[1] ?? email.from;
    console.log(`   ${email.receivedAt.toLocaleDateString('pt-BR')}  ${sender}`);
    console.log(`      ${email.subject}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
