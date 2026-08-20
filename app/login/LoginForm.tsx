'use client';

import { useActionState } from 'react';
import { signIn, type LoginState } from './actions';

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(signIn, null);

  return (
    <form action={formAction} className="import-form">
      <label>
        E-mail
        <input type="email" name="email" required autoComplete="email" autoFocus inputMode="email" />
      </label>

      <label>
        Senha
        <input type="password" name="password" required autoComplete="current-password" />
      </label>

      <button type="submit" disabled={pending}>
        {pending ? 'Entrando...' : 'Entrar'}
      </button>

      {state?.error && <p className="result error">{state.error}</p>}
    </form>
  );
}
