# Convidado numa comunidade só

Parte 2a da fatia "o atleta não edita atleta" (`docs/PERMISSOES.md`, seções E e F). As partes 1
(avaliação da comunidade) e 3 (ficha do atleta) estão em produção desde 2026-09-27 e 2026-09-29.
A parte 2b (perfil do atleta, presença frequente, troca da própria foto) vem depois desta.

## Por quê

- Convidado é, por definição, o atleta **sem conta**, e ele pertence a **uma** comunidade: é ela
  que o cadastra, o edita (Gestão → Convidados) e decide desativá-lo. Nada no servidor garante
  isso, e dois fluxos do app hoje fazem o contrário:
  - **"Duplicar com atletas"** (`applyCommunityMembershipDuplicate`) acrescenta a comunidade nova
    à lista de todo atleta da origem — convidados e também atletas com conta, que viram elenco de
    uma comunidade da qual não são membros (P8).
  - O **convidado rápido** do sorteio (`applyGuestPlayerUpsert` → `findDuplicatePlayerByProfile`)
    procura "duplicado" por nome, gênero, posição e altura em todos os atletas do aparelho, de
    qualquer comunidade, e reaproveita o que achar (P9). Como ignora desativados, cadastrar alguém
    igual a um desativado cria um registro repetido (P20).
- O gatilho "atleta sem conta numa comunidade só" foi adiado da parte 1 (spec da avaliação, 1.6)
  justamente por esses dois fluxos (P10).
- Quem encerra sessão sem poder editar convidado (moderador, organizador) marca a progressão dos
  convidados de outra pessoa como pendente; o servidor recusa e cada um vira um aviso, a cada
  sessão (P21).
- Em produção, em 2026-09-29: 35 convidados, **0** em mais de uma comunidade, 2 sem comunidade.

## Decisões tomadas com o usuário (2026-09-29)

1. **Duplicar comunidade copia só nome e regras.** A opção "com atletas" sai; o elenco da nova se
   monta de novo (convidados cadastrados lá, contas pelo convite).
2. **O convidado rápido só reaproveita convidado da mesma comunidade.** Achou um ativo: usa ele.
   Achou um desativado: pergunta "Reativar?". De outra comunidade, ou com conta, nunca.
3. O gatilho do servidor entra agora (0 casos a limpar).
4. P21 (decisão técnica do controlador, sem mudança de produto): a recusa do servidor à
   progressão de convidado alheio deixa de gerar aviso.

## Parte 1 — A regra e o servidor

### 1.1 A regra

Um atleta **sem conta** tem no máximo **um** vínculo ativo em `public.community_players` (linha
com `deleted_at is null` e `active`). "Sem conta" é a mesma definição da parte 3:
`public.player_has_account(player_id)` falso (sem `user_id` e sem vínculo `ACTIVE` em
`player_account_links`). Atleta com conta pode estar em quantas comunidades for.

### 1.2 O gatilho

Migration nova: `app_private.guard_guest_single_community()` + gatilho `before insert or update`
em `community_players`.

- Só age quando a linha nova fica ativa (`deleted_at is null` e `active`).
- Recusa com `errcode = '23514'` e mensagem `Guest athlete already belongs to another community`
  quando o atleta não tem conta e existe outra linha ativa dele com `community_id` diferente.
- Vincular de novo à mesma comunidade passa (o `upsert` do sync reescreve a mesma linha).
- `security definer`, `search_path = ''`, revogada de `public, anon, authenticated` (gatilho não
  precisa de `execute` para quem escreve).
- Última definição: conferir que nenhuma migration posterior mexe em `community_players` de modo
  a contornar o gatilho (`grep -ln "community_players" supabase/migrations/*.sql`).
- Sem limpeza de dados: 0 casos em produção. Os 2 convidados sem comunidade ficam como estão.

### 1.3 Testes — `src/test/db/convidadoNumaComunidade.dbtest.ts`

- convidado já em A: vínculo com B é recusado (`23514`);
- atleta com conta em A: vínculo com B passa;
- convidado em A: `upsert` da mesma linha em A passa;
- convidado em A com a linha apagada (`deleted_at`): vínculo com B passa; reativar a linha de A
  depois é recusado;
- convidado em A que ganha conta (vínculo `ACTIVE`): vínculo com B passa.

## Parte 2 — Cliente

### 2.1 A regra no cliente

