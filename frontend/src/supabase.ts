import { createClient } from '@supabase/supabase-js';

/**
 * Cliente de autenticação do navegador.
 *
 * A anon key é pública por design — ela vai no bundle e não é segredo.
 * O que protege os dados é o RLS no banco, que só libera as linhas do
 * usuário cujo JWT acompanha a request.
 *
 * A sessão fica no localStorage e o supabase-js renova o token sozinho
 * antes de expirar.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no build do frontend.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
