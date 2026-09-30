# O membro lê o histórico — e quem apaga, no servidor

Parte 4b da fatia de permissões (`docs/PERMISSOES.md`, seção F: P17 e P18, e o servidor da P11).
A parte 4a (quem organiza) está em produção desde 2026-09-30.

## Por quê

- **P17 — o membro não lê as peladas da comunidade.** As policies de leitura de `sessions`,
  `teams`, `games`, `point_events`, `game_reports` e `session_reports` (definidas em
  `20260610161203_backend_operational_sync.sql`; `sessions` sem redefinição de leitura depois)
  chamam `public.current_user_has_community_role(community_id)` sem passar cargos, e o padrão desse
  auxiliar é `['owner', 'admin', 'moderator']`. O membro fica de fora: não vê histórico, ranking de
  peladas, nem (no futuro) o que está acontecendo.
- **`PRIVATE` × `PUBLISHED` não serve de critério.** Toda sessão alvo nasce `PRIVATE`
  (`sessions.publication_state`) e nada no app publica (`publish_target_session` não tem chamador).
- **O sync devolveria o histórico dos outros.** O app baixa as peladas com `select *` limitado pela
  RLS (`operationalCloudService.fetchAll`, só `authority_model = 'legacy'` para `sessions`), e sobe
  toda pelada local a cada sync com `owner_id = quem sincroniza`
  (`syncService.ts`, laço de sessões, e `mapSessionToDb`). Liberada a leitura, o aparelho do membro
  tentaria regravar peladas alheias e mostraria falhas; e o de um organizador, hoje, já regrava
  peladas de outro organizador tomando-as para si.
- **Quem apaga não tem regra no servidor.** A policy de `update` de `sessions` deixa qualquer
  organizador marcar `deleted_at` (apagar histórico), e a de `players` deixa o admin apagar um
  convidado — as telas da 4a (P11) e da 2a (P18) já não oferecem isso, mas o servidor aceita.

## Decisões tomadas com o usuário (2026-09-30)

1. O membro vê **todas as peladas da comunidade, menos rascunho** — marcadas, ao vivo e
   encerradas —, com times, jogos, pontos e relatórios. `PRIVATE`/`PUBLISHED` é ignorado.
2. O sync é ajustado **no mínimo necessário** para o histórico dos outros não voltar à nuvem:
   depois desta parte, o próximo projeto remove o sync inteiro e passa a trabalhar em tempo real,
   com membros acompanhando a pelada ao vivo.
3. Apagar histórico (pelada não rascunho) e apagar convidado são **só do dono da comunidade**, no
   servidor.

## Parte 1 — Leitura (P17)

Migration nova `20260930120000_membro_le_o_historico.sql`.

- Função `public.current_user_can_read_community_session(p_session_id uuid) returns boolean`,
  `security definer`, `search_path = ''`, `stable`: verdadeiro se
  - a sessão tem `owner_id = auth.uid()`; ou
  - a sessão tem `community_id` e quem pede tem cargo `owner`, `admin` ou `moderator` ativo na
    comunidade (o que já valia; inclui rascunho); ou
  - a sessão tem `community_id`, quem pede é membro ativo da comunidade em `community_members`
    (qualquer cargo), a sessão **não é rascunho** (`status <> 'draft'` na legada;
    `lifecycle_status <> 'DRAFT'` na alvo) e `deleted_at is null`.
  `revoke` de `public, anon`; `grant execute` a `authenticated` (é chamada dentro de policies).
- As policies de leitura das seis tabelas são recriadas (`drop policy if exists` + `create policy`,
  com os mesmos nomes) usando a função: em `sessions`, `current_user_can_read_community_session(id)`;
  nas outras cinco, `owner_id = auth.uid() or current_user_can_read_community_session(session_id)`.
  Antes, conferir a última definição de cada policy
  (`grep -rn 'can read' supabase/migrations/*.sql | grep 'public.<tabela>'`) e manter o que ela
  permitia além do cargo (ex.: superadmin via `is_superadmin`, que o auxiliar de cargo já cobre).
