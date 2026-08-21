# Financia

Controle financeiro pessoal alimentado por **importação de CSV** dos apps do banco — não por lançamento manual transação a transação.

> Status: **Fase 1 (Fundação)** concluída — schema do banco + esqueleto Clean Architecture do backend. Parser de CSV, categorização e UI vêm nas fases seguintes.

## Stack

- **Backend:** Node.js 20+ · TypeScript · Express · Clean Architecture
- **Banco:** Supabase (Postgres) com RLS por `user_id`
- **Frontend:** React + TypeScript (ainda não iniciado)

## Estrutura

```
supabase/migrations/     # schema versionado (SQL)
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

Aplicar via Supabase CLI (`supabase db push`) ou colando no SQL Editor. Depois de criar o usuário no Auth:

```sql
insert into users (id, email, name) values ('<auth-user-id>', '<email>', 'Pedro');
select seed_user_defaults('<auth-user-id>');
```

## Rodando o backend

```bash
cd backend
cp .env.example .env    # preencher SUPABASE_URL, SERVICE_ROLE_KEY, DEFAULT_USER_ID
npm install
npm run dev             # http://localhost:3333
npm test                # testes de domínio
npm run typecheck
```

Endpoints da fundação: `GET /api/health`, `GET /api/accounts`, `POST /api/accounts`, `GET /api/transactions` (com filtros de conta, categoria, período e busca).

## Próximas fases

2. **Ingestão Nubank** — parser do CSV da conta corrente, upload manual, dedupe end-to-end
3. **Multi-conta** — fatura do cartão + reconciliação do pagamento de fatura
4. **Categorização automática** — motor de regras + "lembrar essa categoria"
5. **Consulta e relatórios** — UI React: Visão Geral, Transações, Histórico
