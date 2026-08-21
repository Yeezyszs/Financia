import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../../config/env.js';

/**
 * Cliente com service role: o backend é a única fronteira de acesso e já
 * filtra tudo por user_id. RLS continua ligada para proteger acesso
 * direto de qualquer cliente que use a anon key.
 */
export function createSupabaseClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
