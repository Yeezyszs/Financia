import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Carimbo do build.
 *
 * Duas vezes seguidas uma mudança commitada e no ar não apareceu no
 * site, e não havia como saber, olhando a tela, se o deploy tinha
 * chegado ou não — a única saída era desconfiar do código, que estava
 * certo. O carimbo troca a suspeita por um fato visível: se o commit
 * mostrado no rodapé não é o último, o problema é entrega, não código.
 *
 * Na Vercel as variáveis já vêm prontas; localmente cai no git; num
 * tarball sem git nenhum, vira "desconhecido" em vez de quebrar o build.
 */
function carimbo(): { sha: string; ref: string; data: string } {
  const gitOu = (comando: string, alternativa: string): string => {
    try {
      return execSync(comando, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return alternativa;
    }
  };

  return {
    sha: (process.env.VERCEL_GIT_COMMIT_SHA ?? gitOu('git rev-parse HEAD', 'desconhecido')).slice(
      0,
      7,
    ),
    ref: process.env.VERCEL_GIT_COMMIT_REF ?? gitOu('git rev-parse --abbrev-ref HEAD', 'local'),
    data: new Date().toISOString(),
  };
}

export default defineConfig({
  define: {
    __BUILD__: JSON.stringify(carimbo()),
  },
  plugins: [react()],
  server: {
    // Em dev o frontend roda na 5173 e a API na 3333; em produção os dois
    // saem do mesmo domínio da Vercel e este proxy não existe.
    proxy: {
      '/api': 'http://localhost:3333',
    },
  },
});
