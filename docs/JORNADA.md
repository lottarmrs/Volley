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
| 2.1 | Criar a comunidade dá quais dessas? | Medido (ETAPA 2): ficha ✅, elenco ❌, vínculo ❌. |
| 2.2 | Entrar por convite dá quais? | ✅ As três, desde 2026-09-24. |
| 2.3 | E se a comunidade não tiver nuvem? | Funciona local, mas **a lista nunca abre**: `openRegistration` exige `cloudId`. |
| 2.4 | E se a pessoa já tinha ficha de outra comunidade? | ✅ O vínculo dela não é reescrito pela aprovação. |

---

## Etapa 3 — Conseguir entrar numa lista

> 🔴 **A jornada trava aqui para quem passou por 2a.** As etapas seguintes só
> valem para quem entrou por convite.

**De onde veio:** do painel, da agenda, ou do link compartilhado.

| # | Pergunta | Resposta |
|---|----------|----------|
| 3.1 | O que o servidor exige para entrar? | Três coisas, com frase própria para cada: participação, vínculo, elenco. |
| 3.2 | Quem pode criar um vínculo de conta? | Medido (ETAPA 4): **duas funções no banco inteiro**, e as duas só rodam quando alguém **aprova um pedido de entrada**. |
| 3.3 | Então quem cria a própria comunidade recebe vínculo? | 🔴 **Nunca.** Não há pedido de entrada para aprovar. |
| 3.4 | Ela consegue entrar na pelada que ela mesma abriu? | 🔴 **Não.** `42501`, e a mensagem diz "peça a quem administra" — sendo que ela *é* quem administra. |
| 3.5 | O reparo de hoje a alcança? | 🔴 **Não.** Ele exige estar no elenco, e criar a comunidade não põe ninguém nele. |
| 3.6 | Quantas pessoas isso afeta em produção? | Agora, zero: os 6 donos existiam antes do backfill de agosto. **Toda comunidade nova nasce com o dono travado.** |
| 3.7 | E se a comunidade não tem outros membros? | 🔴 Pior caso: não há quem aprove ninguém, e a lista fica vazia para sempre. |
| 3.8 | **É a hora certa de exigir vínculo?** | Sim — mas a hora certa de **conceder** é ao criar a comunidade, não só ao aprovar terceiros. |

---

## Etapa 4 — Marcar a pelada (o wizard)

**De onde veio:** cinco entradas, todas em `paths.sessaoNova` — botão do
AppShell, ranking da comunidade, cartão de rascunho, `resolveNewSessionPath`,
`pathForLegacyPage`.

### Perguntas gerais

| # | Pergunta | Resposta |
|---|----------|----------|
| 4.1 | Em que passo a pessoa cai? | Passo 0 (`Sessão`). |
| 4.2 | Quais passos exigem atleta? | 1 (≥4) e 3 (`teamCount × 3`). O passo 0 não. |
| 4.3 | **É a hora certa de escolher atletas?** | 🔴 **Não.** Com a inscrição decidindo quem joga, escolher atletas no ato de marcar é pedir a resposta antes da pergunta. |
| 4.4 | Se não é a hora, qual é? | Depois que a lista fecha. Rota própria, na [spec da divisão](superpowers/specs/2026-09-24-dividir-o-wizard-design.md). |
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
| **Quantidade de Times** | Define a exigência de atletas (`× 3`) e a capacidade padrão da lista (`× 6`). ❓ **Aberta na spec:** a capacidade deve sair daqui ou virar campo próprio ao marcar? |
| **Formato do Torneio** / **Fases do Mata-Mata** / **Playoffs** | Só para torneio. ❓ Uma pelada marcada com lista pode virar torneio depois? **Não verificado.** |
| **Pontos por Jogo**, **Formato de Vitória** | ❓ É a hora certa? São regras de jogo — poderiam esperar o sorteio, que é quando importam. |
| **Sistema de Rotação em Fila**, **Vitórias máximas consecutivas** | ❓ Idem. |
| **Perfil Técnico**, **Posições dos Atletas** | 🔴 Dependem do elenco, então pertencem ao sorteio, não ao marcar. |
| **Atleta A / Atleta B / Tipo de Vínculo** (duplas) | 🔴 Idem — exigem atletas escolhidos. |

**A pergunta que organiza todas:** *este campo precisa de gente?* Se precisa,
pertence ao sorteio. Se não, pertence ao marcar. É exatamente a costura da spec.

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

❓ **Não investigada.** O que se sabe: a autoavaliação existe e seu destino é
pergunta aberta; `AvatarApprovalInbox` não tem tela; o conjunto de candidatos
publicado não tem leitor.

---

## O que bloqueia, em ordem

1. 🔴 **Etapa 3 — quem cria a comunidade não vira atleta.** Trava o caso mais
   comum: alguém baixa o app e monta a própria pelada. Cada comunidade nova
   nasce com o organizador impedido de jogar. **Nada depois disso importa para
   essa pessoa.**
2. 🔴 **Etapa 4/8 — a inversão do wizard.** Spec escrita, duas decisões abertas.
3. 🔴 **Etapa 5 — a pelada invisível em outro aparelho.** Dois portões.
4. ⚠️ **Etapa 6 — sem fila offline.**
5. ❓ **Etapas 9 e 10 — não verificadas.**
