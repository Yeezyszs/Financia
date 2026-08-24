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
| `0007_totals_split_sign.sql` | entrada e saída separadas por categoria |
| `0008_grants_for_authenticated.sql` | funções executáveis pelo usuário logado |
| `0009_provision_new_user.sql` | trigger que provisiona perfil e categorias de usuário novo |
| `0010_seed_own_defaults.sql` | seed sob demanda para o próprio usuário |
| `0011_category_monthly_series.sql` | série mensal por categoria |
| `0012_novo_conjunto_de_categorias.sql` | conjunto enxuto, com remapeamento dos dados existentes |
| `0013_seed_novo_conjunto.sql` | seed alinhado ao conjunto novo |

O projeto **Financia** (`mmijyibobnigjtirzzja`, região us-west-2) já está com as migrations aplicadas, RLS ligada nas 9 tabelas, o usuário single-user criado e semeado (15 categorias, 25 regras) e as duas contas do MVP prontas: `Nubank Conta Corrente` e `Nubank Cartão de Crédito` (essa última já apontando para a conta corrente que quita a fatura).

Para um ambiente novo, aplicar as migrations em ordem (`supabase db push` ou SQL Editor) e depois:

```sql
insert into users (id, email, name) values ('<auth-user-id>', '<email>', 'Pedro');
select seed_user_defaults('<auth-user-id>');
```

## Rodando o backend

```bash
cp backend/.env.example backend/.env     # SUPABASE_URL, SUPABASE_ANON_KEY
cp frontend/.env.example frontend/.env   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm install                            # workspaces: instala backend e frontend

npm run dev:api    # API em http://localhost:3333
npm run dev        # UI em http://localhost:5173 (proxy /api -> 3333)

npm test           # testes do backend
npm run typecheck  # backend + frontend
```

O `.env` nunca vai para o git. Nenhuma das variáveis é secreta: a anon key é pública por design e quem protege os dados é o RLS — ver **Autenticação**.

## API

Toda rota (menos `/api/health`) exige o header `Authorization: Bearer <jwt>` da sessão do Supabase.

| rota | o que faz |
|---|---|
| `GET /api/health` | ping, sem token — é o que o monitoramento consulta |
| `GET /api/accounts` · `POST /api/accounts` | contas |
| `GET /api/transactions` | listagem com filtros de conta, categoria, período e busca |
| `PATCH /api/transactions/:id/category` | define a categoria e, opcionalmente, memoriza a escolha |
| `POST /api/imports` | importa um CSV |
| `GET /api/imports` | histórico de importações |

Importar um extrato:

```bash
curl -X POST "$API_URL/api/imports" \
  -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
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

GitHub Pages não serve para o backend — é hospedagem estática e não roda Node, e o parser de CSV, o dedupe e a conversa com o banco precisam de servidor. Na Vercel os dois convivem: o React como estático e o Express como serverless function.

1. Importar o repositório na Vercel deixando o **Root Directory vazio (a raiz do repo)**.
   Apontar para `frontend/` não funciona: o `vercel.json` e a pasta `api/` ficam
   fora do escopo do build, e o deploy sai sem backend nenhum — a SPA carrega e
   toma 404 em toda chamada de `/api`.
2. Cadastrar as variáveis de ambiente (Settings → Environment Variables):

| variável | valor | para quê |
|---|---|---|
| `SUPABASE_URL` | `https://mmijyibobnigjtirzzja.supabase.co` | backend |
| `SUPABASE_ANON_KEY` | a anon key | backend |
| `VITE_SUPABASE_URL` | mesma URL | build do frontend |
| `VITE_SUPABASE_ANON_KEY` | mesma anon key | build do frontend |

Nenhuma delas é secreta. As duas com prefixo `VITE_` são lidas no build e entram no
bundle — é assim que tem que ser: a anon key é feita para ser pública.

As dependências de runtime (`express`, `zod`, `@supabase/supabase-js`) são declaradas
no `package.json` da **raiz**, não só no do backend: a function mora na raiz e precisa
resolvê-las a partir dali. Declaradas apenas no workspace, o npm as instala aninhadas
em `backend/node_modules/` e a function não as encontra.

`vercel.json` faz o build do frontend (`frontend/dist`) e reescreve `/api/(.*)` para a function em `api/index.ts`, que é a mesma app Express do dev. Frontend e API saem do **mesmo domínio**: sem CORS e sem token atravessando origem.

## Autenticação

Login por e-mail e senha, com **Supabase Auth**. O desenho importa mais que a tela:

O frontend faz login com a **anon key** (pública por design — ela vai no bundle e não é
segredo) e recebe um JWT. Cada chamada à API leva esse JWT no `Authorization`. O backend
lê o `sub` para saber de quem é a request e **repassa o mesmo JWT ao PostgREST**, que
verifica a assinatura e expõe o `sub` como `auth.uid()` dentro do Postgres.

Consequência: **quem isola os dados é o RLS**, não um `where user_id = ...` que alguém
possa esquecer de escrever. Um JWT forjado passa pelo middleware e morre no banco — não lê
nem grava nada. Verificado com a sessão simulada no Postgres: gravar em nome de outro
usuário levanta `insufficient_privilege`.

A `service_role` key **saiu do projeto**. Ela ignora RLS por completo, e a única razão de
existir aqui era suprir a falta de autenticação. Hoje nenhuma variável de ambiente do
Financia é secreta.

