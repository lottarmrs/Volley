-- Busca de comunidade publica ignorando acento.
--
-- O ilike puro nao dobra acento: procurar "Sao Goncalo" nao achava "Vôlei São Gonçalo".
-- Mesmo defeito que a busca de atletas no cliente, corrigido junto (matchesSearch em
-- src/logic/textNormalization.ts).
--
-- A extensao vai para `extensions`, schema padrao do Supabase, e nao para `public` —
-- por isso o search_path da funcao precisa lista-lo.
--
-- unaccent() nao e IMMUTABLE, entao nao serve para indice funcional. Aqui nao importa:
-- a consulta ja e um scan com `limit 30` sobre comunidades publicas. Se a tabela crescer
-- a ponto de doer, o caminho e um indice sobre uma coluna normalizada, nao este predicado.

create extension if not exists unaccent with schema extensions;

create or replace function public.search_public_communities(p_query text)
returns table (
  id uuid,
  name text,
  description text,
  member_count bigint,
  my_status text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    c.id,
    c.name,
    c.description,
    (select count(*) from public.community_members m where m.community_id = c.id and m.status = 'active'),
    (select cm.status from public.community_members cm
       where cm.community_id = c.id and cm.user_id = (select auth.uid()) limit 1)
  from public.communities c
  where c.visibility = 'public'
    and c.deleted_at is null
    and (
      coalesce(trim(p_query), '') = ''
      or unaccent(c.name) ilike '%' || unaccent(trim(p_query)) || '%'
    )
  order by c.name
  limit 30;
$$;

revoke execute on function public.search_public_communities(text) from public, anon;
grant execute on function public.search_public_communities(text) to authenticated;
