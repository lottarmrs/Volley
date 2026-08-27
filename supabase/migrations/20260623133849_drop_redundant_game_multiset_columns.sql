-- Revertendo: o app persiste sets/setTargets dentro de games.metadata (jsonb).
-- Colunas dedicadas ficariam sem uso. Removendo para manter o schema limpo.
alter table public.games
  drop column if exists sets,
  drop column if exists set_targets;