### Criar ou trocar a senha

O usuário foi criado direto no `auth.users`, sem senha. Para definir uma, no SQL Editor do
Supabase (a senha não passa por lugar nenhum além do seu navegador e do banco):

```sql
update auth.users
   set encrypted_password = crypt('SUA_SENHA_AQUI', gen_salt('bf')),
       updated_at = now()
 where email = 'pedromaraia454@gmail.com';
```

Depois disso o login na tela funciona. A opção "Esqueci minha senha" usa o e-mail do
Supabase, que no plano free é limitado a poucos envios por hora — para trocar a senha, o
SQL acima é mais direto.

## Frontend

Três telas, sem dependência de UI além do React — os gráficos são SVG escrito à mão:

- **Visão Geral** — receitas, despesas e saldo do mês; evolução mensal do ano (barras agrupadas, com tooltip por mês) e despesas por categoria (barras ordenadas)
- **Transações** — tabela com filtros de conta, categoria, período e busca (com debounce), paginada
- **Histórico** — upload do CSV por drag-and-drop, resultado da importação e o log de tudo que já entrou, inclusive o que falhou

**Cores dos gráficos.** Azul para receitas, laranja para despesas, nos dois modos (claro e escuro). O par foi validado para daltonismo: ΔE ≥ 24 sob protanopia e deuteranopia e ≥ 3:1 de contraste contra a superfície — separação bem acima do piso, então a leitura não depende de distinguir as duas cores. As barras de categoria usam uma cor só: ali quem carrega a identidade é o rótulo, e oito hues indistinguíveis não informariam nada a mais.

## Análise e exportação

O backend calcula um retrato dos últimos meses — `GET /api/reports/snapshot` — e o
formata como texto em `GET /api/reports/summary.md`. Nenhuma IA participa disso: tudo
é cálculo determinístico, testado. Se um número sair errado, o erro está em código.

**Detecção de recorrência.** O agrupamento é por estabelecimento, não por descrição
literal: "Ifood \*Sabor" e "Ifood \*Outro" são o mesmo lugar, e "Compra no débito -
ASSAI" é o mesmo que "ASSAI". Duas limpezas puxam para lados opostos — o prefixo do
banco vem antes do traço, o detalhe da compra vem depois do asterisco — então a ordem
delas importa e está fixada no código.

Um grupo vira **assinatura** quando tem valor estável *e* cadência de ~1 vez por mês.
Só o valor não basta: quatro compras mensais num atacadista têm valores parecidos e
não são assinatura — contá-las como gasto fixo inflaria o número usado para planejar
o mês. O resto é **recorrente variável**: dá para reduzir, não para zerar.

**Por que exportar em vez de integrar a API.** A alternativa era chamar a API da
Anthropic de dentro do app. Custaria crédito por análise, exigiria uma chave secreta
em produção e devolveria um texto único — sem chance de perguntar "por quê". Colar o
resumo numa conversa preserva a ida e volta, que é onde conselho financeiro fica bom,
e não custa nada. O resumo já sai com o próprio enquadramento (o que são os números,
o que já foi excluído deles), para o contexto não precisar ser reescrito toda vez.

Se um dia fizer sentido integrar — análise automática mensal, ou multiusuário — o
payload já existe: é o mesmo snapshot.

## Categorias

Sete de despesa — Alimentação, Lazer, Parcelas, Abastecimento, Educação, Investimentos,
Outros gastos — cinco de receita — Salário, Renda extra, Rendimentos, Reembolsos,
Outras receitas — e Transferências, que é o que mantém o pagamento da fatura fora dos
totais.

A migração que enxugou o conjunto remapeia transações e regras **antes** de excluir
qualquer categoria: o `on delete` levaria junto as categorizações já feitas e as regras
aprendidas pelo uso.

Duas consequências dessa escolha, deliberadas: moradia e transporte por app caem em
"Outros gastos", então deixam de aparecer separados na análise de tendência. Voltar
atrás é uma migration curta.

## Categorização manual

A categoria de qualquer transação pode ser trocada direto na listagem. Com "lembrar"
ligado (o padrão), a escolha vira uma regra `learned` para o mesmo estabelecimento e é
aplicada de imediato às transações passadas que casam — é o que evita repetir a mesma
correção trinta vezes.

Três decisões que evitam estrago:

**Escolha manual anterior nunca é sobrescrita.** A aplicação retroativa só toca no que
foi categorizado automaticamente. Uma decisão sua é informação, não ruído.

**A regra aprendida vence as do sistema, mas não as de transferência.** Prioridade 5:
à frente do palpite genérico do seed (10–20), atrás das regras de pagamento de fatura
(1). Sem isso, um aprendizado poderia fazer a fatura voltar a contar como despesa.

**Sair de "Transferências" devolve a transação aos totais.** Trocar a categoria sem
desmarcar `is_transfer` faria o gasto sumir da Visão Geral sem explicação.

Chave de estabelecimento curta demais (menos de 3 caracteres) não vira regra: ela
casaria com meio extrato.

## O que vem depois do MVP

- **Reconciliação explícita fatura x conta** — linkar as duas pontas do pagamento (`counterpart_transaction_id`); hoje as duas já ficam fora dos totais, falta o link
- **Metas e Parcelas** — tabelas prontas, sem UI
- **Adapter do C6** — a porta existe, falta um export real
- **Lançamento manual** para gasto em dinheiro que não passa por CSV nenhum
