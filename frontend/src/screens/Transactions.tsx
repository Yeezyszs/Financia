import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client.js';
import type { Account, Category, Transaction } from '../api/types.js';
import { date, money } from '../format.js';

const PAGE_SIZE = 50;

export function Transactions({
  accounts,
  categories,
}: {
  accounts: Account[];
  categories: Category[];
}): ReactNode {
  const [items, setItems] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [includeTransfers, setIncludeTransfers] = useState(false);

  // Busca com debounce para não disparar uma request por tecla digitada.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Qualquer mudança de filtro volta para a primeira página: manter o
  // offset antigo mostraria uma página vazia sem explicação.
  useEffect(() => {
    setOffset(0);
  }, [accountId, categoryId, from, to, debouncedSearch, includeTransfers]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    api
      .transactions({
        ...(accountId ? { accountIds: [accountId] } : {}),
        ...(categoryId ? { categoryIds: [categoryId] } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(includeTransfers ? { includeTransfers: true } : {}),
        limit: PAGE_SIZE,
        offset,
      })
      .then((page) => {
        if (!active) return;
        setItems(page.data);
        setTotal(page.meta.total);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accountId, categoryId, from, to, debouncedSearch, includeTransfers, offset]);

  const accountName = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts],
  );
  const categoryName = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const lastPage = offset + PAGE_SIZE >= total;

  return (
    <>
      <h1 className="page-title">Transações</h1>
      <p className="page-subtitle">
        {total} {total === 1 ? 'transação' : 'transações'} no filtro atual.
      </p>

      <div className="filters">
        <div className="field">
          <label htmlFor="conta">Conta</label>
          <select id="conta" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Todas</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="categoria">Categoria</label>
          <select id="categoria" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Todas</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="de">De</label>
          <input id="de" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="ate">Até</label>
          <input id="ate" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>

        <div className="field" style={{ flex: 1, minWidth: 200 }}>
          <label htmlFor="busca">Busca</label>
          <input
            id="busca"
            type="search"
            placeholder="Descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <label className="row" style={{ fontSize: 13, gap: 6, paddingBottom: 8 }}>
          <input
            type="checkbox"
            style={{ minWidth: 'auto' }}
            checked={includeTransfers}
            onChange={(e) => setIncludeTransfers(e.target.checked)}
          />
          Mostrar transferências
        </label>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th>Conta</th>
              <th>Categoria</th>
              <th className="num">Valor</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>
                  <div className="stack" style={{ padding: '8px 0' }}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className="skeleton" />
                    ))}
                  </div>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty">
                    Nada aqui. Ajuste os filtros ou importe um extrato em Histórico.
                  </div>
                </td>
              </tr>
            ) : (
              items.map((transaction) => (
                <tr key={transaction.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{date(transaction.occurredOn)}</td>
                  <td>
                    {transaction.description}
                    {transaction.isTransfer ? (
                      <>
                        {' '}
                        <span className="tag">transferência</span>
                      </>
                    ) : null}
                  </td>
                  <td>{accountName.get(transaction.accountId) ?? '—'}</td>
                  <td>
                    {transaction.categoryId ? (
                      categoryName.get(transaction.categoryId) ?? '—'
                    ) : (
                      <span className="tag">sem categoria</span>
                    )}
                  </td>
                  <td className="num">
                    <span className={transaction.amountCents > 0 ? 'amount-in' : 'amount-out'}>
                      {money(transaction.amountCents)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE ? (
        <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} de {total}
          </span>
          <div className="row">
            <button
              className="ghost"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}
            >
              Anterior
            </button>
            <button className="ghost" disabled={lastPage} onClick={() => setOffset(offset + PAGE_SIZE)}>
              Próxima
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
