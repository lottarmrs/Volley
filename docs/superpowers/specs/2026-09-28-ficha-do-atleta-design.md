# Ficha do atleta — quem tem conta cuida da própria ficha

Terceira de três partes decididas em 2026-09-25 (`docs/PERMISSOES.md`, seção E). A parte 1
(avaliação da comunidade, `2026-09-25-avaliacao-da-comunidade-design.md`) está em produção desde
2026-09-27. A parte 2 (perfil do atleta e convidado numa comunidade só) vem depois desta.

## Por quê

- Em produção, em 2026-09-28, as 6 fichas com conta têm **só o nome**: nenhuma tem gênero,
  posição, altura, mão dominante ou apelido. O sorteio autorizado lê gênero, posição, posições
  secundárias, altura e `status.lesionado` da ficha (`capture_balance_input_snapshot`), então
  quem tem conta entra no sorteio sem os dois dados que ele mais usa.
- O servidor deixa o dono e o admin de qualquer comunidade editar a ficha de um atleta com conta
  (`current_user_is_player_admin` na policy de `update`). E quando a ficha foi criada pelo
  organizador antes do vínculo, o próprio atleta não consegue editá-la.
- A única tela que edita atleta (`PlayerEditView`, ~1.400 linhas) mistura seis coisas e está
  aberta, em modo desabilitado, para qualquer cargo.

## Decisões tomadas com o usuário

1. A ficha é pedida **no cadastro da conta**, logo depois do nome de usuário.
2. **Obrigatórios:** gênero, posição principal, altura e mão dominante. **Opcionais:** apelido e
   posições secundárias.
3. **Contas que já existem** caem na mesma tela no próximo acesso, se faltar algum obrigatório.
4. **Nenhuma brecha:** ninguém além da própria conta altera a ficha de um atleta com conta — nem
   tela, nem rota, nem sync. A comunidade só o **avalia**, pela área de Avaliação.
5. **"Lesionado" e "limitação física"** vão para "Minha ficha"; **"presença frequente"** fica para
   a parte 2.
6. **A tela de edição de atleta sai inteira.** Fica só a edição de **convidado** (atleta sem
   conta), numa aba **Gestão → Convidados**, para dono e admin. Pessoas vira lista só de leitura;
   tocar num atleta abre a carta VUT.
7. **Sem nuvem**, o formulário de convidado tem **nível de 1 a 5**, que o sorteio local usa.
8. **Todas as pontas soltas** que contradizem as decisões desta sessão entram num plano. As desta
   parte estão na seção "Pontas desta parte"; as outras estão em `docs/PERMISSOES.md`.

## Parte 1 — Servidor

Uma migration, `20260928120000_ficha_do_atleta.sql`, com teste escrito antes. Toda função
redefinida parte da **última** definição e repete `security definer` e `search_path`.

### 1.1 Ficha completa

`app_private.athlete_profile_complete(p_player_id uuid) returns boolean`, `stable`,
`security definer`, `search_path = ''`, sem execução para ninguém de fora: verdadeiro quando a
ficha tem `gender`, `primary_position`, `height` e `dominant_hand` preenchidos. É a única
definição de "completa"; o estado da conta e a RPC a usam.

### 1.2 O estado da conta

`public.ensure_account_ready` — última definição em
`20260726110000_mandatory_mfa_and_aal2_enforcement.sql`. Onde hoje devolve `'ready'`, devolve
`'needs_athlete_profile'` quando `athlete_profile_complete(v_player.id)` é falso. A ordem fica:
nome de usuário → ficha → (MFA, decidido no cliente pelo `requires_aal2`, como hoje). O resto da
função não muda.

### 1.3 Gravar a própria ficha

`public.update_my_athlete_profile(p_gender text, p_primary_position text, p_height_cm numeric,
p_dominant_hand text, p_nickname text, p_secondary_positions text[], p_injured boolean,
p_physical_limitation text) returns text`, `security definer`, `search_path = ''`, executável só
por `authenticated`:

- grava na ficha **da conta que chama** (`players.user_id = auth.uid()` e `deleted_at is null`);
  não recebe id de ficha;
- recusa com `23514`: gênero fora de `M`/`F`; posição principal fora de `levantador`, `oposto`,
  `ponteiro`, `central`, `libero`, `all-rounder`; altura fora de 120 a 230; mão fora de
  `direita`/`esquerda`; qualquer um dos quatro nulo; posição secundária fora da lista, repetida ou
  igual à principal. Cada recusa tem mensagem própria, para o cliente apontar o campo;
- apelido e limitação física em branco viram `null`;
- `p_injured` e `p_physical_limitation` são gravados em `status` (`lesionado`,
  `limitacaoFisica`), preservando `presencaFrequente`; quando vêm nulos, preservam o valor atual
  — é assim que o cadastro, que não pergunta a condição física, não apaga uma lesão já marcada;
- sem ficha para a conta: `P0002`;
- devolve o novo estado da conta (`'ready'` ou `'needs_athlete_profile'`), pela mesma regra de 1.2.

