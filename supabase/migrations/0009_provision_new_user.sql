-- =====================================================================
-- Provisionamento automático de usuário novo.
--
-- Antes, o perfil em public.users e as categorias padrão eram criados na
-- mão. Resultado: qualquer usuário criado pelo painel do Supabase entrava
-- no app e encontrava tudo vazio — sem categoria, sem conta, sem
-- explicação. E, como as tabelas têm on delete cascade, recriar o usuário
-- para trocar a senha apagava os dados do id antigo.
--
-- Agora o próprio banco provisiona: o trigger roda no insert em
-- auth.users, venha ele do painel, do signup ou da API de admin.
-- =====================================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  perform seed_user_defaults(new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
