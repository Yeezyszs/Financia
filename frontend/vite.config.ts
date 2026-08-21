import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Em dev o frontend roda na 5173 e a API na 3333; em produção os dois
    // saem do mesmo domínio da Vercel e este proxy não existe.
    proxy: {
      '/api': 'http://localhost:3333',
    },
  },
});
