# Quem organiza — as ações de pelada seguem o servidor

Parte 4a da fatia de permissões (`docs/PERMISSOES.md`, seções A, B e F). As partes 1, 3, 2a e 2b
estão em produção. A parte 4b (o membro lê o histórico da comunidade — P17 — e "só o dono exclui
convidado" no servidor — P18) vem depois desta.

## Por quê

- **A interface decide pelo cargo, o servidor pela responsabilidade** (A1, A2 — P16). No servidor,
  marcar e organizar pelada é `session.manage`, que só a responsabilidade `ORGANIZER` dá
  (`public.community_capabilities`, última definição em
  `20260925130000_avaliacao_da_comunidade.sql`). O gatilho de espelhamento de membros dá
  `ORGANIZER` a dono, admin, moderador e organizador ao assumirem o cargo, e "Deixar organizar"
  (Gestão → Membros, `set_community_organizer`) liga e desliga por pessoa. Em produção, em
  2026-09-29, os 6 donos e o 1 admin têm `ORGANIZER`. Já a interface usa `canCreateSession`
  (`src/domain/communityPermissions.ts`), que vem do cargo: o membro a quem se deu "Deixar
  organizar" não consegue marcar pelada, e o admin ou moderador a quem se tirou a organização vê
  as ações e só é recusado no fim.
- **Ações que aparecem para qualquer pessoa:**
  - P13 — Torneios: "Novo torneio" leva à tela de bloqueio; "abrir ao vivo" põe a sessão como
    ativa sem checagem (`TournamentsModule.tsx`, `sessionRoutes.tsx`).
  - P14 — Painel: "Nova sessão" leva o membro à tela de bloqueio (`globalRoutes.tsx`).
  - P12 — Ligas globais (`/ligas`, `/ligas/nova`, `/ligas/:id`): criar, excluir, abrir a sessão da
    rodada e aprovar/recusar pedidos sem checagem; a mesma área dentro da comunidade exige
    `canEditRules`, que é o que o servidor aceita (`ChampionshipDetailView.tsx`,
    `ChampionshipWizardView.tsx`).
  - P11 — Lixeira "Excluir histórico" sem checagem (`HistoryView.tsx`, `sessionRoutes.tsx`,
    `communityRoutes.tsx`). Hoje é latente (o membro não lê as peladas); vira real com a 4b.
- **P15 — Quem organiza:** o botão "Quem organiza" aparece para o atleta e abre um painel só com o
  título; e `organizadorAtual` é sempre `null` (`RegistrationBoardView.tsx`): o nome de quem
  organiza a pelada não aparece para ninguém, embora exista em `session_organizer_assignments`.

## Decisões tomadas com o usuário (2026-09-29)

1. A parte 4 se divide em 4a (esta) e 4b (P17, P18), e a 4a vem primeiro, para a lixeira do
   histórico estar fechada antes de o membro passar a ler o histórico.
2. As ações de pelada seguem **o servidor** (`session.manage`), não o cargo.
3. Todos veem **quem organiza** a pelada; só quem pode transferir vê o botão de transferir.

## Parte 1 — O sinal "organiza pelada"

- `src/domain/communityPermissions.ts` ganha a função pura
  `canManageSessions(input: { cloud: boolean; capabilities: ReadonlySet<string>; resolved: boolean; roleCanCreateSession: boolean }): { allowed: boolean; pending: boolean }`:
  - `cloud` (comunidade com `cloudId` **e** Supabase configurado): `allowed = capabilities.has('session.manage')`,
    `pending = !resolved`;
  - sem nuvem: `allowed = roleCanCreateSession` (o cargo, como hoje), `pending = false`.
- Um hook `useCanManageSessions(community)` em `src/hooks/` junta `useCommunityCapabilities` e
  `useCommunityPermissions` e devolve esse resultado.
- **Onde substitui `canCreateSession`:** Visão geral ("Marcar pelada", `CommunityOverviewArea`),
  Presença (`CommunityPresenceArea`), Lista de WhatsApp (`CommunityWhatsAppArea`), "Abrir inscrição"
  (`sessionRoutes.tsx`, `canOpen`), `/sessoes/nova` (`sessionCreationAccess.ts`, a tela
  `SessionCreationBlocked`) e o botão de marcar pelada em Comunidades.
- Com `pending`, os botões ficam **desabilitados** (não escondidos) até a resposta chegar.
- `canCreateSession` continua existindo no domínio como o sinal do cargo, usado só pelo modo sem
  nuvem.

## Parte 2 — Cada ponta

### P13 — Torneios
"Novo torneio" e "abrir ao vivo" (`TournamentsModule.tsx`, e a rota que ativa a sessão em
`sessionRoutes.tsx`) só aparecem com `canManageSessions.allowed`. Quem não organiza não vê os dois.

### P14 — Painel
"Nova sessão" (`globalRoutes.tsx`) só aparece se a pessoa organiza em pelo menos uma das
comunidades dela: para cada comunidade com nuvem, a capacidade `session.manage`; sem nuvem, o
cargo. Enquanto responde, o botão não aparece (não é ação crítica do painel).

### P12 — Ligas globais
- `/ligas/:id` (`ChampionshipDetailView.tsx`): "Excluir liga", "Ver sessão da rodada" e
  "Aprovar"/"Recusar" pedidos só com `canEditRules` na comunidade da liga (via
  `useCommunityPermissions` da comunidade da liga).
- `/ligas` e `/ligas/nova` (`ChampionshipWizardView.tsx`): criar liga só lista as comunidades onde
  a pessoa tem `canEditRules`; sem nenhuma, a tela diz "Você não administra nenhuma comunidade
  para criar uma liga." e não mostra o formulário.

### P11 — Lixeira do histórico
"Excluir histórico" (Sessões, detalhe da sessão, Desempenho → Histórico) só aparece com
`canClearHistory` (dono). A regra correspondente no servidor entra na 4b.

### P15 — Quem organiza
- RPC nova `public.get_session_organizer(p_session_id uuid) returns jsonb`
  (`{ "user_id": uuid, "name": text } | null`), `security definer`, `search_path = ''`: devolve o
  organizador da atribuição ativa (`revoked_at is null`, a mais recente) em
  `session_organizer_assignments`, com o nome da ficha da conta (`players.nickname`, senão
  `players.name`) e, sem ficha, `profiles.name`. Lê quem tem vínculo ativo na comunidade da
  sessão (`community_memberships.status = 'active'`); os demais recebem `42501`. `revoke` de
  `public, anon`; `grant execute` a `authenticated`.
- O quadro da inscrição (`RegistrationBoardView`) mostra **"Organiza: \<nome\>"** para todos,
  logo abaixo do cabeçalho; sem organizador, nada.
- O botão "Quem organiza" (transferir) só aparece com `organizerHandover.podeTransferir`; e
  `SessionOrganizerPanel` recebe o organizador atual em `organizadorAtual`.
- Migration nova: `20260929140000_quem_organiza.sql`.

## Testes

- `canManageSessions`: nuvem com e sem `session.manage`; nuvem ainda carregando (`pending`); sem
  nuvem pelo cargo.
- Specs: Visão geral, Presença e WhatsApp desabilitados sem o sinal; "Abrir inscrição" e
  `/sessoes/nova` pelo sinal; Torneios sem "Novo torneio"/"abrir ao vivo" para quem não organiza;
  Painel sem "Nova sessão" para quem não organiza em nenhuma; Ligas sem excluir/aprovar para quem
  não administra, e `/ligas/nova` com a frase; Histórico sem lixeira para quem não é dono; quadro
  com "Organiza: \<nome\>" e sem o botão de transferir para o atleta.
- `src/test/db/quemOrganiza.dbtest.ts`: o membro lê o organizador; quem é de fora recebe `42501`;
  sem atribuição, `null`; atribuição revogada não conta.

## Documentos

- `docs/PERMISSOES.md`: A1, A2, B1, B4, B5, B7, B9 e P11–P16 resolvidas; seção E registra a 4a.
- `docs/JORNADA.md`: quem marca pelada, quem vê quem organiza.

## Fora desta parte

- P17 (o membro lê o histórico: policies de `sessions`, `teams`, `games`…) e a pergunta ainda
  aberta — o membro vê sessões `PRIVATE`? —, e P18 ("só o dono exclui convidado" no servidor) → 4b.
