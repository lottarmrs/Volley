# Perfil do atleta — avaliação na carta, presença frequente calculada, foto da própria conta

Parte 2b da fatia "o atleta não edita atleta" (`docs/PERMISSOES.md`, seções E e F). As partes 1
(avaliação da comunidade), 3 (ficha do atleta) e 2a (convidado numa comunidade só) estão em
produção desde 2026-09-27 e 2026-09-29.

## Por quê

- Tocar num atleta em Pessoas abre a carta (`FutCardModal`), que já é um perfil: Card, Evolução,
  Álbum, Carreira (confirmada na nuvem), Coleção e Exportar. Falta a **avaliação da comunidade**:
  a média por fundamento (`get_community_player_skill_profile`) só é lida por quem tem
  `player.evaluate` (dono, admin, avaliadores), e só na área Avaliação. O próprio atleta nunca vê a
  dele. `CommunitySkillProfilePanel` existe e está sem montagem desde a parte 3.
- **Presença frequente** (`status.presencaFrequente`) é uma marca manual que ninguém edita desde a
  parte 3 e que vale `true` para todo mundo (é o padrão de toda ficha criada). Ela filtra Pessoas,
  pré-seleciona a lista de presença e aparece como selo — sempre verdadeira, então não diz nada.
- **Foto (P19):** `propose_player_avatar` exige ser `owner_id` da ficha ou admin
  (`current_user_is_player_admin`); quem criou a ficha aprova. O atleta cuja ficha foi criada pelo
  organizador não troca a própria foto, e quem criou troca a foto de uma conta — o contrário da regra
  da parte 3. Em produção, em 2026-09-29, `player_avatar_proposals` está **vazia**: o fluxo de
  aprovação nunca foi usado. A caixa de aprovação (`AvatarApprovalInbox`) não é montada em lugar
  nenhum.

## Decisões tomadas com o usuário (2026-09-29)

1. A avaliação da comunidade aparece na carta para **quem avalia** (de todos) e para **o próprio
   atleta** (a dele), sem dizer quem deu cada nota. Os demais membros veem só a carta.
2. **Presença frequente é calculada pelo histórico**, por comunidade: esteve em pelo menos metade
   das últimas peladas encerradas. Ninguém edita.
3. **A foto de um atleta com conta só a conta troca, e vale na hora.** Convidado: dono ou admin da
   comunidade troca, também na hora.

## Parte 1 — Servidor

Migration nova `20260929130000_perfil_do_atleta.sql`.

### 1.1 Ler a avaliação

`public.get_community_player_skill_profile(p_community_id, p_player_id, p_rubric_version)` — última
definição em `20260908031027_global_skill_profile.sql` — passa a autorizar quem tem
`player.evaluate` na comunidade **ou** `public.player_is_linked_to_current_user(p_player_id)`. As
demais checagens ficam (vínculo vivo na comunidade, rubrica registrada), assim como o corpo que
delega a `app_private.compute_community_player_skill_profile`. `security definer`,
`search_path = ''` e os `grant`/`revoke` repetidos.

### 1.2 Trocar a foto

`public.propose_player_avatar` — última definição a conferir com
`grep -ln "create or replace function public.propose_player_avatar(" supabase/migrations/*.sql` —
passa a:

- ficha **com conta** (`public.player_has_account(p_player_id)`): só
  `public.player_is_linked_to_current_user(p_player_id)`; senão `42501`;
- ficha **sem conta** (convidado): `public.current_user_is_player_admin(p_player_id)`; senão
  `42501`;
- em ambos os casos a proposta nasce `approved` e `players.avatar_url` é atualizado na hora; as
  pendentes antigas da mesma ficha ficam obsoletas, como a função já faz para o criador.

A assinatura e o retorno não mudam. `approve_player_avatar` fica como está (sem chamador no cliente;
não há pendências em produção).

### 1.3 Testes — `src/test/db/perfilDoAtleta.dbtest.ts`

- o atleta lê a própria avaliação numa comunidade onde tem vínculo; não lê a de outro atleta (`42501`);
- quem avalia (dono) lê a de qualquer atleta da comunidade;
- a conta troca a própria foto e ela vale na hora (`players.avatar_url`), mesmo com outro `owner_id`;
- quem criou a ficha e o admin da comunidade **não** trocam a foto de uma conta (`42501`);
- o admin da comunidade troca a foto de um convidado e ela vale na hora.