Função pura em `src/domain/` (ex.: `guestCommunityRule.ts`):
`canGuestJoinCommunity(player, communityId): boolean` — verdadeiro se o atleta tem conta
(`userId`), ou não tem nenhuma outra comunidade ativa em `communityIds`, ou `communityId` já é a
dele. Os casos de uso que dão comunidade a um atleta a consultam, para o modo sem nuvem obedecer à
mesma regra e o sync nunca mandar o que o servidor recusa.

### 2.2 Duplicar comunidade (P8)

- "Duplicar com atletas" vira **"Duplicar comunidade"** em Gestão → Dados
  (`CommunityDataArea.tsx`) e no menu do cartão em Comunidades (`CommunitiesView.tsx`).
- Copia só nome e regras. Saem `applyCommunityMembershipDuplicate` (e testes), o parâmetro
  `includeAthletes` de `onDuplicateCommunity`/`duplicateCommunity` e o ramo que mexia em
  `play.setPlayers` (`communitiesContract.ts`, `communityRoutes.tsx`).
- Quem pode: continua `canExportCommunity` (dono e admin), como hoje.

### 2.3 Convidado rápido no sorteio (P9, P20)

- A busca de duplicado (`findDuplicatePlayerByProfile`, chamada por `applyGuestPlayerUpsert`)
  passa a receber a comunidade e olha **só** os convidados dela (sem `userId`, com `communityIds`
  contendo a comunidade), **incluindo os desativados**.
- Achou um **ativo**: usa ele (comportamento atual).
- Achou um **desativado**: o `GuestPlayerModal` não salva ainda; mostra
  **"<Nome> está desativado nesta comunidade."** com duas ações:
  - **"Reativar e usar"** — só para quem pode editar convidado (`canEditPlayerProfile`, a mesma
    prop `canEditDetails` já passada ao modal): reativa (`ativo: true`, `syncStatus: 'pending'`)
    e o põe na pelada;
  - **"Cadastrar outro"** — cria um convidado novo com os dados digitados.
  - Sem permissão, só "Cadastrar outro", com a linha "Peça a quem administra para reativá-lo."
- Atleta de outra comunidade e atleta com conta nunca são reaproveitados.

### 2.4 Código morto

O intent `updatePlayerCommunities` (`communitiesViewIntents.ts`, `communitiesViewContract.ts`,
`onUpdatePlayerCommunities` em `CommunitiesView`/`communitiesContract.ts`) não tem quem o
dispare. Sai, com `applyPlayerCommunityMemberships` se ficar sem chamador.

### 2.5 Aviso da progressão (P21)

No laço de atletas do `syncService`, a recusa (42501 / `PGRST116`) a um convidado de outra conta
deixa de chamar `onIssue`: o atleta sai `synced` e a nuvem vence, sem aviso. A recusa só acontece
para quem não é dono nem admin — que não edita convidado pela interface —, então é sempre a
progressão local da sessão.

## Testes do cliente

- `canGuestJoinCommunity`: conta, sem comunidade, mesma comunidade, outra comunidade.
- Busca de duplicado: só a comunidade dada; desativado encontrado; outra comunidade e conta nunca.
- `applyGuestPlayerUpsert` / caso de uso de reativação.
- `GuestPlayerModal.spec.tsx`: fluxo "Reativar e usar", "Cadastrar outro", e sem permissão.
- `CommunityDataArea.spec.tsx` e `CommunitiesView.spec.tsx`: "Duplicar comunidade", sem "com
  atletas"; duplicar não altera os atletas.
- `syncService.test.ts`: recusa de convidado alheio sem aviso e `synced`.

## Documentos

- `docs/PERMISSOES.md`: P8, P9, P10, P20 e P21 resolvidas; seção E registra a parte 2a.
- `docs/JORNADA.md`: "Um convidado pode estar em duas comunidades?" (não; gatilho e
  `convidadoNumaComunidade.dbtest.ts`) e "Duplicar leva o elenco?" (não; só nome e regras).
- Spec da avaliação, 1.6: nota de que o gatilho entrou em 2026-09-29 com esta spec.

## Fora desta parte

- Perfil do atleta (carta, carreira, média da comunidade, o que o atleta vê da própria
  avaliação), presença frequente, troca da própria foto (P19) → parte 2b.
- "Só o dono exclui convidado" no servidor (P18) e as pontas P11–P17 → parte 4.
