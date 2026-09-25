# Quem vê qual ação — varredura de permissões na interface

> Levantado em **2026-09-25**, lendo o código de todas as rotas de `AppRouter.tsx`.
> Não foi aberto no navegador: cada resposta cita `arquivo:linha`, e o que não
> foi verificado está marcado ❓.
>
> Pergunta de cada tela: **uma ação de quem organiza ou administra aparece para
> quem não deveria?** E o inverso: **some para quem deveria vê-la?**

---

## A régua: três fontes que não concordam

| Fonte | Onde | Quem pode marcar pelada |
|---|---|---|
| **Cliente** | `deriveCommunityPermissions` (`src/domain/communityPermissions.ts`) lê só o cargo legado de `community_members` | owner, admin, moderator, organizador |
| **Servidor, modelo novo** | `community_capabilities` (última definição em `20260905185744_versioned_player_evaluation_source.sql`) | quem tem a responsabilidade `ORGANIZER` → `session.manage` |
| **Servidor, RLS legada** | policies de `sessions`, `teams`, `games`… em `20260610161203_backend_operational_sync.sql` | owner, admin, moderator (o padrão de `current_user_has_community_role`) |

O cliente **nunca consulta responsabilidades**: nem `useCommunityPermissions` nem
`useCommunityMembers` leem `ORGANIZER` ou `EVALUATOR`.

---

## A. O cliente decide pelo cargo, o servidor pela responsabilidade

| # | Pergunta | Resposta |
|---|---|---|
| A1 | Um `member` a quem se deu "Deixar organizar" consegue marcar pelada? | 🔴 **Não, pela interface.** O servidor dá `session.manage`, mas `canCreateSession` é falso para `member`: "Marcar pelada" fica desabilitado, `/sessoes/nova` cai em `SessionCreationBlocked`, e "Abrir inscrição" some (`canOpen`, `sessionRoutes.tsx:219`). O próprio painel promete o contrário: "a pessoa passa a poder criar peladas novas". |
| A2 | Um admin ou moderador **sem** a responsabilidade vê ações de quem organiza? | 🔴 **Sim.** Marcar pelada (Visão geral, Comunidades), Presença, Lista de WhatsApp e "Abrir inscrição" aparecem habilitados; o servidor recusa na hora de abrir a lista. |
| A3 | Quem vê "Avaliar atleta"? | ✅ **Resolvido em 2026-09-25.** Dono e admin avaliam pelo cargo, e quem administra designa outros avaliadores (`EVALUATOR`) em Gestão → Membros. A área Avaliação pergunta ao servidor (`useCommunityCapabilities` → `current_user_has_community_capability`), não ao cargo. Spec `2026-09-25-avaliacao-da-comunidade-design.md`. |
| A4 | O cargo legado `organizador` ainda aparece? | Não é mais atribuível (`ASSIGNABLE_COMMUNITY_MEMBER_ROLES`), mas quem já o tem continua com `canCreateSession`. |

---

## B. Ações que aparecem para qualquer pessoa

