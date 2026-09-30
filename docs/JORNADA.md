# A jornada, etapa por etapa — banco de perguntas

> Levantado em **2026-09-24**. Este documento não é um mapa: é a **lista de
> perguntas** que precisa estar respondida antes de cada etapa ser considerada
> pronta. Cada resposta traz evidência — um teste, um `arquivo:linha` — ou está
> marcada ❓ **aberta**.
>
> Regra de uso: **não se avança de etapa com pergunta vermelha em aberto.**
>
> As simulações que atravessam tudo: **A.** pessoa nova sem conta · **B.** quem
> cria a própria comunidade · **C.** quem foi convidada por link · **D.**
> internet caindo · **E.** segunda pessoa, outro aparelho.
>
> Simulado contra PostgreSQL de verdade em `src/test/db/jornadaDoZero.dbtest.ts`.

---

## Como fazer as perguntas

Em toda etapa, quatro famílias, nesta ordem:

1. **De onde a pessoa veio?** Quais entradas levam aqui, e o que cada uma já
   estabeleceu antes de chegar.
2. **E se estiver vazio?** Sem membros, sem elenco, sem regras, sem histórico.
   O caso vazio é o primeiro uso de todo mundo, e é o que menos se testa.
3. **É a hora certa de pedir isto?** Um campo pedido cedo demais é um muro.
   Se não é a hora, qual é.
4. **E quando falha?** Rede, permissão, concorrência, segundo aparelho.

---

## Etapa 0 — Chegada, sem conta

**De onde veio:** primeiro acesso, ou link compartilhado.

| # | Pergunta | Resposta |
|---|----------|----------|
| 0.1 | Dá para usar sem conta? | ✅ Sim. `resolveAccessLevel` → `guest`; sortear e marcar ponto são locais. |
| 0.2 | E se a pessoa veio de um link de pelada? | ✅ Vê o convite com o nome do grupo, e o botão de criar conta carrega o destino de volta. |
| 0.3 | E sem internet? | ✅ Funciona inteiro: nada aqui toca a nuvem. |
| 0.4 | A pessoa entende que está em modo local? | ❓ **Aberta.** Não verifiquei se a interface diz isso em algum lugar. |

---

## Etapa 1 — Criar conta

| # | Pergunta | Resposta |
|---|----------|----------|
| 1.1 | O destino sobrevive à confirmação por e-mail? | ✅ Sim: vai na URL **e** no armazenamento, aceita só caminho interno, vale uma volta. |
| 1.2 | E se a rede cair no meio do cadastro? | ❓ **Aberta.** Não verifiquei a mensagem. |
| 1.3 | O que a pessoa já tem ao sair daqui? | Conta e perfil. **Não** tem comunidade, nem elenco, nem vínculo de atleta. |
| 1.4 | O que a conta pede além do nome de usuário? | ✅ **Desde 2026-09-28.** A ficha do atleta: gênero, posição principal, altura e mão dominante são obrigatórios (apelido e posições secundárias, opcionais). A tela é `/completar-ficha` (`CompleteAthleteProfilePage.tsx`), com o mesmo `AthleteProfileForm` usado em Minha ficha e em Convidados. |
| 1.5 | E as contas antigas, que já tinham conta antes da ficha existir? | ✅ Caem na mesma tela no próximo acesso — o servidor responde `needs_athlete_profile` enquanto faltar qualquer um dos quatro obrigatórios (`ensure_account_ready`), e a sessão prende em `/completar-ficha` até a conta preencher. `fichaDoAtleta.dbtest.ts`: `com nome de usuario e ficha vazia, needs_athlete_profile`, `faltando qualquer um dos quatro obrigatorios, continua needs_athlete_profile`, `com os quatro obrigatorios, ready`. |
| 1.6 | O destino sobrevive a preencher a ficha? | ✅ Sim, mesmo padrão da 1.1 — vem de `location.state.from` e volta para onde a pessoa ia. `CompleteAthleteProfilePage.spec.tsx`: `salva, atualiza a sessao e segue para o destino guardado`. |
| 1.7 | Quem edita a ficha, depois de criada? | ✅ **Só a própria conta.** A policy de `update` de `players` e a RPC `update_my_athlete_profile` recusam qualquer outra conta, inclusive dono e admin da comunidade. `fichaDoAtleta.dbtest.ts`: `dono da comunidade nao altera nenhuma coluna de ficha com conta`, `o atleta altera a propria ficha, mesmo quando outra conta e o owner_id`, `ficha sem conta continua editavel por dono da comunidade e pelo owner_id` (convidado é a exceção — sem conta, dono/admin editam em Gestão → Convidados). |
| 1.8 | O atleta vê a própria avaliação? | ✅ **Desde 2026-09-29, na carta.** Tocar em si mesmo em Pessoas abre a carta com a aba "Avaliação": média por fundamento nesta comunidade, sem dizer quem deu cada nota. Quem avalia vê a de todos; os demais membros, só a carta. `perfilDoAtleta.dbtest.ts` (`o atleta le a propria avaliacao e nao a de outro`), `PlayersView.spec.tsx`. |
| 1.9 | Quem troca a foto de um atleta? | ✅ **Com conta, só a própria conta**, em Minha ficha; **convidado**, dono ou admin da comunidade, em Gestão → Convidados. Nos dois casos vale na hora — não há mais aprovação. `perfilDoAtleta.dbtest.ts`. |
| 1.10 | O que é "presença frequente"? | ✅ **Calculada, desde 2026-09-29:** esteve em pelo menos metade das até 6 últimas peladas encerradas da comunidade (`isFrequentInCommunity`, `community.test.ts`). Ninguém marca. Limite: quem não lê as peladas da comunidade (o membro, até a P17) não vê ninguém como frequente. |

