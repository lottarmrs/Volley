-- Dados online, parte 2 (spec 2026-09-30-peladas-online-design.md): peladas, times, jogos, pontos,
-- relatorios e a janela da lista sao lidos e gravados direto no banco, e o tempo real so avisa
-- "mudou, releia".

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
  foreach v_table in array array['sessions', 'teams', 'games', 'point_events', 'game_reports', 'session_reports', 'registration_windows']
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
