import { redirect } from 'next/navigation';
import { buildContainer, type Container } from './container';
import { currentUser, userClient } from './supabase';

/**
 * Container ligado a sessao do usuario, com o dono ja resolvido.
 *
 * Toda pagina e server action passa por aqui. Duas garantias em um lugar so:
 * quem nao esta logado nao chega no conteudo, e o `ownerId` vem do token
 * validado no servidor - nunca de parametro de request, que o cliente
 * controla.
 */
export async function requireSession(): Promise<{ ownerId: string; email: string; container: Container }> {
  const user = await currentUser();
  if (!user) redirect('/login');

  return {
    ownerId: user.id,
    email: user.email,
    container: buildContainer(await userClient()),
  };
}
