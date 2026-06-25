# HANDOFF — Sincronização, Gestão (RBAC) e Comunidade v2

> Documento de continuidade. Última atualização: 2026-06-24.
> Objetivo: permitir retomar o trabalho do zero (outra sessão ou outra pessoa)
> sem perder contexto. Leia a seção **⚠️ ISSUES ABERTOS** antes de seguir.

---

## 0. Visão geral do que foi feito nesta leva

Três grandes blocos, todos sobre o mesmo app (`panelinha-team-balancer`, React + Vite +
Supabase):

1. **Robustez do sync** (enviar/baixar/mesclar) — Fase 1 de correções.
2. **Limpeza de dados corrompidos na nuvem** (duplicatas da migração de UUID).
3. **Comunidade v2** — redefinição do modelo + Área de Membros + sistema de entrada.

O projeto: `id` locais agora são **UUID nativos** e, para a maioria das entidades,
`id === cloudId === local_id`. O sync casa por `(owner_id, local_id)`.

---

## 1. ⚠️ PRODUÇÃO — migrations já aplicadas no Supabase

Projeto Supabase: **`csoslatxjjazrtrtylke`** ("Volley PROJECT", sa-east-1).
Todas as migrations abaixo **já foram aplicadas no remoto** via MCP e os arquivos
locais foram renomeados para as versões reais registradas (histórico reconciliado;
`supabase migration list` deve bater 1:1).

Migrations relevantes desta leva (em ordem):
- `20260624133117_player_avatars_approval`
- `20260624133200_player_evaluations`
- `20260624133252_link_user_to_player_with_approval`
- `20260624133328_unlink_player_rpc`
- `20260624133529_rbac_global_roles_and_hardening` — papéis globais master/programmer/user
- `20260624134502_harden_trigger_functions`
- `20260624141708_role_management_rpc` — RPC `set_user_role` + trava de `profiles.role`
- `20260624203424_community_model_v2` — **Comunidade v2 (Fase A)**
- `20260624204113_community_join_system` — **Sistema de entrada (Fase C backend)**

> IMPORTANTE: ao rodar `supabase db push` localmente, **nada novo deve ser aplicado**
> (tudo já está no remoto). Se acusar divergência, rode `supabase migration list --linked`
> e, se preciso, `supabase migration repair --status applied <versão>`.

### Conta master
`lottarmrs@gmail.com` foi promovido a `master` (via UPDATE direto, antes da trava).
A coluna `profiles.role` agora é travada por trigger: só muda via RPC `set_user_role`
(master-only). Para mexer manualmente em SQL é preciso `set session_replication_role = replica`.

---

## 2. Limpeza de dados na nuvem (já executada)

A migração de UUID (commit `a57ae86`) trocou os `local_id` de `player-…`/`community-…`
para UUIDs novos. Como o upsert casa por `(owner_id, local_id)`, cada sync **inseriu
duplicatas** em vez de atualizar. A nuvem chegou a: players 289 (real 91), communities
16 (real 4), point_events 1100 (real 550), evaluations 337.

**Ação tomada (autorizada pelo usuário):**
1. Snapshot de segurança das tabelas exclusivas da nuvem em
   `C:\Users\Matheus Silva\Downloads\panelinha_cloud_snapshot_2026-06-24.json`.
2. **Limpeza total dos dados da conta** `lottarmrs` na nuvem (DELETE escopado a
   `owner_id`, com `session_replication_role=replica` para contornar triggers).
   Verificado: tudo zerado. **Profiles/papéis preservados.**
3. Fonte da verdade para reseed: backup local do navegador
   `C:\Users\Matheus Silva\Downloads\panelinha_backup_2026-06-24.json` (91 atletas,
   4 comunidades, íntegro).

### ⚠️ PENDENTE: reseed ainda NÃO foi feito
O usuário precisa, no app, **Importar Backup** (o JSON acima) e depois **Sincronizar**
(NÃO "Baixar da nuvem" — isso apagaria o local com a nuvem vazia). Com os fixes do sync,
o upload recria tudo sem duplicar e syncs futuros passam a *atualizar* no lugar.
- 1 vínculo a refazer: o atleta `0f2b679a-680e-486a-871e-e8d2c6052bff` estava ligado à
  conta do dono; o `user_id` não volta pelo sync (precisa religar pelo app).

---

## 3. Modelo de Comunidade v2 (decisões do usuário)

- **Entrada:** link/código de convite **+** pedido de entrada com aprovação (privada).
- **Papéis (renomeados):** `owner` (Dono) → `admin` (Admin) → `moderator` (Moderador)
  → `member` (Membro). Staff = owner/admin/moderator. `member` é participante (atleta/usuário),
  **sem ações de gestão**.
- **Membro ↔ atleta:** unificar via `player.userId` (a Área de Membros casa membro↔ficha).

