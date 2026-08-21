# Financia

Controle financeiro pessoal alimentado por **importação de CSV** dos apps do banco — não por lançamento manual transação a transação.

> Status: **MVP completo** — schema no ar, ingestão de CSV do Nubank (extrato e fatura, com dedupe e categorização automática) e as três telas: Visão Geral, Transações e Histórico.

## Stack

- **Backend:** Node.js 20+ · TypeScript · Express · Clean Architecture
- **Banco:** Supabase (Postgres) com RLS por `user_id`
- **Frontend:** React + TypeScript (ainda não iniciado)

## Estrutura

```
supabase/migrations/     # schema versionado (SQL)
api/index.ts             # function da Vercel: serve a app Express em /api/*
frontend/                # React + Vite (SPA)
  src/
    api/                 #   client HTTP + tipos da API
    components/          #   graficos em SVG e tooltip
    screens/             #   Visao Geral, Transacoes, Historico
backend/
  src/
    domain/              # 1. Entidades e regras de negócio puras
      entities/          #    User, Account, Category, CategoryRule, Transaction, Import
      value-objects/     #    Money (centavos), fingerprint de dedupe
      errors/
    application/         # 2. Casos de uso e contratos (ports)
      use-cases/
      ports/
        repositories/    #    contratos de persistência
        parsers/         #    StatementParser — porta de ingestão por banco
        services/        #    IdGenerator, Clock, Hasher
    interface-adapters/  # 3. Controllers, presenters, rotas
    infrastructure/      # 4. Supabase, Express, config, serviços concretos
      parsers/           #    adapters de ingestão: Nubank extrato e fatura
    main/                #    composition root (container.ts) + server
  tests/unit/
```

A regra de dependência aponta sempre para dentro: `infrastructure → interface-adapters → application → domain`. O domínio não importa nada de fora.

## Decisões de modelagem que valem explicar

**Dinheiro em centavos.** `amount_cents bigint` com sinal (negativo = saída). Float em fechamento de mês perde centavo.

**Dedupe sem ID nativo.** O CSV do Nubank não traz ID de transação, então a identidade de uma linha é o `fingerprint` = sha256 de `conta + data + título normalizado + valor + ordinal`. O `ordinal` é a posição da repetição dentro do arquivo, o que preserva duas compras legitimamente idênticas no mesmo dia e ainda assim faz a reimportação do mesmo extrato colidir. `unique (user_id, fingerprint)` é a garantia final, no banco.

**Fatura x conta corrente.** As duas fontes são contas separadas, então o pagamento da fatura aparece dos dois lados. A flag `is_transfer` tira essas linhas de receita e despesa, e `counterpart_transaction_id` linka as duas pontas. Toda agregação de relatório filtra `not is_transfer`.

**Multiusuário desde já.** Todas as tabelas carregam `user_id` e têm RLS ligada (`auth.uid() = user_id`). Hoje o backend roda single-user: o `user_id` vem do `.env` via o middleware `currentUser`. Quando entrar login de verdade, só esse middleware muda.

**C6 adiado, porta pronta.** `StatementParser` é a porta de ingestão. Nubank conta corrente e fatura serão dois adapters; C6 entra como um terceiro sem tocar em caso de uso.

## Banco

Migrations em `supabase/migrations/`, aplicadas em ordem:

| arquivo | conteúdo |
|---|---|
| `0001_init.sql` | users, accounts, categories, category_rules, imports, transactions, RLS |
| `0002_goals_installments.sql` | metas e parcelas (stub das telas do protótipo) |
| `0003_seed_defaults.sql` | `seed_user_defaults(user_id)` — categorias e regras iniciais, idempotente |
| `0004_report_functions.sql` | agregações do dashboard (por categoria, mensal) |
| `0005_hardening.sql` | search_path fixo, pg_trgm fora do public, funções fora do alcance da anon key |
| `0006_increment_rule_hits.sql` | contador de uso das regras de categorização |

O projeto **Financia** (`mmijyibobnigjtirzzja`, região us-west-2) já está com as migrations aplicadas, RLS ligada nas 9 tabelas, o usuário single-user criado e semeado (15 categorias, 25 regras) e as duas contas do MVP prontas: `Nubank Conta Corrente` e `Nubank Cartão de Crédito` (essa última já apontando para a conta corrente que quita a fatura).

Para um ambiente novo, aplicar as migrations em ordem (`supabase db push` ou SQL Editor) e depois:

```sql
insert into users (id, email, name) values ('<auth-user-id>', '<email>', 'Pedro');
select seed_user_defaults('<auth-user-id>');
```

## Rodando o backend

```bash
cp backend/.env.example backend/.env   # SUPABASE_URL, SERVICE_ROLE_KEY, API_TOKEN, DEFAULT_USER_ID
npm install                            # workspaces: instala backend e frontend

npm run dev:api    # API em http://localhost:3333
npm run dev        # UI em http://localhost:5173 (proxy /api -> 3333)

npm test           # testes do backend
npm run typecheck  # backend + frontend
```

O `.env` nunca vai para o git (`backend/.gitignore`). A `service_role` key ignora RLS por completo — ela só existe no backend, nunca no frontend, que usará a anon key.

## API

Toda rota (menos `/api/health`) exige o header `x-api-key` com o `API_TOKEN`.

| rota | o que faz |
|---|---|
| `GET /api/health` | ping, sem token — é o que o monitoramento consulta |
| `GET /api/accounts` · `POST /api/accounts` | contas |
| `GET /api/transactions` | listagem com filtros de conta, categoria, período e busca |
| `POST /api/imports` | importa um CSV |
| `GET /api/imports` | histórico de importações |

