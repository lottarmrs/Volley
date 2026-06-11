-- Taxonomia de eventos (Fase D): colunas estruturadas para pontos do vôlei.
-- Migração ADITIVA e segura: colunas anuláveis, sem CHECK, sem mudança de RLS.
-- Dados antigos continuam válidos (os novos campos ficam NULL).

alter table public.point_events
  add column if not exists point_type text,
  add column if not exists skill text,
  add column if not exists fault text,
  add column if not exists player_team_id text;
