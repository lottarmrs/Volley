-- Multi-set: histórico de sets do confronto e alvo de pontos por set.
-- Aditiva e segura (colunas anuláveis); set único deixa NULL.
alter table public.games
  add column if not exists sets jsonb,
  add column if not exists set_targets jsonb;
