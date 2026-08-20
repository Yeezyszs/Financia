# Financia

Controle financeiro pessoal que ingere transacoes automaticamente a partir dos
e-mails de notificacao de compra do banco. Sem lancamento manual.

**Status:** Fase 1 (fundacao) — dominio, use cases e schema prontos e testados.
Ainda nao ha integracao real com o Gmail nem parser de banco.

## Por que e-mail e nao Open Finance

Agregador (Pluggy/Belvo) custa a partir de R$2.500/mes — inviavel para uso
pessoal. Os bancos ja mandam os dados de graca, no e-mail de "compra aprovada".

## Arquitetura

Clean Architecture. A regra unica que sustenta tudo: **a dependencia so aponta
para dentro**. `domain/` nao importa nada; `application/` importa `domain/`;
`infrastructure/` e `presentation/` importam os dois.

```
src/
  domain/                     nao importa NADA do projeto
    entities/                 Money, Account, Transaction, Category, EmailSource
    errors/                   DomainError

  application/                importa so domain/
    ports/                    as interfaces que o mundo de fora precisa cumprir
      EmailParser.ts          <- a peca-chave (ver abaixo)
      EmailGateway.ts
      repositories.ts
    use-cases/
      IngestTransactionFromEmail.ts    e-mail -> transacao persistida
      SyncTransactionsFromEmail.ts     varre as fontes e chama a ingestao
      CategorizeTransaction.ts         regras deterministicas + fallback
      RecategorizeTransaction.ts       correcao manual que vira regra nova
      ListTransactions.ts
      RegisterAccount.ts

  infrastructure/             implementa os ports
    gateways/email/           GmailClient + um parser por instituicao
    repositories/             implementacoes Supabase
    config/

  presentation/               entrypoints
    http/                     endpoints de consulta e webhook do Pub/Sub
    jobs/                     sync agendado

supabase/migrations/          schema + seed de categorias
tests/                        unit (dominio e use cases, sem I/O)
```

### O ponto que faz a coisa toda valer a pena

`IngestTransactionFromEmail` **nao sabe qual banco mandou o e-mail**. Ele pede
um parser ao registry usando `EmailSource.parserStrategy` e trabalha contra a
interface `EmailParser`. Consequencia pratica: adicionar um banco novo e
escrever um arquivo em `parsers/` e cadastrar uma linha em `email_sources`.
Nenhum arquivo em `domain/` ou `use-cases/` muda.

## Decisoes ja tomadas (e o porque)

| Decisao | Motivo |
|---|---|
| Dinheiro em centavos (`bigint`) | Float acumula erro: `0.1 + 0.2 !== 0.3`. Divide so na hora de exibir. |
| Idempotencia via unique index em `(owner_id, raw_source_id)` | `SELECT` antes de `INSERT` nao segura dois jobs concorrentes (cron + webhook). O banco segura. |
| Estorno e transacao nova negativa, nunca `DELETE` | O historico do que aconteceu precisa sobreviver; o total liquido continua certo. |
| Allowlist de remetente por fonte | Barra e-mail de phishing imitando o layout do banco. |
| Entidades imutaveis (`categorizedAs()` devolve nova instancia) | Estado mudando no meio de um fluxo assincrono e fonte de bug dificil. |
| RLS ligada desde a migration 1 | Ligar depois obriga a reauditar cada query ja escrita. |
| Regra mais longa vence | `UBER EATS` (Alimentacao) precisa ganhar de `UBER` (Transporte). |

## Rodando

```bash
npm install
npm test          # 20 testes, nenhum precisa de banco ou rede
npm run typecheck
```

Ainda nao ha o que subir: sem Gmail configurado e sem parser, nao existe fluxo
end-to-end. Isso e a Fase 2.

## Proximos passos

- [ ] **Fase 1 (resto)** — projeto no Google Cloud, OAuth2 com escopo
      `gmail.readonly`, `GmailClient` implementando `EmailGateway`
- [ ] **Modo exploracao** — script que dumpa os e-mails de banco reais da caixa,
      para escrever o primeiro parser com dado na mao em vez de adivinhar
- [ ] **Fase 2** — primeiro parser + ingestao end-to-end + repositorios Supabase
- [ ] **Fase 3** — segundo parser (o teste real de que a arquitetura paga)
- [ ] **Fase 4** — fluxo de correcao manual na UI
- [ ] **Fase 5** — listagem, filtros e o front em React

## Pendencias abertas

- Qual banco digital exatamente (Inter, C6 ou BTG) entra junto com o Nubank
- Onde roda o webhook do Pub/Sub — Vercel ou Supabase Edge Function
- Nubank manda e-mail de compra? Por padrao ele notifica por push. A definir
  no modo exploracao.

## Alerta de configuracao: o refresh token de 7 dias

App OAuth em modo **Testing** no Google Cloud tem refresh token que expira em
7 dias. Publicar como "In production" resolve — funciona para a propria conta
mesmo sem passar pela verificacao do Google, so mostra uma tela de aviso.
Deixar em Testing significa reautenticar toda semana.
