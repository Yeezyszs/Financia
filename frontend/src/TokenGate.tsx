import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, api, tokenStorage } from './api/client.js';

/**
 * Porta de entrada. O token é digitado e guardado no localStorage —
 * nunca embutido no bundle, que qualquer um pode baixar. Some quando o
 * login pelo Supabase Auth entrar no lugar.
 */
export function TokenGate({ onUnlocked }: { onUnlocked: () => void }): ReactNode {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setChecking(true);
    setError(null);

    tokenStorage.set(token.trim());

    try {
      // Uma chamada autenticada qualquer serve para validar o token.
      await api.accounts();
      onUnlocked();
    } catch (err) {
      tokenStorage.clear();

      // Distinguir 401 do resto importa: com a mensagem genérica, uma API
      // fora do ar ou sem variável de ambiente parece token errado, e o
      // usuário fica trocando de token sem chance de acertar.
      if (err instanceof ApiError && err.status === 401) {
        setError('Token não confere com o configurado no servidor.');
      } else if (err instanceof ApiError) {
        setError(`A API respondeu ${err.status}: ${err.message}`);
      } else {
        setError('Não consegui falar com a API. Ela pode não estar no ar.');
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="gate">
      <form className="card gate-card stack" onSubmit={submit}>
        <h1 className="page-title" style={{ margin: 0 }}>
          Financia
        </h1>
        <p style={{ margin: 0 }}>
          Cole o token de acesso da API para entrar. Ele fica guardado neste navegador.
        </p>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="API_TOKEN"
          autoFocus
          autoComplete="current-password"
        />
        {error ? <div className="notice error">{error}</div> : null}
        <button className="primary" type="submit" disabled={checking || token.trim().length === 0}>
          {checking ? 'Verificando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