### 1.4 Ninguém além da conta altera ficha com conta

Policy de `update` em `public.players` redefinida: "Player admins can update players" dá lugar a
duas regras somadas.

- **Ficha com conta** (`user_id` preenchido ou vínculo `ACTIVE` em `player_account_links`): só
  quando `public.player_is_linked_to_current_user(id)`. Vale para `using` e `with check`.
- **Ficha sem conta:** a regra de hoje (`owner_id = auth.uid()` ou
  `current_user_is_player_admin(id)`).

As funções `security definer` que escrevem em `players` (`handle_new_user`,
`ensure_account_ready`, `enroll_approved_member`, `propose_player_avatar`,
`approve_player_avatar`, `reset_product_data`) não passam pela policy e não mudam. Os gatilhos de
guarda (`guard_player_account_identity_delete`, `…_history`, `guard_player_user_id`,
`guard_avatar_url`) continuam valendo.

### Testes — `src/test/db/fichaDoAtleta.dbtest.ts`

- conta sem os quatro obrigatórios → `needs_athlete_profile`; com eles → `ready`; sem nome de
  usuário → `needs_username` antes de tudo;
- cada recusa da RPC, com sua mensagem; apelido em branco vira `null`; `presencaFrequente` é
  preservada;
- a RPC nunca grava em outra ficha;
- dono e admin de uma comunidade do atleta **não alteram nenhuma coluna** de uma ficha com conta
  pelo `update` direto — nem gênero, nem `status`, nem `active`;
- o atleta altera a própria ficha pelo `update` direto, inclusive quando o `owner_id` é o
  organizador (ficha vinculada depois);
- ficha sem conta continua editável por dono e admin, e pelo `owner_id`.

Antes de escrever, ler as suítes que contam com dono ou admin editando ficha com conta
(`grep -rln "update public.players" src/test/db`) e dizer no commit qual assertiva muda.

## Parte 2 — Cliente

### 2.1 A etapa da ficha no cadastro

- `AccountReadiness` ganha `'needs_athlete_profile'`.
- `resolveAuthSessionState` (`src/application/authSession.ts`) ganha o estado
  `{ kind: 'athlete_profile'; userId; account }`, depois de `onboarding` e antes das checagens de
  MFA.
- `routeForAuthState` leva esse estado para `/completar-ficha`, que entra em
  `AUTH_ONLY_PATH_PREFIXES`. O destino guardado atravessa a etapa por
  `resolveTransitionDestination`, como já atravessa as outras.
- Uma versão antiga do app, que não conhece o estado novo, trata-o como pronto: a migration pode
  ir antes do app sem quebrar ninguém.

### 2.2 Um formulário só — `AthleteProfileForm`

- Obrigatórios: gênero, posição principal, altura (cm), mão dominante. Opcionais: apelido,
  posições secundárias.
- **Condição física** (lesionado, limitação física): em "Minha ficha" e em Convidados, não no
  cadastro.
- **Nível (1 a 5):** só na edição de convidado, e só **sem nuvem** — a comunidade não tem
  `cloudId`, ou o app roda sem Supabase configurado. Com nuvem, as notas vêm da Avaliação.
- Validação local espelhando 1.3, e o erro do servidor apontado no campo.
- A forma de cada campo sai do `/impeccable shape`, antes do componente.

### 2.3 `/completar-ficha`

O formulário com "Continuar", sem condição física, e a frase "É com isso que o sorteio monta
times equilibrados." Ao salvar, a sessão recebe o estado devolvido pela RPC e segue para o
destino guardado. Sem conexão: "Precisamos de conexão para salvar sua ficha.", mantendo o que foi
preenchido.

### 2.4 "Minha ficha" em `/perfil`

O formulário em modo de edição, gravando pela RPC. `/perfil` mostra só a ficha **da conta**
(`player.userId === auth.user.id`); sem ela no aparelho, a lê da nuvem. Nunca mais
`play.players[0]`.

> **Emenda — 2026-09-28.** "Minha ficha" (`MyAthleteProfile.tsx`) também monta o `AvatarUpload`
> acima do `AthleteProfileForm`, com `playerCloudId`/`currentAvatarUrl` da própria ficha — a foto
> passa a se editar no mesmo lugar que o resto dos dados do atleta, em vez de um fluxo à parte.

### 2.5 Gestão → Convidados

Rota `/comunidades/:id/gestao/convidados`, aba ao lado de Membros, Regras e Dados, visível e
acessível para quem tem `canEditPlayerProfile` (dono e admin; no modo sem conta, todo mundo):

- lista dos atletas **sem conta** da comunidade, com "Cadastrar convidado";
- cadastrar e editar pelo `AthleteProfileForm` (com nível quando sem nuvem);
- "Excluir" sem histórico, "Desativar" com histórico, como a tela atual decide.

**Nível sem nuvem.** Salvar um nível grava `atributos = buildLevelAttributes(nivel)` — só quando
o nível mudou, para não apagar a progressão. Ao abrir, o nível mostrado é a média dos atributos
dividida por 2, arredondada e limitada a 1–5.

