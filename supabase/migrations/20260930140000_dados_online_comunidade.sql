-- Dados online, parte 1 (spec 2026-09-30-dados-online-comunidade-design.md): o app le e grava
-- comunidade, membros, elenco e regras direto no banco, e o tempo real so avisa "mudou, releia".
-- A publicacao existe no Supabase; o Postgres de teste nao a tem.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['communities', 'community_members', 'community_players', 'players', 'community_rules']
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;
