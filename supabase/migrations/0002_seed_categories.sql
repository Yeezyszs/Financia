-- Categorias e regras iniciais. Como cada linha precisa de um owner_id, o seed
-- e uma funcao chamada por usuario: select seed_default_categories('<uuid>');
-- Idempotente: rodar de novo nao duplica nem sobrescreve regra aprendida.

create or replace function seed_default_categories(owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  seed record;
  cat_id uuid;
  keyword text;
begin
  for seed in
    select * from (values
      ('Nao categorizado', true,  array[]::text[]),
      ('Alimentacao',      false, array['IFOOD','RAPPI','SUPERMERCADO','PADARIA','RESTAURANTE','MERCADO','ASSAI','CARREFOUR','PAO DE ACUCAR']),
      ('Transporte',       false, array['UBER','99APP','99 POP','CABIFY','POSTO','SHELL','IPIRANGA','ESTACIONAMENTO']),
      ('Assinaturas',      false, array['NETFLIX','SPOTIFY','AMAZON PRIME','DISNEY','YOUTUBE PREMIUM','APPLE COM','GOOGLE ONE','ICLOUD']),
      ('Saude',            false, array['DROGARIA','FARMACIA','DROGASIL','RAIA','LABORATORIO','CLINICA','HOSPITAL']),
      ('Casa',             false, array['ENEL','SABESP','COMGAS','VIVO','CLARO','TIM','NET','CONDOMINIO','ALUGUEL']),
      ('Lazer',            false, array['CINEMA','INGRESSO','STEAM','PLAYSTATION','XBOX','BAR ','CERVEJARIA']),
      ('Educacao',         false, array['UDEMY','ALURA','COURSERA','FACULDADE','LIVRARIA','AMAZON']),
      ('Compras',          false, array['MERCADO LIVRE','MERCADOLIVRE','SHOPEE','ALIEXPRESS','MAGAZINE','RENNER','ZARA'])
    ) as t(name, is_fallback, keywords)
  loop
    insert into categories (owner_id, name, is_fallback)
    values (owner, seed.name, seed.is_fallback)
    on conflict (owner_id, name) do nothing;

    select id into cat_id from categories where owner_id = owner and name = seed.name;

    foreach keyword in array seed.keywords loop
      insert into category_rules (category_id, match, learned)
      values (cat_id, keyword, false)
      on conflict (category_id, match) do nothing;
    end loop;
  end loop;
end;
$$;

comment on function seed_default_categories is
  'Cria categorias padrao e regras de palavra-chave para um usuario. Idempotente.';
