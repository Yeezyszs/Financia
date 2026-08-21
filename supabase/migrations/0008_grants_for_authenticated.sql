-- =====================================================================
-- Com login de verdade, quem chama as funções é o usuário autenticado —
-- não mais a service_role. Elas voltam a ser executáveis por
-- `authenticated`.
--
-- É seguro: as três são SECURITY INVOKER, então leem e escrevem sob o
-- RLS de quem chamou. Passar o user_id de outra pessoa não devolve nada
-- e não altera nada.
--
-- seed_user_defaults continua revogada: é SECURITY DEFINER, roda com os
-- privilégios do dono e não pode ficar ao alcance de quem tem só a
-- anon key.
-- =====================================================================

grant execute on function transactions_totals_by_category(uuid, date, date, uuid[]) to authenticated;
grant execute on function transactions_monthly_totals(uuid, int) to authenticated;
grant execute on function increment_rule_hits(uuid[]) to authenticated;
