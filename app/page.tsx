import { buildContainer } from '@/src/infrastructure/config/container';
import { env } from '@/src/infrastructure/config/env';
import { Money } from '@/src/domain/entities/Money';
import type { Transaction } from '@/src/domain/entities/Transaction';
import { CategoryPicker } from './CategoryPicker';

export const dynamic = 'force-dynamic';

const DAY_FORMAT = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
const TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

export default async function HomePage() {
  // TODO: trocar por auth.getUser() quando o login entrar. Enquanto e so o
  // Pedro, o owner vem do env - Arthur entra junto com a autenticacao.
  const ownerId = env.defaultOwnerId;
  const { useCases, repositories } = buildContainer();

  const [{ items, totalCents }, categories, accounts] = await Promise.all([
    useCases.listTransactions.execute({ ownerId, limit: 100 }),
    repositories.categories.listByOwner(ownerId),
    repositories.accounts.listByOwner(ownerId),
  ]);

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const fallbackId = categories.find((c) => c.isFallback)?.id ?? null;
  const pendingCount = items.filter((t) => t.categoryId === fallbackId).length;

  return (
    <main>
      <header>
        <h1>Financia</h1>
        <p>Ultimas {items.length} transacoes, ingeridas automaticamente do e-mail.</p>
      </header>

      <dl className="summary">
        <div>
          <dt>Total no periodo</dt>
          <dd>{Money.fromCents(totalCents).format()}</dd>
        </div>
        <div>
          <dt>Transacoes</dt>
          <dd>{items.length}</dd>
        </div>
        <div>
          <dt>A categorizar</dt>
          <dd>{pendingCount}</dd>
        </div>
      </dl>

      {items.length === 0 ? (
        <p className="empty">
          Nenhuma transacao ainda. Cadastre uma fonte em <code>email_sources</code> e rode{' '}
          <code>GET /api/sync?days=90</code> para trazer o historico.
        </p>
      ) : (
        groupByDay(items).map(([day, dayItems]) => (
          <section key={day}>
            <h2 className="day">{day}</h2>
            <ul className="transactions">
              {dayItems.map((t) => (
                <li key={t.id} className="transaction">
                  <div className="merchant">
                    <strong>{t.merchant}</strong>
                    <span>
                      {TIME_FORMAT.format(t.occurredAt)}
                      {' · '}
                      {accountName.get(t.accountId) ?? 'conta desconhecida'}
                      {t.installment ? ` · parcela ${t.installment.current}/${t.installment.total}` : ''}
                      {t.kind === 'refund' ? ' · estorno' : ''}
                    </span>
                  </div>

                  <CategoryPicker
                    transactionId={t.id}
                    categoryId={t.categoryId}
                    isPending={t.categoryId === fallbackId}
                    categories={categories.map((c) => ({ id: c.id, name: c.name }))}
                  />

                  <span className={t.kind === 'refund' ? 'amount refund' : 'amount'}>{t.amount.format()}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}

/** Agrupa mantendo a ordem que veio do banco (occurred_at desc). */
function groupByDay(items: Transaction[]): Array<[string, Transaction[]]> {
  const groups = new Map<string, Transaction[]>();
  for (const item of items) {
    const key = DAY_FORMAT.format(item.occurredAt);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()];
}
