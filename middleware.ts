import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/logout'];

/**
 * Renova o token da sessao a cada request e barra quem nao esta logado.
 *
 * O middleware precisa existir mesmo com a checagem nas paginas: o access
 * token do Supabase dura uma hora, e so o middleware consegue escrever o
 * cookie renovado na resposta. Sem ele, a sessao morre em uma hora mesmo com
 * o usuario ativo.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env['SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // getUser() valida contra o servidor de auth e, de quebra, dispara a
  // renovacao do token. getSession() so leria o cookie, que nao serve para
  // autorizar nada porque o cliente pode forja-lo.
  const { data } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!data.user && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Tudo, menos:
     *  - /api  (cron e webhook: autenticam por segredo proprio, nao por sessao;
     *           passar por aqui redirecionaria o Pub/Sub para a tela de login)
     *  - estaticos do Next e favicon
     */
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon).*)',
  ],
};