---

## Etapa 2 — Ter uma comunidade

**De onde veio:** criar a própria (2a) ou entrar por convite (2b).

### As três coisas que se confundem

Uma pessoa só joga quando tem **três**, e elas são independentes:

| | O que é | Onde vive |
|---|---|---|
| **Participação** | pertencer ao grupo | `community_members` / `community_memberships` |
| **Ficha de atleta** | existir como jogador | `players` |
| **Vínculo de conta** | *esta conta* é *esta ficha* | `player_account_links` com `ACTIVE` |
| **Elenco** | ser atleta *daquela* comunidade | `community_players` |

| # | Pergunta | Resposta |
|---|----------|----------|
| 2.1 | Criar a comunidade dá quais dessas? | ✅ **As três**, desde 2026-09-24. Até então dava só a ficha, e quem criava a pelada não jogava nela. |
| 2.2 | Entrar por convite dá quais? | ✅ As três, desde 2026-09-24. |
| 2.3 | E se a comunidade não tiver nuvem? | Funciona local, mas **a lista nunca abre**: `openRegistration` exige `cloudId`. |
| 2.4 | E se a pessoa já tinha ficha de outra comunidade? | ✅ O vínculo dela não é reescrito pela aprovação. |

---

## Etapa 3 — Conseguir entrar numa lista

**De onde veio:** do painel, da agenda, ou do link compartilhado.

