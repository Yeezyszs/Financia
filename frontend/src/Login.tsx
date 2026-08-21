import { useState, type FormEvent, type ReactNode } from 'react';
import { supabase } from './supabase.js';

/** Mensagens do Supabase Auth vêm em inglês e genéricas demais. */
function traduzir(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(message)) return 'E-mail ainda não confirmado.';
  if (/too many requests|rate limit/i.test(message)) {
    return 'Muitas tentativas seguidas. Espera um minuto e tenta de novo.';
  }
  // "Failed to fetch" é o que o navegador diz quando nem chegou ao servidor.
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Não consegui falar com o servidor de login. Verifique a conexão.';
  }
  return message;
}

export function Login(): ReactNode {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    // Não precisa navegar depois de entrar: o App escuta onAuthStateChange
    // e troca a tela sozinho quando a sessão aparece.
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) setError(traduzir(authError.message));
    setBusy(false);
  }

  async function recuperarSenha(): Promise<void> {
    if (!email.trim()) {
      setError('Preencha o e-mail para receber o link de recuperação.');
      return;
    }

    setBusy(true);
    setError(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });

    if (resetError) setError(traduzir(resetError.message));
    else setNotice('Link de recuperação enviado. Confere a caixa de entrada.');

    setBusy(false);
  }

  return (
    <div className="gate">
      <form className="card gate-card stack" onSubmit={submit}>
        <h1 className="page-title" style={{ margin: 0 }}>
          Financia
        </h1>
        <p style={{ margin: 0 }}>Entre com seu e-mail e senha.</p>

        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </div>

        <div className="field">
          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        {error ? <div className="notice error">{error}</div> : null}
        {notice ? <div className="notice">{notice}</div> : null}

        <button className="primary" type="submit" disabled={busy || !email || !password}>
          {busy ? 'Entrando...' : 'Entrar'}
        </button>

        <button
          type="button"
          className="ghost"
          onClick={() => void recuperarSenha()}
          disabled={busy}
        >
          Esqueci minha senha
        </button>
      </form>
    </div>
  );
}
