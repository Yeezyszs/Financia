import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ApiError, api } from './api/client.js';
import type { Account, Category } from './api/types.js';
import { supabase } from './supabase.js';
import { Login } from './Login.js';
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
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [screen, setScreen] = useState<Screen>('overview');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Trocar a chave remonta as telas — é como o import força o recarregamento
  // dos dados sem cada tela precisar saber que houve import.
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    // A sessão já pode estar no localStorage de uma visita anterior.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
    });

    // Login, logout e renovação de token passam por aqui.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const loadReferenceData = useCallback(() => {
    Promise.all([api.accounts(), api.categories()])
      .then(([loadedAccounts, loadedCategories]) => {
        setAccounts(loadedAccounts);
        setCategories(loadedCategories);
        setError(null);
      })
      .catch((err: Error) => {
        // Sessão expirada e não renovável: volta para o login.
        if (err instanceof ApiError && err.status === 401) {
          void supabase.auth.signOut();
          return;
        }
        setError(err.message);
      });
  }, []);

  useEffect(() => {
    if (session) loadReferenceData();
  }, [session, loadReferenceData]);

  if (checkingSession) {
    return (
      <div className="gate">
        <div className="card gate-card">
          <span className="skeleton" style={{ display: 'block' }} />
        </div>
      </div>
    );
  }

  if (!session) return <Login />;

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
        <button className="ghost" onClick={() => void supabase.auth.signOut()}>
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