### Backend (aplicado)
`community_model_v2`:
- `community_members.role` check → `owner/admin/moderator/member` (migrou `organizer`→`moderator`).
- `community_members` ganhou `status` (active/pending/invited/rejected) e `invited_by`.
- `communities` ganhou `visibility` (private/public) e `join_code` (unique).
- Helpers `current_user_has_community_role` / `current_user_can_access_player` /
  `current_user_is_player_admin` recriados: novos nomes + **só contam membros `active`**.
- `add_community_member_by_email` aceita os 4 papéis e marca `status='active'`.

`community_join_system`:
- Política RLS: "Users can read their own membership" (membro pending lê a própria linha).
- RPCs (todas SECURITY DEFINER, authenticated):
  - `generate_join_code(community_id)` / `disable_join_code(community_id)` — dono/admin.
  - `find_community_by_code(code)` — preview (id, name, description, member_count, my_status).
  - `request_to_join_community(code)` — cria filiação `pending` (re-pedido reativa de `rejected`).
  - `approve_join_request(member_id)` / `reject_join_request(member_id)` — dono/admin.
  - `leave_community(community_id)` — sai (owner não pode sair).

### Frontend (no working tree, ver seção 4)
- `types.ts`: `CommunityMemberRole` (4 papéis), `CommunityMemberStatus`, `CommunityMember.status/invitedBy`,
  `Community.visibility/joinCode`.
- `useCommunityPermissions`: `moderator` = nível organizador; `member` = sem gestão; só conta filiação ativa.
- `useCommunityMembers`: expõe `activeMembers`, `pendingRequests`, `approveRequest`, `rejectRequest`,
  `generateJoinCode`, `disableJoinCode`, `leave`.
- `membershipCloudService`: métodos das RPCs acima; lê `status`/`invited_by`; default role `moderator`.
- `CommunityMembersPanel` (reescrito = **Área de Membros**): código de convite (gerar/copiar/desativar),
  fila de pedidos pendentes (aprovar/rejeitar), convite por e-mail, diretório com avatar/papel/status,
  "Sair da comunidade". (O usuário começou a Fase D aqui: prop `players` + `athleteByUserId`.)
- `JoinCommunityByCode.tsx` (novo): modal "Entrar com código" (preview + pedir). Ligado na
  `CommunitiesView` (botão ao lado de "Nova").

---

## 4. Mudanças no working tree (a commitar)

```
M src/components/community/CommunitiesView.tsx     # botão "Entrar com código" + modal
M src/components/community/CommunityMembersPanel.tsx# Área de Membros (reescrita) + início Fase D
A src/components/community/JoinCommunityByCode.tsx  # modal entrar por código
M src/hooks/useCloudSync.ts                         # Fase 1: trava reentrância + report falhas parciais
M src/hooks/useCommunityMembers.ts                  # ações de entrada + active/pending
M src/hooks/useCommunityPermissions.ts             # papéis novos + status active
M src/services/supabase/communityCloudService.ts   # mapDbToCommunity lê visibility/joinCode
M src/services/supabase/mappers.test.ts            # testes ajustados (moderator/status) + regressões
M src/services/supabase/membershipCloudService.ts  # RPCs de entrada + status
M src/services/supabase/playerCloudService.ts      # Fase 1 I1: metadata?.atualizadoEm
M src/services/supabase/syncService.test.ts        # regressões computeStaleRelationIds
M src/services/supabase/syncService.ts             # Fase 1: C1/C3 (reconcile só no syncNow, isolar falhas)
M src/types.ts                                      # tipos comunidade v2
A supabase/migrations/20260624203424_community_model_v2.sql
A supabase/migrations/20260624204113_community_join_system.sql
```

Estado de verificação no commit: **typecheck OK, build OK, 109 testes unit + 24 UI verdes.**

### Fase 1 do sync (detalhe — já no working tree)
- **C1**: reconciliação de `community_players` órfãos só roda no `syncNow` (flag
  `reconcileRelations`), nunca no `uploadToCloud` puro; e só apaga vínculos de players
  presentes no payload (`computeStaleRelationIds`, com teste). Evita apagar vínculos válidos.
- **C3**: cada item do upload em `try/catch` com `onIssue` — uma falha não aborta tudo; o
  que deu certo é aplicado; toast resume "concluído com N falha(s)".
- **I1**: `playerCloudService.mapPlayerToDb` usa `metadata?.atualizadoEm` (não quebra sem metadata).
- **I5**: `useCloudSync` com trava de reentrância (`inFlight` ref) — auto-sync + clique manual
  não rodam concorrentes.
- Bônus: `downloadFromCloud` passa `ownerId` (agregação de avaliações com dono).

---

## 5. ⚠️ ISSUES ABERTOS (prioridade)