- As policies de `insert`/`update`/`delete` não mudam nesta parte.

## Parte 2 — O sync não devolve o histórico dos outros

- **Download:** `Session`, `Team`, `Game`, `PointEvent`, `GameReport` e `SessionReport` ganham
  `cloudOwnerId?: string`, preenchido a partir de `owner_id` no mapeamento de leitura
  (`operationalCloudService.ts`).
- **Upload** (laços de `syncService.ts`): uma linha com `cloudOwnerId` de **outra conta** só sobe
  se `syncStatus === 'pending'`; sem isso, fica como está, marcada sincronizada. Quando sobe, o
  `owner_id` enviado é o `cloudOwnerId` (o dono original), nunca quem sincroniza.
- **Recusa** do servidor (`42501` / sem linha afetada) a uma linha de outra conta: um aviso
  (`onIssue`) e a linha sai marcada sincronizada, sem repetir a cada sync.
- Nada mais do sync muda (decisão 2).

## Parte 3 — Quem apaga, no servidor

Na mesma migration:

- **Histórico (servidor da P11):** gatilho `before update` em `sessions`,
  `zz_guard_history_delete_owner_only`: quando `deleted_at` passa de nulo a preenchido numa sessão
  com `community_id` que **não é rascunho**, exige que quem pede seja `owner` ativo da comunidade
  (`current_user_has_community_role(community_id, array['owner'])`, que inclui superadmin); senão
  `42501` (`Only the Community owner can delete history`). Sem usuário (`auth.uid()` nulo: funções
  internas), passa. Rascunho: continua a regra da policy de `update`.
- **Convidado (P18):** gatilho `before update` em `players`,
  `zz_guard_guest_delete_owner_only`: quando `deleted_at` passa de nulo a preenchido num atleta
  **sem conta** (`not public.player_has_account(id)`), exige que quem pede seja `owner` ativo de
  uma comunidade em que o atleta tem vínculo (`community_players` não apagado); senão `42501`
  (`Only the Community owner can delete a guest`). Sem usuário, passa. Desativar (`active = false`)
  não é afetado.
- Funções dos gatilhos em `app_private`, `security definer`, `search_path = ''`, revogadas de
  `public, anon, authenticated`.

## Testes

- `src/test/db/membroLeOHistorico.dbtest.ts`:
  - o membro lê a pelada encerrada e os times, jogos e pontos dela;
  - o membro não lê o rascunho nem os times dele;
  - quem é de fora não lê nada;
  - dono, admin e moderador leem o rascunho;
  - membro suspenso (`status <> 'active'`) não lê;
  - o dono apaga uma pelada encerrada; admin e organizador recebem `42501`; quem criou descarta o
    próprio rascunho;
  - o dono apaga um convidado; o admin recebe `42501` ao apagar e consegue desativar.
- `syncService.test.ts`: o download guarda o dono; o upload pula a linha alheia sem mudança; a
  linha alheia com mudança sobe com o dono original; a recusa avisa uma vez e sai sincronizada.
- Suítes antigas de banco que dependiam de o organizador apagar peladas ou de o admin apagar
  convidado: ajustar a assertiva que contradiz a decisão 3 e dizer qual.

## Documentos

- `docs/PERMISSOES.md`: P17 e P18 resolvidas; a nota "Pendente antes do plano da parte 4" sai
  (respondida: o membro vê tudo menos rascunho); seção E registra a 4b e o próximo projeto (tempo
  real sem sync, membros acompanham a pelada ao vivo).
- `docs/JORNADA.md`: "O membro vê o histórico da comunidade?" (sim, menos rascunho), "Quem apaga
  histórico e convidado?" (o dono), e na Etapa 9 a pergunta "O membro acompanha a pelada ao vivo?"
  (❓ próximo projeto).

## Fora desta parte

- Remover o sync e trabalhar em tempo real; membros acompanham a pelada ao vivo → próximo projeto.