| # | Pergunta | Resposta |
|---|----------|----------|
| 3.1 | O que o servidor exige para entrar? | Três coisas, com frase própria para cada: participação, vínculo, elenco. |
| 3.2 | Quem pode criar um vínculo de conta? | Medido (ETAPA 4): **duas funções no banco inteiro**, `enroll_approved_member` e o reparo. A primeira roda por **duas portas**: aprovar um pedido de entrada e criar uma comunidade. O teste guarda essa lista fechada — se alguém abrir uma terceira porta, ele quebra. |
| 3.3 | Então quem cria a própria comunidade recebe vínculo? | ✅ **Sim, desde 2026-09-24.** `create_community_with_owner` passou a chamar `enroll_approved_member`, que é onde mora "esta pessoa é atleta desta comunidade". |
| 3.4 | Ela consegue entrar na pelada que ela mesma abriu? | ✅ Sim. Era o bloqueio nº 1 da jornada. |
| 3.5 | Criar duas comunidades duplica ficha ou vínculo? | ✅ Não: uma ficha e um vínculo por conta, e um assento de elenco por comunidade. |
| 3.6 | Quantas pessoas estavam presas em produção? | Zero, por acidente histórico — os 6 donos vieram do backfill de agosto. O buraco era das comunidades **novas**. |
| 3.7 | E se a comunidade não tem outros membros? | ✅ Quem criou já é atleta dela, então a lista nunca nasce vazia de gente elegível. |
| 3.8 | **É a hora certa de exigir vínculo?** | Sim — e a hora de **conceder** passou a ser quando a pessoa entra no grupo, por qualquer das duas portas. |
| 3.9 | Um convidado (atleta sem conta) pode estar em duas comunidades? | Não, desde 2026-09-29: o gatilho `zz_guard_guest_single_community` recusa o segundo vínculo ativo (`convidadoNumaComunidade.dbtest.ts`), e o convidado rápido só reaproveita convidado da mesma comunidade (`playerDuplicates.test.ts`). Quando o convidado ganha conta, a regra deixa de valer. |
| 3.10 | Duplicar a comunidade leva o elenco? | Não, desde 2026-09-29: copia só nome e regras (`CommunityDataArea.spec.tsx`). O elenco da nova se monta de novo — convidados cadastrados lá, contas pelo convite. |

---

## Etapa 4 — Marcar a pelada (o wizard)

**De onde veio:** cinco entradas, todas em `paths.sessaoNova` — botão do
AppShell, ranking da comunidade, cartão de rascunho, `resolveNewSessionPath`,
`pathForLegacyPage`.

### Perguntas gerais

| # | Pergunta | Resposta |
|---|----------|----------|
| 4.0 | Quem marca pelada? | ✅ **Desde 2026-09-30, quem o servidor diz que organiza** (`session.manage`, a responsabilidade `ORGANIZER`): dono, admin e moderador ganham ao assumir o cargo, e "Deixar organizar" em Membros liga ou desliga para qualquer um, inclusive um membro. A interface segue o servidor (`useCanManageSessions`, `communityPermissions.test.ts`); sem nuvem, vale o cargo. |
| 4.1 | Em que passo a pessoa cai? | Passo 0 (`Sessão`). |
| 4.2 | Quais passos exigem atleta? | 1 (≥4) e 3 (`teamCount × 3`). O passo 0 não. |
| 4.3 | **É a hora certa de escolher atletas?** | 🔴 **Não.** Com a inscrição decidindo quem joga, escolher atletas no ato de marcar é pedir a resposta antes da pergunta. |
| 4.4 | Se não é a hora, qual é? | Depois que a lista fecha — e fechar é passo separado do sorteio. [Spec](superpowers/specs/2026-09-24-dividir-o-wizard-design.md) fechada, [plano](superpowers/plans/2026-09-24-dividir-o-wizard.md) escrito. |
| 4.5 | E se a comunidade não tem elenco nenhum? | 🔴 Era beco sem saída até `048455d`. Hoje a saída "Marcar pelada" aparece ao lado do erro. |

### Campo a campo — passo 0 (`Sessão`)

| Campo | Perguntas |
|---|---|
| **Nome da Sessão** | Obrigatório ✅. Nasce como "Comunidade - DD/MM". ❓ Duas peladas no mesmo dia geram nomes iguais — isso confunde na agenda e no link? |
| **Data do Evento** | Obrigatório ✅. ❓ Aceita data muito distante? Há limite? **Não verificado.** ✅ Data no passado é recusada ao marcar. |
| **Local (Opcional)** | ❓ Se é opcional, quem recebe o link sabe onde jogar? Hoje o link **não carrega o local**. |
| **Observações (Opcional)** | ❓ Aparece para quem recebe o convite? **Não.** Deveria? |

### Campo a campo — passos de formato e regras

