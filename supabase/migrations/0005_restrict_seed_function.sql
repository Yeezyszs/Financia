-- O PostgREST expoe como RPC tudo que vive no schema public, e
-- seed_default_categories e SECURITY DEFINER - ou seja, roda com os
-- privilegios do dono, ignorando RLS.
--
-- Combinacao ruim: qualquer um com a chave anon (que e publica por design,
-- vai no bundle do browser) poderia chamar /rest/v1/rpc/seed_default_categories
-- passando um uuid qualquer. Escrita sem autenticacao.
--
-- E funcao de setup, chamada uma vez por usuario. Só o service role precisa.
--
-- Pego pelo linter de seguranca do Supabase (`get_advisors`), que vale rodar
-- depois de qualquer DDL.
revoke execute on function public.seed_default_categories(uuid) from public;
revoke execute on function public.seed_default_categories(uuid) from anon;
revoke execute on function public.seed_default_categories(uuid) from authenticated;
