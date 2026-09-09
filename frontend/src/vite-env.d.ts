/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Carimbo injetado pelo Vite no build — veja `vite.config.ts`. */
declare const __BUILD__: { sha: string; ref: string; data: string };
