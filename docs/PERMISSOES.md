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
| B6 | Pessoas | ✅ ~~**Cadastrar**; **Convidado**~~ | **Resolvido em 2026-09-28**: os botões saíram. Pessoas só lista (carta VUT ao tocar); convidado se cadastra e se edita em Gestão → Convidados. | `PlayersView.tsx`, `CommunityGuestsArea.tsx` |
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
| Gestão → Convidados | Só entra na lista de abas e só abre para quem tem `canEditPlayerProfile` (dono/admin); quem não tem é redirecionado. | `communityRoutes.tsx` |
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

Estado em 2026-09-28:

- **Parte 1 — avaliação da comunidade:** ✅ em produção desde 2026-09-27
  ([spec](superpowers/specs/2026-09-25-avaliacao-da-comunidade-design.md)).
- **Parte 3 — ficha do atleta:** ✅ **em produção desde 2026-09-29**
  ([spec](superpowers/specs/2026-09-28-ficha-do-atleta-design.md)). Resumo: a ficha (gênero,
  posição principal, altura, mão dominante) é pedida no cadastro (`/completar-ficha`) e também
  às contas antigas, que ficam presas lá até preencher; ficha de quem tem conta só muda pela
  própria conta (policy de `update` de `players` + RPC `update_my_athlete_profile`); a tela de
  edição de atleta por terceiros saiu inteira; convidado (sem conta) é cadastrado e editado em
  Gestão → Convidados, só por dono/admin; Pessoas passou a só listar, com a carta VUT ao tocar;
  "Minha ficha" mora em `/perfil`, com envio de foto.
- **Parte 2a — convidado numa comunidade só:** feita em código em 2026-09-29
  ([spec](superpowers/specs/2026-09-29-convidado-numa-comunidade-design.md)), aguarda publicação.
  Gatilho `zz_guard_guest_single_community` recusa o segundo vínculo ativo de atleta sem conta;
  o convidado rápido só reaproveita convidado da mesma comunidade e pergunta "Reativar e usar?"
  para um desativado; "Duplicar comunidade" copia só nome e regras.
- **Parte 2b — perfil do atleta, presença frequente, troca da própria foto (P19):** depois da 2a.

## F. Pontas soltas que contradizem as decisões de 2026-09-25 a 2026-09-28

Levantadas em 2026-09-28. Cada uma tem dono; nenhuma depende da conversa em que foi achada.
P1–P7 estão na spec da parte 3, seção "Pontas desta parte".

| #   | Ponta                                                                                                                  | Onde                                                  | Parte |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----- |
| P8  | ✅ ~~"Duplicar com atletas" põe os mesmos atletas sem conta em outra comunidade~~ — resolvida em 2026-09-29: duplicar copia só nome e regras | `applyCommunityMembershipDuplicate`                   | 2     |
| P9  | ✅ ~~O modal de convidado reaproveita um atleta de outra comunidade~~ — resolvida em 2026-09-29: só convidado da mesma comunidade | `GuestPlayerModal`, `findDuplicatePlayerByProfile`    | 2     |
| P10 | ✅ ~~Falta o gatilho "atleta sem conta numa comunidade só"~~ — resolvida em 2026-09-29: gatilho em `community_players` | spec da avaliação, item 1.6                           | 2     |
| P11 | Lixeira "Excluir histórico" sem permissão (B1); vira real quando o membro ler o histórico                                | `HistoryView.tsx`                                     | 4     |
| P12 | Ligas globais: criar, excluir, abrir rodada e aprovar pedido sem permissão (B4)                                          | `ChampionshipDetailView`, `ChampionshipWizardView`    | 4     |
| P13 | Torneios: "Novo torneio" e "abrir ao vivo" sem permissão (B5)                                                            | `TournamentsModule`                                   | 4     |
| P14 | Painel: "Nova sessão" leva o membro a um beco (B7)                                                                       | `globalRoutes.tsx`                                    | 4     |
| P15 | "Quem organiza" vazio para o atleta, e o nome de quem organiza nunca aparece (B9)                                        | `RegistrationBoardView`, `sessionRoutes.tsx`          | 4     |
| P16 | Marcar pelada decidido pelo cargo, não pela responsabilidade `ORGANIZER` (A1, A2)                                        | `canCreateSession` e as telas que o usam              | 4     |
| P17 | Membro ler o histórico da comunidade — decidido "sim" em 2026-09-25 (achado 15 do ROADMAP)                               | policies de `sessions`, `teams`, `games`, …           | 4     |
| P18 | "Só o dono exclui convidado" (decidido em 2026-09-29) vale só no cliente; o servidor ainda aceita a exclusão (soft delete) feita por admin | policy de `players` / `deleted_at`                   | 4     |
| P19 | A troca de foto: `propose_player_avatar` ainda exige ser `owner_id` ou admin — o atleta cuja ficha foi criada pelo organizador não troca a própria foto, e o criador troca a foto de uma conta | `propose_player_avatar`, Minha ficha                  | 2     |
| P20 | ✅ ~~Cadastrar convidado com o perfil de um desativado cria outro registro em vez de oferecer reativar~~ — resolvida em 2026-09-29: o modal pergunta "Reativar e usar?" | `findDuplicatePlayerByProfile` ignora inativos        | 2     |
| P21 | ✅ ~~Quem encerra sessão sem poder editar convidado (moderador, organizador) marca a progressão dos convidados alheios como pendente; o servidor recusa e cada um vira um aviso, a cada sessão, e a mudança fica só naquele aparelho~~ — resolvida em 2026-09-29: a recusa não vira mais aviso | `progression.ts`, `rating.ts`, laço de atletas do `syncService` | 2     |

**Pendente antes do plano da parte 4:** a P17 depende de uma pergunta sem resposta desde
2026-09-25 — o membro deve ver sessões `PRIVATE`? Hoje nada no app publica sessão
(`publish_target_session` não tem chamador), então toda sessão `target` é `PRIVATE`.

## Não verificado

- A tela ao vivo (`sessoes/ativa`) controla por aparelho, não por cargo; a disputa entre dois aparelhos é a pergunta 9.2 da JORNADA.
- Nada aqui foi aberto no navegador com uma conta de cada cargo.