| Campo | Perguntas |
|---|---|
| **Quantidade de Times** | Define a exigência de atletas (`× 3`) e hoje também a capacidade da lista (`× 6`). ✅ **Decidido:** a capacidade vira campo próprio ao marcar, com `× 6` como sugestão — a vaga é o que o grupo disputa e não pode depender de uma decisão de sorteio. |
| **Formato do Torneio** / **Fases do Mata-Mata** / **Playoffs** | Só para torneio. ❓ Uma pelada marcada com lista pode virar torneio depois? **Não verificado.** |
| **Pontos por Jogo**, **Formato de Vitória** | ❓ É a hora certa? São regras de jogo — poderiam esperar o sorteio, que é quando importam. |
| **Sistema de Rotação em Fila**, **Vitórias máximas consecutivas** | ❓ Idem. |
| **Perfil Técnico**, **Posições dos Atletas** | 🔴 Dependem do elenco, então pertencem ao sorteio, não ao marcar. |
| **Atleta A / Atleta B / Tipo de Vínculo** (duplas) | 🔴 Idem — exigem atletas escolhidos. |

**A pergunta que organiza todas:** *este campo precisa de gente?* Se precisa,
pertence ao sorteio. Se não, pertence ao marcar. É exatamente a costura da spec.

---

## Etapa 4b — Avaliar o elenco

**De onde veio:** só o item "Avaliação" do menu da comunidade, que só aparece
para quem o servidor deixa avaliar. O link "Avaliar atleta" saiu com a tela de
edição de atleta em 2026-09-28 — não há mais entrada pelo perfil do atleta.
Levantado em 2026-09-25 — [spec](superpowers/specs/2026-09-25-avaliacao-da-comunidade-design.md).

| # | Pergunta | Resposta |
|---|----------|----------|
| 4b.1 | Quem avalia? | ✅ Dono e admin pelo cargo; quem eles designam, pela responsabilidade `EVALUATOR`. `avaliacaoDaComunidade.dbtest.ts`. |
| 4b.2 | Até 2026-09-25, alguém conseguia avaliar? | 🔴 **Não.** Em produção ninguém tinha `EVALUATOR`, e o cargo não dava a capacidade. |
| 4b.3 | Alguém avalia a si mesmo? | ✅ Não, salvo o único avaliador da comunidade, em caráter provisório. |
| 4b.4 | **E se a comunidade tem um avaliador só?** | ✅ Ele se autoavalia; a nota vale até a primeira nota de outra pessoa sobre ele, e então sai da média sem ser apagada. Designar alguém tira dele o direito de alterar a própria nota. |
| 4b.5 | E se o elenco estiver vazio? | ✅ "Ninguém no elenco ainda." `EvaluationRosterView.spec.tsx`. |
| 4b.6 | Quem avalia vê a nota dos outros? | ✅ Não, nem a média enquanto avalia: a média puxaria a nota para ela. Desde 2026-09-29 a média aparece **fora** da tela de avaliação, na aba "Avaliação" da carta do atleta (decisão do usuário) — quem avalia pode consultá-la antes de avaliar. |
| 4b.7 | E sem sinal? | ✅ "A avaliação precisa de conexão." Salvar que falha guarda o comando e repete com o mesmo identificador. |
| 4b.8 | Atleta sem avaliação entra no sorteio? | ✅ Com a média dos avaliados daquela pelada (ou 5), e o resultado avisa quantos foram estimados. |
| 4b.9 | O toque no trilho do deslizante grava a nota num celular real? | ❓ **Aberta.** Provado por teste de componente e pelo teclado na bancada; o toque com dedo não foi verificado. |

---

## Etapa 5 — Abrir a lista e compartilhar

| # | Pergunta | Resposta |
|---|----------|----------|
| 5.1 | Quem pode abrir? | Quem tem `session.manage`, que vem da responsabilidade ORGANIZER. |
| 5.2 | E sem nuvem? | Recusa com frase clara: sincronize antes. |
| 5.3 | O link funciona no aparelho de outra pessoa? | ✅ Para quem **já é do grupo**, mesmo sem a pelada no aparelho. |
| 5.4 | E para quem não é do grupo? | ✅ Cai no convite, pede entrada em um toque. |
| 5.5 | A pelada aparece na agenda de outro aparelho? | 🔴 **Não.** Dois portões: o filtro do cliente (`AF-TARGET-005`) e a policy, que exclui `member`. |
| 5.6 | A mensagem diz onde e quando? | Nome e dia ✅. **Local, não** — ver 4.x. |

---

## Etapa 6 — O atleta entra na lista

