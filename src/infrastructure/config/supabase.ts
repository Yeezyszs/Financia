import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { env } from './env';

/**
 * Duas formas de falar com o banco, e a escolha entre elas e de seguranca,
 * nao de conveniencia:
 *
 * - service role: ignora RLS. So para jobs (cron, webhook), que rodam sem
 *   usuario e se autenticam por segredo proprio.
 * - sessao do usuario: usa a chave anon e o cookie da sessao, entao TODA
 *   query passa pelas policies de RLS. E o caminho de tudo que vem do browser.
 *
 * As policies escritas na migration 0001 (`auth.uid() = owner_id`) so tem
 * efeito no segundo caso. Usar service role numa pagina do usuario e
 * silenciosamente desligar a protecao inteira.
 */

export function serviceRoleClient(): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function userClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Server Component nao pode escrever cookie. O middleware ja cuidou
          // da renovacao da sessao, entao ignorar aqui e seguro.
        }
      },
    },
  });
}

/** Usuario da sessao, ou null. Nunca confia em cookie sem validar no servidor. */
export async function currentUser(): Promise<{ id: string; email: string } | null> {
  const supabase = await userClient();
  // getUser() valida o token contra o servidor de auth. getSession() apenas le
  // o cookie, que o cliente pode ter forjado - por isso nao serve para
  // autorizar nada.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? '' };
}