| # | Tela · rota | Ação | O que acontece | Evidência |
|---|---|---|---|---|
| B1 | Sessões `sessoes`, detalhe `sessoes/:id`, Desempenho → Histórico | 🔴 **Lixeira "Excluir histórico"** | Nenhuma checagem. Hoje é latente, porque o atleta não recebe peladas; passa a valer assim que a leitura for liberada (achado 15). | `HistoryView.tsx:634`, `sessionRoutes.tsx:148`, `communityRoutes.tsx:474` |
| B2 | Gestão → Dados; menu do cartão em Comunidades | ✅ ~~**Duplicar comunidade (com atletas)**~~ | **Corrigido em 2026-09-25**: só owner/admin (`canExportCommunity`), porque copiar o elenco é exportá-lo. | `CommunityDataArea.tsx:122`, `CommunitiesView.tsx:475` |
| B3 | Idem | ✅ ~~**Exportar comunidade**~~ | **Decidido e corrigido em 2026-09-25**: membro não exporta; só owner/admin. Spec em `CommunityDataArea.spec.tsx`. | `CommunityDataArea.tsx:129`, `CommunitiesView.tsx:492` |
| B4 | Ligas globais `/ligas`, `/ligas/nova`, `/ligas/:id` | 🔴 **Criar liga, Excluir liga, Ver sessão da rodada, Aprovar/Recusar pedidos** | Nenhuma checagem. O servidor só aceita owner/admin, e a **mesma** área dentro da comunidade exige `canEditRules`. Duas portas para a mesma ação, uma trancada e outra aberta. | `ChampionshipDetailView.tsx:228,449,675,682`, `ChampionshipWizardView.tsx:227` |
| B5 | Sessões → Torneios | ⚠️ **Novo torneio**; **abrir torneio ao vivo** | "Novo torneio" leva à tela de bloqueio. "Abrir ao vivo" põe a sessão como ativa sem checagem: latente, como B1. | `TournamentsModule.tsx:33,85`, `sessionRoutes.tsx:405` |
| B6 | Pessoas | ⚠️ **Cadastrar**; **Convidado** | "Cadastrar" aparece e só falha no salvar, com `PERMISSION_DENIED`. "Convidado" não confere nada e grava o atleta no aparelho. | `PlayersView.tsx:86,93`, `AppShell.tsx:587` |
| B7 | Painel | ⚠️ **Nova sessão** | Aparece para todos e leva o `member` à tela de bloqueio. | `globalRoutes.tsx:80` |
| B8 | Menu → Gestão | ✅ ~~**A área inteira**~~ | **Decidido e corrigido em 2026-09-25**: Gestão é de owner, admin e moderador (que aprova pedidos de entrada lá), por `canSeeManagement`, no menu e na rota. "Sair da comunidade" foi para o pé da Visão geral para quem não vê Gestão. | `appRoutes.ts:127`, `appRoutes.ts:395` |
| B9 | Quadro da inscrição | ⚠️ **"Quem organiza"** | O botão aparece para o atleta e abre um painel só com título. E `organizadorAtual` é sempre `null`: o nome de quem organiza não aparece **para ninguém**. | `RegistrationBoardView.tsx:441,455` |

---

## C. O que está certo

| Tela | Por quê |
|---|---|
| Plataforma `/plataforma` | Rota exige `isStaff`; ações de master exigem `isMaster`. |
| Gestão → Membros | Convite, pedidos, cargo, remoção e organização gateados por `canManage`/`canApprove`, com o dono protegido. |
| Gestão → Regras | Todos os campos e o salvar desabilitados sem `canEditRules`. |
| Editar atleta | Campos, salvar, reverter e excluir gateados; o salvar confere de novo em `usePlayers.ts`. |
| Quadro da inscrição (barra do organizador) | Tudo depende de `board.viewerCanManage`, **que vem do servidor**. É o modelo a seguir. |
| Sortear `sessoes/:id/sortear` | O portão é do servidor ("Só quem organiza sorteia"). |
| Ligas dentro da comunidade | Gateadas por `canEditRules`, coerente com o servidor. |

---

## D. Decisões de produto que a varredura levantou

Todas decididas em 2026-09-25.

1. **Admin não mexe em admin.** Só o dono dá, tira ou toca no cargo de admin: um admin
   não rebaixa, não remove, não promove a admin e não liga nem desliga a organização de
   outro admin. Servidor em `20260925120000_admin_nao_mexe_em_admin.sql`, provado em
   `adminNaoMexeEmAdmin.dbtest.ts`; o painel esconde os controles e a opção de admin.
2. **Membro não exporta** a comunidade (B3).
3. **Membro não vê a área Gestão** (B8).

## E. Próxima fatia: o atleta não edita atleta

Decidido em 2026-09-25, ainda não feito:

- Em **Pessoas**, tocar num atleta abre hoje a tela de **edição** (nome, posição,
  fundamentos), para qualquer cargo. Isso sai: tocar num atleta abre o **perfil do
  atleta**, no espírito da carta VUT de hoje.
- **Não existe edição de atleta** por terceiros; no máximo, edição de **convidado**.
- Os dados do atleta são pedidos **a ele**, ao criar o próprio perfil.
- A comunidade ganha uma **área própria para quem administra avaliar os membros por
  fundamento** — e só isso.

## Não verificado

- A tela ao vivo (`sessoes/ativa`) controla por aparelho, não por cargo; a disputa entre dois aparelhos é a pergunta 9.2 da JORNADA.
- Nada aqui foi aberto no navegador com uma conta de cada cargo.
