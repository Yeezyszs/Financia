# Setup

Ordem importa: o Supabase precisa existir antes do deploy, e o deploy precisa
existir antes do Pub/Sub (que exige uma URL publica para o push).

---

## 1. Supabase

1. Criar projeto em [supabase.com](https://supabase.com).
2. Rodar as migrations em ordem, no SQL Editor:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_seed_categories.sql`
   - `supabase/migrations/0003_gmail_sync_state.sql`
3. Criar seu usuario em **Authentication > Users > Add user**. Anote o UUID:
   e o `DEFAULT_OWNER_ID`.
4. Semear as categorias padrao:
   ```sql
   select seed_default_categories('<seu-uuid>');
   ```
5. Cadastrar as contas e as fontes de e-mail:
   ```sql
   insert into accounts (owner_id, name, institution, type, last4) values
     ('<seu-uuid>', 'Nubank', 'Nubank', 'cartao_credito', '1234'),
     ('<seu-uuid>', 'C6',     'C6 Bank', 'cartao_credito', '5678');

   insert into email_sources (owner_id, account_id, institution, parser_strategy, from_addresses)
   select '<seu-uuid>', id, institution,
          case institution when 'Nubank' then 'nubank' else 'c6' end,
          case institution when 'Nubank' then array['nubank.com.br']
                                         else array['c6bank.com.br'] end
   from accounts where owner_id = '<seu-uuid>';
   ```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` saem de **Settings > API**.

> A service role key ignora RLS. Ela existe porque o job de ingestao roda sem
> usuario logado. Backend apenas — nunca no front.

---

## 2. Google Cloud + OAuth

1. Criar projeto no [Google Cloud Console](https://console.cloud.google.com).
2. **APIs & Services > Library**: habilitar a **Gmail API**.
3. **OAuth consent screen**: tipo *External*, seu e-mail como usuario de teste.
4. **Credentials > Create credentials > OAuth client ID**, tipo *Web
   application*, com `http://localhost:3000/oauth/callback` nos redirect URIs.
5. Preencher `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env`, e rodar:
   ```bash
   npm run gmail:auth
   ```
   Autorize no navegador e cole o `GOOGLE_REFRESH_TOKEN` que o script imprime.

### Publique o app antes de esquecer disso

Em **OAuth consent screen**, clique em **Publish app** (status *In production*).

Em modo *Testing* o Google **expira o refresh token em 7 dias** e a ingestao
para de funcionar sozinha, sem erro visivel ate voce ir olhar. Publicar sem
passar pela verificacao do Google funciona normalmente para a propria conta —
so aparece uma tela de aviso na hora do consentimento.

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
