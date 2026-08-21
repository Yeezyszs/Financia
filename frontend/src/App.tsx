import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ApiError, api, tokenStorage } from './api/client.js';
import type { Account, Category } from './api/types.js';
import { TokenGate } from './TokenGate.js';
import { Overview } from './screens/Overview.js';
import { Transactions } from './screens/Transactions.js';
import { History } from './screens/History.js';

type Screen = 'overview' | 'transactions' | 'history';

const SCREENS: { id: Screen; label: string }[] = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'transactions', label: 'Transações' },
  { id: 'history', label: 'Histórico' },
];

export function App(): ReactNode {
  const [unlocked, setUnlocked] = useState(() => tokenStorage.get() !== null);
  const [screen, setScreen] = useState<Screen>('overview');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Trocar a chave remonta as telas — é como o import força o recarregamento
  // dos dados sem cada tela precisar saber que houve import.
  const [dataVersion, setDataVersion] = useState(0);

  const loadReferenceData = useCallback(() => {
    Promise.all([api.accounts(), api.categories()])
      .then(([loadedAccounts, loadedCategories]) => {
        setAccounts(loadedAccounts);
        setCategories(loadedCategories);
        setError(null);
      })
      .catch((err: Error) => {
        // Token revogado ou trocado: volta para a porta de entrada.
        if (err instanceof ApiError && err.status === 401) {
          tokenStorage.clear();
          setUnlocked(false);
          return;
        }
        setError(err.message);
      });
  }, []);

  useEffect(() => {
    if (unlocked) loadReferenceData();
  }, [unlocked, loadReferenceData]);

  if (!unlocked) {
    return <TokenGate onUnlocked={() => setUnlocked(true)} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Financia</span>
        <nav className="nav">
          {SCREENS.map((item) => (
            <button
              key={item.id}
              onClick={() => setScreen(item.id)}
              aria-current={screen === item.id ? 'page' : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button
          className="ghost"
          onClick={() => {
            tokenStorage.clear();
            setUnlocked(false);
          }}
        >
          Sair
        </button>
      </header>

      <main>
        {error ? <div className="notice error">{error}</div> : null}

        {screen === 'overview' ? <Overview key={`overview-${dataVersion}`} /> : null}
        {screen === 'transactions' ? (
          <Transactions
            key={`transactions-${dataVersion}`}
            accounts={accounts}
            categories={categories}
          />
        ) : null}
        {screen === 'history' ? (
          <History
            accounts={accounts}
            onImported={() => setDataVersion((version) => version + 1)}
          />
        ) : null}
      </main>
    </div>
  );
}
