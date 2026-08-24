import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client.js';
import type { Account, Category, Transaction } from '../api/types.js';
import { date, money } from '../format.js';
import { MOBILE, useMediaQuery } from '../useMediaQuery.js';
import { CategoryPicker } from '../components/CategoryPicker.js';

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
  const isMobile = useMediaQuery(MOBILE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [lembrar, setLembrar] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

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

  /**
   * Atualiza a linha localmente em vez de recarregar a lista inteira:
   * recarregar faria a página saltar e perderia a posição de rolagem no
   * meio de uma sequência de correções.
   */
  // O aviso se apaga sozinho — deixá-lo fixo faria o recado da correção
  // anterior conviver com a próxima.
  useEffect(() => {
    if (!aviso) return;
    const timer = setTimeout(() => setAviso(null), 4500);
    return () => clearTimeout(timer);
  }, [aviso]);

  const categorizar = useCallback(
    async (transactionId: string, categoryId: string | null) => {
      setAviso(null);

      // Aplica antes de perguntar ao servidor. A troca de categoria quase
      // sempre dá certo, e esperar a ida e volta para pintar a tela faz
      // cada correção parecer travada.
      const anterior = items;
      setItems((atuais) =>
        atuais.map((item) =>
          item.id === transactionId ? { ...item, categoryId, categorizedBy: 'manual' } : item,
        ),
      );

      try {
        const resultado = await api.categorizeTransaction(transactionId, {
          categoryId,
          remember: lembrar,
        });

        // As outras mudaram no servidor: aplicamos as mesmas linhas aqui em
        // vez de recarregar a lista. Recarregar esvaziaria a tabela por um
        // instante, e a página saltaria para o topo no meio da correção.
        const tambem = new Set(resultado.alsoUpdatedIds);
        setItems((atuais) =>
          atuais.map((item) =>
            item.id === transactionId
              ? resultado.transaction
              : tambem.has(item.id)
                ? { ...item, categoryId, categorizedBy: 'rule' as const }
                : item,
          ),
        );

        const total = resultado.alsoUpdatedIds.length;
        if (total > 0) {
          setAviso(
            `Categoria salva. ${total} ${
              total === 1
                ? 'transação parecida também foi atualizada'
                : 'transações parecidas também foram atualizadas'
            }.`,
          );
        } else if (resultado.learnedPattern) {
          setAviso(`Categoria salva e memorizada para "${resultado.learnedPattern}".`);
        }
      } catch (err) {
        // Desfaz o palpite otimista: mostrar uma categoria que não foi
        // salva é pior que não mostrar nada.
        setItems(anterior);
        setAviso(err instanceof Error ? err.message : 'Não consegui salvar a categoria.');
      }
    },
    [items, lembrar],
  );

  const accountName = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts],
  );

  const lastPage = offset + PAGE_SIZE >= total;

  // No celular os filtros ocupavam a tela inteira antes de qualquer dado
  // aparecer, então ficam recolhidos — com a contagem de quantos estão
  // ativos, para não esconder que um filtro está limitando a lista.
  const activeFilters = [accountId, categoryId, from, to, debouncedSearch].filter(Boolean).length;
  const showFilters = !isMobile || filtersOpen;

  return (
    <>
      <h1 className="page-title">Transações</h1>
      <p className="page-subtitle">
        {total} {total === 1 ? 'transação' : 'transações'} no filtro atual.
      </p>

      {isMobile ? (
        <button
          className="ghost filter-toggle"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
        >
          Filtros
          {activeFilters > 0 ? <span className="badge">{activeFilters}</span> : null}
        </button>
      ) : null}

      <div className="filters" hidden={!showFilters}>
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

      <label className="check-line">
        <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
        <span>Lembrar minha escolha para o mesmo estabelecimento</span>
      </label>

      {aviso ? (
        <div className="toast" role="status">
          {aviso}
        </div>
      ) : null}

      {isMobile ? (
        <div className="card-list">
          {loading && items.length === 0 ? (
            <div className="card stack">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="skeleton" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="card">
              <div className="empty">
                Nada aqui. Ajuste os filtros ou importe um extrato em Histórico.
              </div>
            </div>
          ) : (
            items.map((transaction) => (
              <article className="tx-card" key={transaction.id}>
                <div className="tx-card-top">
                  <span className="tx-desc">{transaction.description}</span>
                  <span
                    className={transaction.amountCents > 0 ? 'amount-in num' : 'amount-out num'}
                  >
                    {money(transaction.amountCents)}
                  </span>
                </div>
                <div className="tx-card-meta">
                  <span>{date(transaction.occurredOn)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{accountName.get(transaction.accountId) ?? '—'}</span>
                  <span aria-hidden="true">·</span>
                  <CategoryPicker
                    value={transaction.categoryId}
                    categories={categories}
                    onChange={(categoryId) => categorizar(transaction.id, categoryId)}
                  />
                  {transaction.isTransfer ? <span className="tag">transferência</span> : null}
                </div>
              </article>
            ))
          )}
        </div>
      ) : (
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
                      <CategoryPicker
                        value={transaction.categoryId}
                        categories={categories}
                        onChange={(categoryId) => categorizar(transaction.id, categoryId)}
                      />
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
      )}

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
            <button
              className="ghost"
              disabled={lastPage}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Próxima
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
