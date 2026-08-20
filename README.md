# Financia

Controle financeiro pessoal que ingere transacoes automaticamente a partir dos
e-mails de notificacao de compra do banco. Sem lancamento manual.

> **Nota de rota (ago/2026):** o `explore` confirmou que **nem Nubank nem C6
> enviam e-mail por transacao** — compra e notificada por push no app. A
> ingestao por e-mail continua no codigo e funcional, mas a fonte principal
> passou a ser **importacao de CSV da fatura**, que alem de ser a unica
> disponivel e mais completa: traz parcelas, IOF e valor final apos conversao,
> que o aviso de compra nunca teve. Captura de push foi descartada porque o
> iOS nao expoe notificacao entre apps.

**Status:** Fase 1 completa. Dominio, use cases, schema, integracao com o
Gmail, repositorios Supabase, ingestao por push (Pub/Sub) e uma UI minima de
listagem e correcao de categoria. Os parsers de Nubank e C6 existem mas ainda
**precisam ser validados contra e-mail real** — veja [SETUP.md](./SETUP.md).

## Por que e-mail e nao Open Finance

Agregador (Pluggy/Belvo) custa a partir de R$2.500/mes — inviavel para uso
pessoal. Os bancos ja mandam os dados de graca, no e-mail de "compra aprovada".

## Como funciona

```
Gmail  --push-->  Pub/Sub  -->  POST /api/gmail/webhook
                                      |
                    IngestFromGmailNotification
                     (pergunta ao Gmail o que mudou desde o ultimo historyId)
                                      |
                    para cada e-mail: roteia pelo remetente -> EmailSource
                                      |
                    IngestTransactionFromEmail
                     parser da instituicao -> categorizacao -> Supabase
```

O cron diario (`/api/sync`) e a rede de seguranca: pega o que o push tiver
perdido e renova o watch do Gmail, que o Google expira a cada 7 dias.

## Arquitetura

Clean Architecture. A regra unica que sustenta tudo: **a dependencia so aponta
para dentro**. `domain/` nao importa nada; `application/` importa `domain/`;
`infrastructure/` e `app/` importam os dois.

```
src/
  domain/                     nao importa NADA do projeto
    entities/                 Money, Account, Transaction, Category, EmailSource
    errors/                   DomainError

  application/                importa so domain/
    ports/                    as interfaces que o mundo de fora precisa cumprir
      EmailParser.ts          <- a peca-chave (ver abaixo)
      EmailGateway.ts / GmailPushGateway.ts
      repositories.ts
    use-cases/
      ImportStatementFile.ts           CSV de fatura -> transacoes (fonte principal)
      IngestTransactionFromEmail.ts    e-mail -> transacao persistida
      IngestFromGmailNotification.ts   caminho do push (historyId incremental)
      SyncTransactionsFromEmail.ts     caminho da busca (cron / backfill)
      CategorizeTransaction.ts         regras deterministicas + fallback
      RecategorizeTransaction.ts       correcao manual que vira regra nova
      ListTransactions.ts / RegisterAccount.ts

  infrastructure/             implementa os ports
    gateways/statement/       leitor de CSV, deteccao de colunas e parsers de extrato
    gateways/email/           GmailClient, OAuth, registry e um parser por banco
    repositories/             implementacoes Supabase + mapeamento linha<->entidade
    config/                   env validado e a composition root

app/                          Next.js: UI e endpoints
  page.tsx                    lista + correcao de categoria
  import/                     upload de CSV de fatura
  api/gmail/webhook/          push do Pub/Sub
  api/sync/                   cron, backfill e renovacao do watch

scripts/                      gmail:auth, gmail:watch, explore
supabase/migrations/          schema, seed de categorias, estado do sync
tests/unit/                   dominio, use cases e parsers - sem I/O
```

### O ponto que faz a coisa toda valer a pena

`IngestTransactionFromEmail` **nao sabe qual banco mandou o e-mail**. Ele pede
um parser ao registry usando `EmailSource.parserStrategy` e trabalha contra a
interface `EmailParser`. Consequencia pratica: adicionar um banco novo e
escrever um arquivo em `parsers/`, somar uma linha no
`InMemoryParserRegistry` da composition root, e cadastrar a fonte no banco.
Nenhum arquivo em `domain/` ou `use-cases/` muda.

## Decisoes ja tomadas (e o porque)

| Decisao | Motivo |
|---|---|
| Dinheiro em centavos (`bigint`) | Float acumula erro: `0.1 + 0.2 !== 0.3`. Divide so na hora de exibir. |
| Idempotencia via unique index em `(owner_id, raw_source_id)` | `SELECT` antes de `INSERT` nao segura cron e webhook concorrentes. O banco segura. |
| Checkpoint do sync so avanca no fim | Se o processo morrer no meio, a proxima notificacao reprocessa a janela — e reprocessar e no-op. |
| `historyId` em tabela propria, nao em `email_sources` | O historyId e da caixa inteira: uma notificacao cobre Nubank e C6 juntos. |
| Estorno e transacao nova negativa, nunca `DELETE` | O historico do que aconteceu precisa sobreviver; o total liquido continua certo. |
| Allowlist de remetente por fonte | Barra e-mail de phishing imitando o layout do banco. |
| Data lida no fuso de Sao Paulo | Interpretar como UTC joga compra depois das 21h para o dia seguinte e erra a virada do mes. |
| Entidades imutaveis (`categorizedAs()` devolve nova instancia) | Estado mudando no meio de um fluxo assincrono e fonte de bug dificil. |
| RLS ligada desde a migration 1 | Ligar depois obriga a reauditar cada query ja escrita. |
| Regra mais longa vence | `UBER EATS` (Alimentacao) precisa ganhar de `UBER` (Transporte). |
| Identidade de linha de CSV derivada do dado, com contador de ocorrencia | CSV nao tem `messageId`. Duas compras iguais no mesmo dia sao legitimas; sem o contador, uma delas sumiria. |
| Deteccao de colunas em vez de um parser por banco | Extrato e autodescritivo. Parser dedicado so quando o formato tem particularidade real. |
| `fetch` puro em vez de `googleapis` | O pacote pesa ~50MB e isso conta no cold start de serverless. |

## Rodando

```bash
npm install
npm test          # 30 testes, nenhum precisa de banco ou rede
npm run typecheck
npm run build
npm run dev       # precisa do .env preenchido (veja SETUP.md)
```

Configuracao completa — Supabase, OAuth, Pub/Sub, Vercel — em
**[SETUP.md](./SETUP.md)**.

## Proximos passos

- [ ] **Validar o importador com CSV real** de Nubank e C6, e trocar os
      fixtures sinteticos por reais anonimizados
- [ ] Reconciliacao: quando o extrato confirmar uma transacao provisoria,
      corrigir o valor final e marcar `conciliada`
- [ ] Autenticacao de verdade (hoje o owner vem de `DEFAULT_OWNER_ID`) —
      entra junto com o acesso do Arthur
- [ ] Filtros na listagem: por conta, categoria e periodo
- [ ] Terceiro parser, para confirmar que a arquitetura de gateway isolado
      realmente evita retrabalho
- [ ] Dashboard e orcamento (fora do MVP por decisao do briefing)