| # | Pergunta | Resposta |
|---|----------|----------|
| 6.0 | O atleta vê quem organiza a pelada? | ✅ **Sim, desde 2026-09-30:** o quadro da inscrição mostra "Organiza: <nome>" a todos os membros (`get_session_organizer`, `quemOrganiza.dbtest.ts`, `RegistrationBoardView.spec.tsx`). O botão de transferir a organização só aparece para quem pode. |
| 6.1 | Funciona ponta a ponta? | ✅ `approvedMemberCanJoin.dbtest.ts` cobre do pedido de entrada à vaga. |
| 6.2 | E se a internet cai no toque? | Falha **visível**, e o `commandId` é guardado: tentar de novo reusa o comando e o recibo impede entrada dupla. |
| 6.3 | Existe fila offline? | 🔴 **Não.** Quem perdeu o sinal precisa voltar à tela e tocar de novo. Numa lista por ordem de chegada, isso é injusto com quem tentou primeiro. |
| 6.4 | Duas pessoas ao mesmo tempo? | ✅ A ordem é do servidor (`queue_sequence`). |
| 6.5 | E se a pelada já começou? | ✅ A tela avisa e esconde o botão, desde a migration dos fatos da sessão. |

---

## Etapa 7 — Pagamento e corte

| # | Pergunta | Resposta |
|---|----------|----------|
| 7.1 | Pagar passa na frente de quem não pagou? | Só na reserva. Confirmado não pago **não** perde a vaga, a menos que haja prazo. |
| 7.2 | Quando o corte roda? | No próximo toque na lista, não por relógio. |
| 7.3 | Quem marca pagamento? | Só quem organiza. |
| 7.4 | E o valor? | Não existe: só pago/não pago. |

---

## Etapa 8 — Fechar e sortear

| # | Pergunta | Resposta |
|---|----------|----------|
| 8.1 | O sorteio parte de quem? | 🔴 Da **seleção manual**, reconciliando a lista por cima. Invertido. |
| 8.2 | Deveria partir de quem? | Dos confirmados; o ajuste é exceção. **Decidido**, na spec. |
| 8.3 | E sem nuvem? | Cai no sorteio legado, que não consulta lista. |
| 8.4 | A lista precisa estar travada? | ❓ **Aberta na spec.** |

---

## Etapa 9 — A pelada ao vivo

| # | Pergunta | Resposta |
|---|----------|----------|
| 9.1 | Funciona sem sinal? | ✅ É o princípio declarado. |
| 9.2 | Dois aparelhos na mesma pelada? | ❓ **Não verificado.** Há `claim_session_ownership` e heartbeat de 10 min, mas não simulei a disputa. |
| 9.3 | Quem chegou de última hora entra? | Depende de 8.2. |

---

## Etapa 10 — Encerrar, histórico, avaliação

❓ **Não investigada.** O que se sabe: a autoavaliação (nota provisória do
único avaliador de uma comunidade, item 4b.4) segue existindo — só ela, não
a **ficha** do atleta; a pergunta sobre o **destino de um perfil de
autoavaliação próprio** (tela dedicada, edição pelo atleta) está
✅ **descontinuada em 2026-09-28**: quem se avalia usa o mesmo formulário de
Avaliação, e os dados do atleta (gênero, posição, altura, mão) moram na ficha,
não numa autoavaliação — ver Etapa 1 (1.4–1.7). `AvatarApprovalInbox` não tem
tela; o conjunto de candidatos publicado não tem leitor.

---

## O que bloqueia, em ordem

1. ✅ ~~**Etapa 3 — quem cria a comunidade não vira atleta.**~~ Corrigido em
   2026-09-24. Era o bloqueio que tornava tudo o resto irrelevante para quem
   monta a própria pelada.
2. 🔴 **Etapa 4/8 — a inversão do wizard.** Spec fechada e
   [plano escrito](superpowers/plans/2026-09-24-dividir-o-wizard.md).
3. 🔴 **Etapa 5 — a pelada invisível em outro aparelho.** Dois portões.
4. ⚠️ **Etapa 6 — sem fila offline.**
5. ❓ **Etapas 9 e 10 — não verificadas.**
