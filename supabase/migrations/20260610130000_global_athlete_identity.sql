-- Global athlete identity: give every player a unique, human-readable username.
--
-- players.id (uuid) is already the canonical global identity. This migration adds
-- a `username` handle (globally unique, case-insensitive), backfills existing
-- rows deterministically from their name, and exposes a controlled lookup so an
-- authenticated user can find an athlete by handle to add to their community.
--
-- (owner_id, local_id) is intentionally left untouched: it remains the curator's
-- local<->cloud reconciliation key. Non-curators read shared athletes via
-- community membership (current_user_can_access_player) and will contribute
-- through a future player_evaluations table, never by upserting the player row.

alter table public.players add column if not exists username text;

create unique index if not exists players_username_lower_idx
  on public.players (lower(username));

-- Backfill usernames for existing rows, deterministically (ordered by age),
-- stripping Portuguese accents and de-duplicating with a numeric suffix.
do $$
declare
  rec record;
  base text;
  candidate text;
  suffix int;
begin
  for rec in
    select id, name from public.players
    where username is null
    order by created_at, id
  loop
    base := regexp_replace(
              regexp_replace(
                translate(
                  lower(coalesce(rec.name, '')),
                  'áàâãäéèêëíìîïóòôõöúùûüçñ',
                  'aaaaaeeeeiiiiooooouuuucn'
                ),
                '[^a-z0-9]+', '-', 'g'
              ),
              '(^-+|-+$)', '', 'g'
            );
    base := nullif(base, '');
    base := coalesce(base, 'atleta');

    candidate := base;
    suffix := 2;
    while exists (
      select 1 from public.players p where lower(p.username) = lower(candidate)
    ) loop
      candidate := base || '-' || suffix;
      suffix := suffix + 1;
    end loop;

    update public.players set username = candidate where id = rec.id;
  end loop;
end $$;

-- Controlled lookup: returns minimal identity for an athlete by handle, so a user
-- can discover an existing global athlete to add to their community. Does NOT
-- broaden row-level read of the players table; the SECURITY DEFINER function
-- exposes only id/username/name.
create or replace function public.find_player_by_username(target_username text)
returns table (id uuid, username text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.name
  from public.players p
  where lower(p.username) = lower(trim(target_username))
    and p.deleted_at is null
  limit 1;
$$;

grant execute on function public.find_player_by_username(text) to authenticated;