## Parte 2 — Cliente

### 2.1 Aba "Avaliação" na carta

- `FutCardModal` ganha as props `communityId?: string | null` e `canSeeEvaluation?: boolean`, e uma
  aba **"Avaliação"** que só aparece com `canSeeEvaluation` e `player.cloudId`.
- A aba mostra `CommunitySkillProfilePanel` só para esta comunidade (média por fundamento e
  cobertura; sem nomes de avaliadores — o servidor já não os devolve).
- Quem abre a carta (`PlayersView`, a partir de `CommunityPeopleRoute`) calcula
  `canSeeEvaluation = capacidade de avaliar nesta comunidade (useCommunityCapabilities, 'player.evaluate') || player.userId === conta atual`.
  Comunidade sem `cloudId` ou app sem Supabase: `false`.
- É uma aba a mais numa tela existente, com um painel existente: segue o visual das outras abas; sem
  `/impeccable shape`.

### 2.2 Presença frequente calculada

- Função pura em `src/logic/community.ts`:
  `isFrequentInCommunity(playerId: string, sessions: Session[]): boolean` — considera as sessões
  recebidas com `status === 'finished'`, as 6 mais recentes por `session.date` (empate: `createdAt`); frequente se o atleta está em `selectedPlayerIds` de pelo menos
  `ceil(n / 2)` delas; com `n = 0`, `false`. Quem chama passa só as sessões da comunidade.
- Passa a alimentar:
  - o filtro "Frequentes" de Pessoas (`communityRosterFilters.ts`, caso `'frequent'`);
  - a pré-seleção de frequentes da lista de presença (`selectFrequentLocalPresencePlayers`, que
    passa a receber as sessões da comunidade);
  - o selo "✓ Frequente" (`PlayerComponents.tsx`) e o "· Presença frequente" do quadro de inscrição
    (`RegistrationBoardView.tsx`), que recebem o conjunto de frequentes de quem os monta; sem
    sessões à mão, o selo não aparece.
- `status.presencaFrequente` deixa de ser lido e escrito (convidado rápido,
  `buildDefaultCommunityPlayer`, `usePlayers`, dados de demonstração) e vira **opcional** no tipo
  `Player['status']` (`presencaFrequente?: boolean`), para a importação de backups antigos
  (`src/logic/migrations.ts`) continuar aceitando o campo. O dado antigo no `status` jsonb fica onde
  está.
- Limite conhecido: quem não lê as peladas da comunidade (o membro, até a P17 da parte 4) não vê
  ninguém como frequente.

### 2.3 Foto

- `AvatarUpload` deixa de falar em aprovação: a foto enviada vale na hora (texto e estado do
  componente; conferir o que ele mostra hoje depois do envio).
- Gestão → Convidados: o editor (`CommunityGuestsArea`) mostra `AvatarUpload` para convidado com
  `cloudId`, acima do formulário, como em Minha ficha.
- Saem `AvatarApprovalInbox` (sem montagem) e o que só servia a ele em `avatarUseCases.ts` /
  `avatarStorageService.ts` (aprovar/recusar/listar pendentes), com seus testes; o ledger
  (`src/architecture/currentStateLedger.ts`) é ajustado e o documento regenerado.

## Testes do cliente

- `isFrequentInCommunity`: sem sessões; menos de 6; exatamente metade; ignora não encerradas;
  só as 6 mais recentes contam.
- `communityRosterFilters` e `selectFrequentLocalPresencePlayers` com o cálculo novo.
- `FutCardModal.spec.tsx`: aba "Avaliação" com `canSeeEvaluation`; ausente sem ela e para ficha sem
  `cloudId`.
- `PlayersView.spec.tsx`: quem avalia vê a aba na carta de outro; o próprio atleta vê na dele; outro
  membro não vê.
- `CommunityGuestsArea.spec.tsx`: o editor de convidado com `cloudId` mostra o envio de foto.

## Documentos

- `docs/PERMISSOES.md`: P19 resolvida; seção E registra a parte 2b.
- `docs/JORNADA.md`: "O atleta vê a própria avaliação?", "Quem troca a foto de um atleta?",
  "O que é presença frequente?".

## Fora desta parte

- Pontas P11–P18 (permissões de histórico, ligas, torneios, painel, "quem organiza", marcar pelada
  pela responsabilidade, leitura de sessões pelo membro, "só o dono exclui" no servidor) → parte 4.
