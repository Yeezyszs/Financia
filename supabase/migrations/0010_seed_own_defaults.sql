-- =====================================================================
-- Versão de seed chamável pelo usuário logado.
--
-- seed_user_defaults(uuid) é SECURITY DEFINER e recebe um user_id
-- arbitrário — por isso fica revogada de `authenticated`. Esta aqui não
-- aceita parâmetro: lê auth.uid() do JWT da própria request e semeia
-- para esse usuário, e só para ele. É SECURITY DEFINER porque precisa
-- chamar a função revogada, mas não há como apontá-la para outra pessoa:
-- não existe parâmetro para isso.
--
-- Serve de rede de segurança para um usuário que exista sem categorias
-- (criado antes do trigger, por exemplo).
-- =====================================================================

create or replace function seed_my_defaults()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'seed_my_defaults exige sessão autenticada';
  end if;

  -- Só semeia quem ainda não tem nada: rodar de novo não duplica nem
  -- ressuscita categoria que o usuário apagou de propósito.
  if exists (select 1 from categories where user_id = v_user) then
    return;
  end if;

  insert into public.users (id, email, name)
  select v_user, u.email, coalesce(u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1))
    from auth.users u where u.id = v_user
  on conflict (id) do nothing;

  perform seed_user_defaults(v_user);
end;
$$;

grant execute on function seed_my_defaults() to authenticated;
