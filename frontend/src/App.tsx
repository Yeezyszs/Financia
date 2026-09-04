import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ApiError, api } from './api/client.js';
import type { Account, Category, Drill } from './api/types.js';
import { supabase } from './supabase.js';
import { MOBILE, useMediaQuery } from './useMediaQuery.js';
import { Login } from './Login.js';
import { Overview } from './screens/Overview.js';
import { Transactions } from './screens/Transactions.js';
import { History } from './screens/History.js';

type Screen = 'overview' | 'transactions' | 'history';

/**
 * O ícone só aparece na navegação de rodapé do celular, onde o alvo de
 * toque precisa ser grande e o rótulo fica pequeno demais sozinho.
 */
const SCREENS: { id: Screen; label: string; short: string; icon: ReactNode }[] = [
  {
    id: 'overview',
    label: 'Visão geral',
    short: 'Visão geral',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z" />
      </svg>
    ),
  },
  {
    id: 'transactions',
    label: 'Transações',
    short: 'Transações',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h13l-3-3 1.4-1.4L20.8 8l-5.4 5.4L14 12l3-3H4V7Zm16 10H7l3 3-1.4 1.4L3.2 16l5.4-5.4L10 12l-3 3h13v2Z" />
      </svg>
    ),
  },
  {
    id: 'history',
    label: 'Histórico',
    short: 'Histórico',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13 3a9 9 0 1 0 8.9 10.5h-2.05A7 7 0 1 1 13 5v4l5-4.5L13 0v3Zm-1 5v5.4l4.3 2.55.75-1.28-3.55-2.1V8H12Z" />
      </svg>
    ),
  },
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
  // O recorte pedido pela Visão geral. O contador serve para remontar
  // Transações a cada novo clique: sem ele, clicar em outra categoria
  // com a tela já aberta não trocaria o filtro.
  const [drill, setDrill] = useState<{ filtro: Drill; n: number } | null>(null);
  const isMobile = useMediaQuery(MOBILE);

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

        {/* No celular a navegação vai para a barra fixa do rodapé, ao
            alcance do polegar; no topo caberiam só dois rótulos e o
            terceiro sumiria fora da tela. */}
        {isMobile ? null : (
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
        )}

        <button className="ghost" onClick={() => void supabase.auth.signOut()}>
          Sair
        </button>
      </header>

      <main>
        {error ? <div className="notice error">{error}</div> : null}

        {screen === 'overview' ? (
          <Overview
            key={`overview-${dataVersion}`}
            onDrill={(filtro) => {
              setDrill((atual) => ({ filtro, n: (atual?.n ?? 0) + 1 }));
              setScreen('transactions');
            }}
          />
        ) : null}
        {screen === 'transactions' ? (
          <Transactions
            key={`transactions-${dataVersion}-${drill?.n ?? 0}`}
            accounts={accounts}
            categories={categories}
            {...(drill ? { drill: drill.filtro } : {})}
            onLimparDrill={() => setDrill(null)}
          />
        ) : null}
        {screen === 'history' ? (
          <History
            accounts={accounts}
            onImported={() => setDataVersion((version) => version + 1)}
            onAccountsChanged={loadReferenceData}
          />
        ) : null}
      </main>

      {isMobile ? (
        <nav className="tabbar" aria-label="Navegação principal">
          {SCREENS.map((item) => (
            <button
              key={item.id}
              onClick={() => setScreen(item.id)}
              aria-current={screen === item.id ? 'page' : undefined}
            >
              {item.icon}
              <span>{item.short}</span>
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
