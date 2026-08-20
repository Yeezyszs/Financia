# Setup

> **Rode tudo isto na sua maquina, nao num ambiente remoto.** O
> `npm run gmail:auth` abre um servidor em `localhost:3000` para receber o
> callback do Google, e o `npm run explore` le a sua caixa de e-mail.

```bash
git clone https://github.com/Yeezyszs/Financia.git
cd Financia
git checkout claude/personal-finance-app-bwn012
npm install
cp .env.example .env
```

Ordem importa: o Supabase precisa existir antes do deploy, e o deploy precisa
existir antes do Pub/Sub (que exige uma URL publica para o push).

---

## 1. Supabase

1. Criar projeto em [supabase.com](https://supabase.com).
2. Rodar as migrations em ordem, no SQL Editor:
   `0001_init` → `0002_seed_categories` → `0003_gmail_sync_state` →
   `0004_statement_origin` → `0005_restrict_seed_function`.
3. Criar o usuario em **Authentication > Users > Add user**. Use um e-mail e
   senha reais — o UUID gerado ai e o `DEFAULT_OWNER_ID`.

   > Nao insira direto em `auth.users` por SQL. A tabela tem colunas e
   > invariantes que o GoTrue espera; um registro montado a mao costuma
   > funcionar ate a primeira tentativa de login.

4. Semear as categorias padrao (SQL Editor roda como service role, entao a
   funcao restrita da migration 0005 e acessivel ai):
   ```sql
   select seed_default_categories('<seu-uuid>');
   ```
5. Cadastrar as contas:
   ```sql
   insert into accounts (owner_id, name, institution, type, last4) values
     ('<seu-uuid>', 'Nubank', 'Nubank', 'cartao_credito', '1234'),
     ('<seu-uuid>', 'C6',     'C6 Bank', 'cartao_credito', '5678');
   ```
6. Depois de qualquer DDL, rodar o linter em **Advisors > Security**. Ele pega
   coisas que passam despercebidas — foi assim que a exposicao da
   `seed_default_categories` via RPC apareceu.

### As duas chaves

**Settings > API** traz duas, e a diferenca importa:

| Chave | O que faz | Onde usar |
|---|---|---|
| `anon` | respeita RLS | front, browser. Publica por design. |
| `service_role` | **ignora RLS** | so backend. E o `SUPABASE_SERVICE_ROLE_KEY`. |

O job de importacao roda sem usuario logado, por isso precisa da
`service_role`: com a `anon`, toda query voltaria vazia. Em compensacao ela
tem acesso total ao banco — nunca no front, nunca commitada, nunca colada em
chat.

`SUPABASE_URL` e a "Project URL" na mesma tela. A `anon` vai no
`NEXT_PUBLIC_SUPABASE_ANON_KEY` — o prefixo `NEXT_PUBLIC_` e proposital: ela
precisa chegar ao browser.

### Login

O app exige sessao. Use o e-mail e a senha do usuario criado no passo 3 para
entrar em `/login`.

Enquanto voce navega, o app fala com o banco pela **chave anon mais o cookie
da sessao**, entao toda query passa pelas policies de RLS. A `service_role`
fica so em `/api/sync` e `/api/gmail/webhook`, que rodam sem usuario e se
autenticam por segredo proprio (`CRON_SECRET`, `PUBSUB_VERIFICATION_TOKEN`) —
por isso o `DEFAULT_OWNER_ID` continua existindo: e o dono das transacoes que
esses jobs ingerem.

## 2. Google Cloud + OAuth

1. Criar projeto no [Google Cloud Console](https://console.cloud.google.com).
2. **APIs & Services > Library**: habilitar a **Gmail API**.
3. **OAuth consent screen**: tipo *External* (ou *Internal*, se a conta for
   Workspace). Nome do app, e-mail de contato, e seu proprio e-mail em
   *Test users*.
4. **Credentials > Create credentials > OAuth client ID**. Os dois tipos
   funcionam, escolha um:

   | Tipo | Redirect URI a cadastrar | Quando preferir |
   |---|---|---|
   | **App para computador** (Desktop) | nenhuma — o Google ja aceita `http://localhost` | Mais simples. O JSON baixado ja traz tudo. |
   | **Aplicativo da Web** | `http://localhost:3000/oauth/callback` | Se voce quiser controlar o URI exato. |

5. Entregue a credencial ao script de um destes dois jeitos:

   **a) Arquivo** — baixe o JSON no Cloud Console e salve como
   `credentials.json` na raiz do projeto. O script le tanto o formato
   `installed` (desktop) quanto `web`. Ja esta no `.gitignore`.

   **b) `.env`** — copie `client_id` e `client_secret` para
   `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.

   Se os dois existirem, `credentials.json` ganha. O caminho (b) e o que roda
   em producao, onde nao ha disco para guardar arquivo.

6. Autorizar:
   ```bash
   npm run gmail:auth      # ou: npm run authorize
   ```
   Ele imprime uma URL, voce autoriza no navegador, e o refresh token e
   **gravado direto no `.env`** — sem copy-paste, que num token de 100+
   caracteres e um jeito facil de truncar e depois caçar um erro obscuro.

### Publique o app antes de esquecer disso

Em **OAuth consent screen**, clique em **Publish app** (status *In production*).

Em modo *Testing* o Google **expira o refresh token em 7 dias**. Nao e a regra
geral de 6 meses de inatividade que vale para apps publicados — sao 7 dias
corridos, use voce ou nao. A ingestao simplesmente para, sem erro visivel ate
voce ir olhar.

Publicar sem passar pela verificacao do Google funciona normalmente para a
propria conta — so aparece uma tela de aviso ("Google hasn't verified this
app") no consentimento. A verificacao formal so seria necessaria para
distribuir a terceiros.

### Se der erro

| Erro | Causa |
|---|---|
| `redirect_uri_mismatch` | O URI que o script imprime nao esta cadastrado no client OAuth. Copie o que ele mostra e cadastre, ou use client tipo Desktop. |
| `invalid_client` | `client_id`/`client_secret` errados, ou aspas sobrando no `.env`. |
| "Google nao devolveu refresh_token" | A conta ja autorizou este app antes. Revogue em [myaccount.google.com/permissions](https://myaccount.google.com/permissions) e rode de novo. |
| `Porta 3000 ocupada` | O `npm run dev` esta rodando. Feche e tente de novo. |

---

## 3. Explorar antes de confiar nos parsers

Os regex de `NubankEmailParser` e `C6EmailParser` foram escritos a partir do
formato conhecido e **ainda nao foram validados contra e-mail real**.

```bash
npm run explore                          # quais remetentes de banco existem na caixa
npm run explore -- --dump nubank         # dumpa os corpos em .explore/
```

Com o dump em maos: ajuste os regex, anonimize um exemplar de cada formato e
salve em `tests/fixtures/` substituindo os fixtures sinteticos de
`tests/unit/parsers.test.ts`.

> O Nubank notifica compra por **push**, nao por e-mail, salvo se a notificacao
> por e-mail estiver ligada no app (Perfil > Notificacoes). Se o `explore` nao
> achar nada dele, e isso. A alternativa e importar o CSV da fatura, o que fica
> para uma fase posterior.

`.explore/` esta no `.gitignore` porque contem dados financeiros reais.

---

## Quando o banco nao manda e-mail de compra

Resultado do `explore` na caixa do Pedro (ago/2026): **nem Nubank nem C6
enviam e-mail por transacao**. O Nubank manda fatura fechada, extrato, Pix e
marketing; o C6 manda so promocional. Compra e notificada por push no app.

Isso nao invalida a arquitetura - o `EmailGateway` e so um dos gateways
possiveis, e o dominio nao sabe de onde a transacao veio. Mas exige escolher
outra fonte. Em ordem de recomendacao:

### a) Import de CSV/OFX da fatura (recomendado)

Nubank e C6 exportam a fatura em CSV/OFX pelo app e pelo site.

Vantagens sobre o e-mail, que valem alem do desempate:
- **dado completo**: parcelas, IOF, valor final apos conversao de moeda - o
  e-mail de compra nunca traz nada disso
- **autoritativo**: e o que o banco cobra, nao um aviso que pode ser estornado
  depois sem novo e-mail
- **sem risco de parser quebrar** quando o banco mexe no template de e-mail

Custo: nao e tempo real. Voce baixa o arquivo quando a fatura fecha, ou uma
vez por semana se quiser acompanhar de perto.

Encaixe no codigo: um `StatementFileGateway` no lugar do `EmailGateway`, e um
`CsvStatementParser` por instituicao no lugar do `EmailParser`. Os use cases,
as entidades e a idempotencia por `raw_source_id` (que vira o id da linha do
extrato) ficam exatamente como estao.

### b) Ligar notificacao por e-mail no app do banco

Vale checar antes de descartar - alguns bancos tem a opcao escondida em
Perfil > Notificacoes. Se existir, o caminho de e-mail volta a valer e os
parsers ja escritos passam a servir. Rode o `explore` de novo alguns dias
depois de ligar.

### c) Agregador de Open Finance

Pluggy/Belvo resolvem de vez, com dado em tempo real e completo. Descartado no
briefing por preco (a partir de R$2.500/mes), o que continua valendo para uso
pessoal.

---

## 4. Deploy na Vercel

1. Importar o repo do GitHub na Vercel. A partir dai, `git push` deploya.
2. Copiar todas as variaveis do `.env.example` para **Settings > Environment
   Variables**.
3. `CRON_SECRET` e `PUBSUB_VERIFICATION_TOKEN` sao segredos que voce inventa:
   ```bash
   openssl rand -hex 32
   ```

O cron diario de `vercel.json` chama `/api/sync`, que faz duas coisas: pega o
que o push tiver perdido e **renova o watch do Gmail** (que morre a cada 7 dias).

---

## 5. Pub/Sub

Precisa da URL da Vercel, por isso vem por ultimo.

1. **Pub/Sub > Topics > Create topic**, ex: `gmail-financia`.
2. No topico, **Add principal**: `gmail-api-push@system.gserviceaccount.com`
   com o papel **Pub/Sub Publisher**. Sem isso o Gmail nao consegue publicar.
3. **Create subscription**, tipo *Push*, endpoint:
   ```
   https://<seu-app>.vercel.app/api/gmail/webhook?token=<PUBSUB_VERIFICATION_TOKEN>
   ```
4. `GOOGLE_PUBSUB_TOPIC=projects/<projeto>/topics/gmail-financia` no `.env`.
5. Registrar o watch:
   ```bash
   npm run gmail:watch
   ```

---

## 6. Primeira carga

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://<seu-app>.vercel.app/api/sync?days=90"
```

Traz os ultimos 90 dias. Reexecutar e seguro: a idempotencia por
`raw_source_id` faz o reprocessamento ser no-op.

---

## Quando algo nao funciona

| Sintoma | Causa provavel |
|---|---|
| `invalid_grant` ao renovar token | Refresh token expirou (app em modo *Testing*) ou acesso revogado. Rode `npm run gmail:auth` de novo — e publique o app. |
| Push parou de chegar sem erro | Watch expirou (7 dias). Confira se o cron da Vercel esta rodando; `npm run gmail:watch` recupera na hora. |
| Webhook responde 401 | `token` da query da subscription diferente do `PUBSUB_VERIFICATION_TOKEN`. |
| Sync roda mas nao ingere nada | `from_addresses` da fonte nao casa com o remetente real. Confira com `npm run explore`. |
| `CATEGORY_FALLBACK_MISSING` | Faltou rodar `select seed_default_categories('<uuid>')`. |
| Transacao no dia errado | Data do e-mail lida fora do fuso. Veja `findDateTime` em `parsers/patterns.ts`. |
