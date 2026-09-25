-- Avaliacao da comunidade (spec 2026-09-25-avaliacao-da-comunidade-design.md).
--
-- Decisao do usuario em 2026-09-25: dono e admin avaliam pelo cargo e podem designar outros
-- avaliadores. Isso troca, para player.evaluate, a regra GINV-CAP-002 escrita em
-- 20260905185744 ("a governance rank never confers the right to evaluate a Player"). Em
-- producao ninguem tinha EVALUATOR, entao nenhuma comunidade conseguia avaliar.

-- Ultima definicao: 20260905185744_versioned_player_evaluation_source.sql. O execute continua
-- revogado de authenticated (auditoria A7, 20260908160000): create or replace preserva isso.
create or replace function public.community_capabilities(
  target_community_id uuid,
  target_user_id uuid
)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select c.capability
    from public.community_memberships m
    cross join lateral (
      select unnest(
        case m.role
          when 'owner' then array[
            'community.members.manage',
            'community.ownership.transfer',
            'community.profile.update',
            'community.archive',
            'player.evaluate'
          ]
          when 'admin' then array[
            'community.members.manage',
            'community.profile.update',
            'player.evaluate'
          ]
          else array[]::text[]
        end
      ) as capability
    ) c
   where m.community_id = target_community_id
     and m.user_id = target_user_id
     and m.status = 'active'

  union

  select 'session.manage'
    from public.community_responsibilities r
    join public.community_memberships m
      on m.community_id = r.community_id
     and m.user_id = r.user_id
     and m.status = 'active'
   where r.community_id = target_community_id
     and r.user_id = target_user_id
     and r.responsibility = 'ORGANIZER'
     and r.revoked_at is null

  union

  -- player.evaluate vem do cargo de dono ou admin (decisao de 2026-09-25) e tambem de uma
  -- responsabilidade EVALUATOR dada por quem gerencia membros.
  select 'player.evaluate'
    from public.community_responsibilities r
    join public.community_memberships m
      on m.community_id = r.community_id
     and m.user_id = r.user_id
     and m.status = 'active'
   where r.community_id = target_community_id
     and r.user_id = target_user_id
     and r.responsibility = 'EVALUATOR'
     and r.revoked_at is null;

  -- Deliberately absent, and each absence is asserted by the negative matrix:
  --   match.control      per-Match control is leased at Match time (GINV-MATCH-004),
  --                      never derived from a Community rank -- W7 owns it
  --   competition.admin  W8 owns it; an ORGANIZER is not a CompetitionAdmin
$$;
