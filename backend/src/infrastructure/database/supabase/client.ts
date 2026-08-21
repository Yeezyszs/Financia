import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../../config/env.js';

/**
 * Um cliente por request, carregando o JWT do usuário logado.
 *
 * O PostgREST valida a assinatura desse token e expõe o `sub` como
 * `auth.uid()` dentro do Postgres — que é exatamente o que as políticas
 * de RLS comparam com `user_id`. Resultado: o isolamento entre usuários
 * é feito pelo banco, não por um `where` que a gente possa esquecer.
 */
export function createSupabaseClient(env: Env, accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
