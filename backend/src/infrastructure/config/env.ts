import { z } from 'zod';

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DEFAULT_USER_ID: z.string().uuid(),
  /** Trava de acesso da API — ver requireApiToken. Gere com: openssl rand -hex 32 */
  API_TOKEN: z.string().min(32, 'API_TOKEN precisa de pelo menos 32 caracteres'),
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
