import { z } from 'zod';

/**
 * Nada aqui é segredo.
 *
 * Com login de verdade, o backend fala com o Supabase usando a anon key
 * e o JWT do usuário logado — e a anon key é pública por design, feita
 * para ficar exposta no frontend. Quem protege os dados é o RLS, que
 * roda dentro do banco.
 *
 * A service_role key saiu de cena: ela ignora RLS, e a única razão de
 * existir aqui era suprir a falta de autenticação.
 */
const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3333),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuração inválida (.env):\n${details}`);
  }
  return parsed.data;
}
