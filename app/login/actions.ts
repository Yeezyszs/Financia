'use server';

import { redirect } from 'next/navigation';
import { userClient } from '@/src/infrastructure/config/supabase';

export type LoginState = { error: string } | null;

export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) return { error: 'Preencha e-mail e senha.' };

  const supabase = await userClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Mensagem generica de proposito: dizer "usuario nao existe" contra
    // "senha errada" entrega quais e-mails tem conta.
    return { error: 'E-mail ou senha invalidos.' };
  }

  redirect('/');
}

export async function signOut(): Promise<void> {
  const supabase = await userClient();
  await supabase.auth.signOut();
  redirect('/login');
}
