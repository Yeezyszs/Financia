-- =====================================================================
-- Contador de uso das regras de categorização. Uma chamada por
-- importação, em vez de um update por transação categorizada.
-- =====================================================================

create or replace function increment_rule_hits(p_rule_ids uuid[])
returns void
language sql
volatile
set search_path = public
as $$
  update category_rules r
     set hit_count = r.hit_count + u.hits
    from (
      select id, count(*) as hits
        from unnest(p_rule_ids) as id
       group by id
    ) u
   where r.id = u.id;
$$;

revoke execute on function increment_rule_hits(uuid[]) from anon, authenticated, public;
