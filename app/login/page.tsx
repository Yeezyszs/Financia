import { redirect } from 'next/navigation';
import { currentUser } from '@/src/infrastructure/config/supabase';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // Ja logado nao ve tela de login.
  if (await currentUser()) redirect('/');

  return (
    <main className="narrow">
      <header>
        <h1>Financia</h1>
        <p>Entre para ver suas transacoes.</p>
      </header>
      <LoginForm />
    </main>
  );
}