Importar um extrato:

```bash
curl -X POST "$API_URL/api/imports" \
  -H "x-api-key: $API_TOKEN" -H 'Content-Type: application/json' \
  -d "$(jq -n --arg c "$(cat nubank-agosto.csv)" \
        '{accountId:"<uuid-da-conta>", filename:"nubank-agosto.csv", content:$c}')"
```

Resposta: `{ rowsTotal, rowsImported, rowsDuplicated, categorized, periodStart, periodEnd }`.

## Ingestão de CSV (Fase 2)

O caminho de um arquivo: **parser do banco → fingerprint por linha → descarte do que já existe → categorização por regras → insert → log no histórico**.

**Duas barreiras contra duplicata, de propósito.** O hash do arquivo inteiro pega o "importei esse extrato de novo" e responde com erro claro (`force: true` passa por cima). O fingerprint por linha pega o caso real de quem importa toda semana: dois arquivos com períodos sobrepostos entram e só as linhas novas viram transação.

**Sinal do valor.** No extrato da conta corrente o valor já vem com sinal (entrada positiva, saída negativa). Na fatura do cartão, não: a compra vem positiva porque é o valor *cobrado*. O parser da fatura inverte o sinal na entrada, e é a única diferença real entre os dois adapters. Isso está baseado no layout conhecido do export — **confirmar com uma fatura real antes de fechar o primeiro mês**; se o seu export já vier com compra negativa, é a constante `INVERT_SIGN` em `NubankCreditCardParser`.

**Colunas por nome, não por posição.** Os dois layouts conhecidos (`date,title,amount` e `Data,Valor,Identificador,Descrição`) caem no mesmo parser, e datas ISO ou `dd/mm/aaaa` são aceitas. Formato de data que não seja um desses dois é recusado com erro — data ambígua virando transação errada é pior que import falhado.

**Categorização.** As regras do usuário são aplicadas por prioridade, a primeira que casar vence, e o match ignora acento, caixa e pontuação. Quando a categoria que casa é do tipo `transfer` (ex: pagamento de fatura), a transação nasce marcada como transferência e já fica fora de receitas e despesas — que é a regra de não-duplicidade fatura x conta corrente.

**Falha vira histórico.** CSV irreconhecível não some: o import fica registrado com status `failed` e a mensagem do erro, para a tela de Histórico mostrar o que aconteceu.

## Deploy (Vercel)

GitHub Pages não serve para o backend — é hospedagem estática, não roda Node nem guarda secret, e a `service_role` key não pode viver num bundle de frontend. Na Vercel os dois convivem: o React como estático e o Express como serverless function.

1. Importar o repositório na Vercel deixando o **Root Directory na raiz** do repo
2. Cadastrar as variáveis de ambiente (Settings → Environment Variables):

| variável | valor |
|---|---|
| `SUPABASE_URL` | `https://mmijyibobnigjtirzzja.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | a service_role key (nunca no frontend) |
| `API_TOKEN` | `openssl rand -hex 32` |
| `DEFAULT_USER_ID` | id do usuário no `auth.users` |
| `NODE_ENV` | `production` |

`vercel.json` faz o build do frontend (`frontend/dist`) e reescreve `/api/(.*)` para a function em `api/index.ts`, que é a mesma app Express do dev. Frontend e API saem do **mesmo domínio**: sem CORS e sem token atravessando origem.

**Sobre o `API_TOKEN`:** o backend fala com o Supabase usando a `service_role`, que ignora RLS. Uma URL pública sem trava seria acesso total às finanças para quem descobrisse o endereço. O token é o substituto temporário até entrar login de verdade (Supabase Auth), quando só o middleware `currentUser` muda.

O token **não** vai embutido no bundle do frontend — isso o tornaria público, já que qualquer um baixa o JS. Ele é digitado na tela de entrada e fica no `localStorage` do navegador.

## Frontend

Três telas, sem dependência de UI além do React — os gráficos são SVG escrito à mão:

- **Visão Geral** — receitas, despesas e saldo do mês; evolução mensal do ano (barras agrupadas, com tooltip por mês) e despesas por categoria (barras ordenadas)
- **Transações** — tabela com filtros de conta, categoria, período e busca (com debounce), paginada
- **Histórico** — upload do CSV por drag-and-drop, resultado da importação e o log de tudo que já entrou, inclusive o que falhou

**Cores dos gráficos.** Azul para receitas, laranja para despesas, nos dois modos (claro e escuro). O par foi validado para daltonismo: ΔE ≥ 24 sob protanopia e deuteranopia e ≥ 3:1 de contraste contra a superfície — separação bem acima do piso, então a leitura não depende de distinguir as duas cores. As barras de categoria usam uma cor só: ali quem carrega a identidade é o rótulo, e oito hues indistinguíveis não informariam nada a mais.

## O que vem depois do MVP

- **Editar a categoria de uma transação pela UI** + "lembrar essa categoria" (cria uma regra `learned`) — hoje a categorização é só automática, corrigir exige mexer no banco
- **Reconciliação explícita fatura x conta** — linkar as duas pontas do pagamento (`counterpart_transaction_id`); hoje as duas já ficam fora dos totais, falta o link
- **Login de verdade** (Supabase Auth) no lugar do `API_TOKEN`
- **Metas e Parcelas** — tabelas prontas, sem UI
- **Adapter do C6** — a porta existe, falta um export real
- **Lançamento manual** para gasto em dinheiro que não passa por CSV nenhum