### 2.6 A tela de edição de atleta sai

- Removidos: `PlayerEditView`, `PlayerEditRoute`, a rota `pessoas/editar-atleta/:playerId`,
  `paths.atleta`, `NEW_PLAYER_ID`, `resolvePlayerRoute`/`resolvePlayerEditAction`, o título
  "Perfil do Atleta", a página legada `'player-edit'` em `pathForLegacyPage` (passa a levar a
  Pessoas), e o contrato `playerEditView`.
- Um link antigo `…/pessoas/editar-atleta/…` cai em Pessoas.
- **Pessoas** vira lista só de leitura para todos: tocar em qualquer atleta abre a carta VUT
  (`FutCardModal`). "Cadastrar" e "Convidado" saem de Pessoas.
- `CommunitySkillProfilePanel` fica no código, sem montagem, até o perfil do atleta da parte 2.

## Pontas desta parte

| # | Ponta | Correção |
|---|---|---|
| P1 | Dono e admin editam ficha com conta no servidor | 1.4 |
| P2 | Criar atleta inventa gênero, posição e mão (`localPlayerUseCases.createPlayerForCommunity`, `usePlayers.handleAddPlayer`) | todo cadastro passa pelo `AthleteProfileForm`, que exige os quatro; os valores inventados saem |
| P3 | `/perfil` mostra a ficha de outra pessoa (`players[0]`) | 2.4 |
| P4 | "Editar detalhes" do convidado (`AppShell.applyGuestPlayer`) abre a tela que sai, a partir de Pessoas, do wizard e do sorteio | passa a levar à edição daquele convidado em Gestão → Convidados; sem permissão, a opção não aparece |
| P5 | Progressão e avaliação antiga (`progression.ts`, `playerEvaluations.ts`) reescrevem `atributos` de atleta com conta, que o sync tentaria subir | as duas pulam fichas com conta; o sync nunca sobe ficha com conta que não seja a da própria pessoa |
| P6 | Autoavaliação antiga fica sem tela | descontinuada: saem `selfEvaluationUseCases`, `selfEvaluationCloudService` e o `selfEvaluation` do tipo `Player`; a tabela `self_evaluations` fica no banco, sem escrita; o `currentStateLedger` e seu documento são atualizados |
| P7 | `canEvaluatePlayer` pelo cargo, com comentário citando RLS antiga, e o caminho de avaliação legado em `usePlayers.handleSavePlayer` | saem junto com a tela; avaliar é só pela área de Avaliação |

E as travas no cliente, para não sobrar caminho que só o servidor pararia: `usePlayers` recusa
salvar ou excluir ficha com conta que não seja a da própria pessoa.

### Testes do cliente

- unitários: a máquina de estados com `athlete_profile`; a validação do formulário; a conversão
  nível ↔ atributos; a recusa em `usePlayers`; o sync e a progressão pulando fichas de outros
  atletas com conta;
- UI (`.spec.tsx`): `/completar-ficha` em cada estado e com o destino preservado; "Minha ficha"
  só com a ficha da conta; Convidados (lista, cadastrar, editar, excluir/desativar, nível só sem
  nuvem, invisível para moderador e membro); Pessoas só leitura com a carta VUT; link antigo de
  edição caindo em Pessoas; "editar detalhes" levando a Convidados;
- o `currentStateLedger.test.ts` passa com as entradas atualizadas;
- bancada em `preview/`: o formulário nos três contextos e a aba Convidados.

## Publicação

1. Migration e app **no mesmo dia, com minutos de diferença**, e só com o ok do usuário. A
   migration sozinha é segura para quem só usa o app; no intervalo, um organizador com o app
   antigo que editar um atleta com conta teria a gravação recusada no sync.
2. Conferir por leitura: as 6 contas passam a responder `needs_athlete_profile`; a policy nova de
   `update`; os atributos das funções; advisors de segurança sem categoria nova.
3. Efeito esperado: no primeiro acesso depois do deploy, cada uma das 6 contas cai em
   `/completar-ficha`.

## Documentos, no mesmo commit

- `docs/JORNADA.md`: a Etapa 1 (criar conta) ganha as perguntas da ficha; a pergunta aberta sobre
  a autoavaliação é fechada como descontinuada.
- `docs/PERMISSOES.md`: a seção E registra partes 1 e 3 feitas e o que sobra para a parte 2.
- `2026-09-25-avaliacao-da-comunidade-design.md`: nota de que o link "Avaliar atleta" saiu com a
  tela de edição; a entrada é só pela área de Avaliação.

## Fora desta parte

- Perfil do atleta (a carta melhorada), gráficos de carreira, média da comunidade no perfil,
  "presença frequente" → parte 2.
- Gatilho "sem conta numa comunidade só", "duplicar com atletas" e o modal de convidado que
  reaproveita atleta de outra comunidade (P8–P10) → parte 2.
- Pontas de permissão P11–P17 → parte 4, em `docs/PERMISSOES.md`.
