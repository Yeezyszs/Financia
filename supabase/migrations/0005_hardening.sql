-- =====================================================================
-- Endurecimento apontado pelo linter do Supabase:
--  - search_path fixo nas funções
--  - pg_trgm fora do schema public
--  - funções não expostas a anon/authenticated (o acesso é pelo backend,
--    que usa service_role; seed_user_defaults é SECURITY DEFINER e não
--    pode ficar chamável por quem tem só a anon key)
-- =====================================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter extension pg_trgm set schema extensions;

revoke execute on function seed_user_defaults(uuid) from anon, authenticated, public;
revoke execute on function transactions_totals_by_category(uuid, date, date, uuid[]) from anon, authenticated, public;
revoke execute on function transactions_monthly_totals(uuid, int) from anon, authenticated, public;
