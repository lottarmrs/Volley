-- Gamificação de facilitadores (levantador/líbero):
-- distingue eventos de "lance" (highlight, sem placar) de pontos, e registra
-- a assistência (levantamento) num ponto de ataque.
-- Migração ADITIVA e segura: colunas anuláveis/com default, sem mudança de RLS.
-- As linhas existentes recebem event_kind = 'point' pelo default.

alter table public.point_events
  add column if not exists event_kind text not null default 'point',
  add column if not exists assist_player_id text;
