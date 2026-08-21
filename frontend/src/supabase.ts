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
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

/**
 * Valores colados errado quebram longe daqui e de um jeito ilegível: a
 * anon key vai como header HTTP, e um caractere fora do ASCII faz o
 * navegador recusar a request inteira com "String contains non
 * ISO-8859-1 code point" — que não diz nada sobre variável de ambiente.
 *
 * O caso comum é copiar a chave selecionando o texto na tela do
 * Supabase, onde ela aparece truncada: as reticências (…) vêm junto.
 */
function conferir(nome: string, valor: string): void {
  if (!valor) throw new Error(`Falta a variável ${nome} no build do frontend.`);

  const invalido = [...valor].find((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) > 0x7e);
  if (invalido) {
    const codigo = invalido.charCodeAt(0).toString(16).padStart(4, '0');
    throw new Error(
      `A variável ${nome} contém um caractere inválido (U+${codigo}). ` +
        'Isso costuma acontecer ao copiar o valor selecionando o texto na tela, ' +
        'que traz as reticências da versão truncada. Use o botão de copiar do ' +
        'painel do Supabase e recadastre a variável na Vercel.',
    );
  }
}

conferir('VITE_SUPABASE_URL', url);
conferir('VITE_SUPABASE_ANON_KEY', anonKey);

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