### 5.1 🔴 React "change in order of Hooks" no `App` (ENCONTRADO, NÃO RESOLVIDO)
No preview (dados reais, sync ativo), o console mostra, **após reload limpo**:
`React has detected a change in the order of Hooks called by App`.
Divergência no **hook #116**: render anterior `useState`, próximo `useCallback`.
- Significa um hook chamado **condicionalmente** em algum hook custom que o `App` chama
  (a lista de 116 é o App + todos os custom hooks achatados).
- Minhas adições (useRef no `useCloudSync`, useCallbacks no `useCommunityMembers`) são
  **incondicionais** → não causam variância por si. Suspeita: hook condicional pré-existente
  exposto pelo deslocamento de posições, OU um custom hook que muda contagem entre renders.
- **Como depurar:** rodar dev, reproduzir, e no React DevTools/erro pegar o *component stack*
  completo. Conferir cada custom hook chamado pelo `App` (`useSessions`, `usePlayers`,
  `useSessionWizard`, `useCommunityPermissions`→`useAuth`/`useCommunityMembers`,
  `usePlayerLinkProposals`, `useCloudSync`) procurando: hook após `return` antecipado, hook
  dentro de `if/&&/?:/.map`, ou contagem de hooks dependente de props/estado. O cluster
  ~#108–116 (3×useState, useCallback, useEffect, vários useCallback) **bate com
  `useCommunityMembers`** — começar por ele e por `useCommunityPermissions`.
- Impacto: pode causar bugs/crash de render. **Tratar antes de confiar na UI nova.**

### 5.2 🟠 Sync de propostas de vínculo falhando (I2)
Console mostra repetidos `[sync] falha em proposta de vínculo`. É o **I2** do plano de sync:
`playerLinkProposalCloudService.upsert` recebe propostas com `id` temporário (`proposal-…`)
e tenta enviá-lo como `uuid` → erro. O C3 **isola** (não aborta), mas o vínculo não sincroniza.
- **Fix (Fase 2 do plano de sync):** no upload, para propostas com id não-uuid usar a RPC
  `propose_player_link` (ou omitir o `id` no mapper, como foi feito em `player_evaluations`),
  e mapear o id retornado. Mesma classe do bug de evaluations já corrigido.

### 5.3 🟡 Reseed da nuvem pendente (ver seção 2)
O usuário precisa Importar Backup + Sincronizar no app.

---

## 6. Fases pendentes da Comunidade v2

### Fase D — Membro ↔ Atleta (iniciada)
- Já há `players` + `athleteByUserId` no `CommunityMembersPanel`. Falta: mostrar a ficha do
  atleta vinculada a cada membro (avatar/posição/stats) e o card "minha ficha" do usuário logado;
  permitir reivindicar/vincular ali (reusa `usePlayerLinkProposals` / RPC `propose_player_link`).
- Passar `players={community players}` ao `CommunityMembersPanel` na `CommunitiesView`
  (hoje o default é `[]`).

### Fase E — Visibilidade / descoberta + notificações
- `communities.visibility` já existe. Falta: comunidades públicas numa busca/descoberta;
  badge de pendências (nº de pedidos) na aba Membros; (opcional) notificações.
- Considerar a visibilidade cross-owner: um `member` de comunidade de outro dono precisa
  **ver** a comunidade no app dele. RLS de `communities` já permite leitura por membro ativo
  (`owner_id = auth.uid() OR current_user_has_community_role(id)`), mas o app trata comunidades
  como owner-scoped no modelo local — validar download/render de comunidade não-própria e
  garantir que o upload NÃO tente alterá-la (o C3 já isola erros de RLS).

---

## 7. Como verificar / continuar

```bash
npm run typecheck        # tsc --noEmit
npm run test:unit        # node --test (lógica + mappers + sync)
npm run test:ui          # vitest
npm run build            # vite build
npm run dev              # dev server :3000  (preview)
```

- Verificação ao vivo precisa de login (Supabase) como `master`. Roteiro:
  1. Importar backup + Sincronizar (resolve duplicatas e o prompt de "vincular comunidade").
  2. Comunidade → aba Membros: gerar código, copiar; em outra conta usar "Entrar com código";
     voltar ao dono e aprovar o pedido.
  3. Conferir papéis (Dono/Admin/Moderador/Membro) e "Sair da comunidade".

- Supabase via MCP: `list_migrations`, `execute_sql`, `get_advisors` (rodar advisors após DDL).

---

## 8. Ordem de retomada sugerida

1. **Resolver 5.1 (hooks order)** — bloqueante de confiança na UI.
2. **5.2 (I2 propostas)** — parar o ruído de erro no sync.
3. **Reseed (2)** — orientar/validar o Importar+Sincronizar do usuário.
4. **Fase D** (membro↔atleta) → **Fase E** (visibilidade/descoberta).
5. Rodar `get_advisors security` e `performance` no Supabase após tudo.
