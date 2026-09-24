# Roadmap de fluxos e telas — Panelinha

> Levantado em **2026-09-24**, lendo o roteador, os guardas e o sync, e rodando
> 790 testes contra um PostgreSQL de verdade no Docker. Cada afirmação aqui tem
> uma referência `arquivo:linha` ou um teste que a sustenta. Onde eu supus, está
> escrito que supus.
>
> Este documento responde a três perguntas: **que telas existem**, **quem
> consegue chegar em cada uma** e **onde o caminho quebra**. A ordem de trabalho
> no fim sai disso, não de preferência.

---

## 1. O mapa das telas

Rotas em `src/app/AppRouter.tsx`. A coluna "quem chega" é o que existe hoje na
interface, não o que a rota aceita.

### Fora de qualquer conta

| Rota                  | Tela                   | Quem chega                       |
| --------------------- | ---------------------- | -------------------------------- |
| `/entrar`, `/cadastro` | `LoginPage`            | link do muro de conta, ou direto |
| `/recuperar-senha`     | `PasswordRecoveryPage` | link do login                    |
| `/verificar-email`     | `EmailVerificationPage` | redirecionamento do estado de auth |
| `/escolher-username`   | `UsernameOnboardingPage` | idem                           |
| `/configurar-mfa`, `/confirmar-mfa` | telas de MFA | perfil, e o gate do AAL2        |
| `/auth/callback`, `/auth/loading` | `AuthTransitionPage` | volta do e-mail / do Google |

### Modo local — funciona sem conta

| Rota              | Tela                 | Quem chega                       |
| ----------------- | -------------------- | -------------------------------- |
| `/painel`         | `Dashboard`          | raiz do app                      |
| `/comecar`        | `QuickStartView`     | primeiro uso                     |
| `/pelada/resumo`  | `SessionRecapView`   | fim da sessão ao vivo            |
| `/sessao/ativa`   | sessão ao vivo local | painel, quando há sessão ativa   |

### Exige conta (`AccountGate`)

| Rota                   | Tela                  | Quem chega                        |
| ---------------------- | --------------------- | --------------------------------- |
| `/agenda`              | `AgendaView`          | painel ("histórico")              |
| `/comunidades`         | `CommunitiesView`     | painel ×2 ("atletas", "comunidades") |
| `/perfil`, `/perfil/sync` | perfil e sync      | cabeçalho                         |
| `/ligas*`              | ligas                 | comunidade → aba Ligas            |
| `/plataforma`          | admin                 | só perfil de plataforma           |

### Dentro de uma comunidade (`/comunidades/:id/…`)

| Rota                          | Tela                      | Quem chega                            |
| ----------------------------- | ------------------------- | ------------------------------------- |
| `` (índice)                   | `CommunityOverviewArea`   | lista de comunidades                  |
| `pessoas`                     | elenco                    | abas da comunidade                    |
| `pessoas/editar-atleta/:id`   | `PlayerEditView`          | elenco                                |
| `sessoes`                     | `HistoryView` (lista)     | abas                                  |
| `sessoes/:id`                 | `HistoryView` (detalhe)   | lista de sessões                      |
| **`sessoes/:id/inscricao`**   | `RegistrationBoardView`   | **painel (próxima pelada), agenda e link compartilhado** |
| `sessoes/nova`                | `SessionWizard`           | botão "marcar pelada"                 |
| `sessoes/ativa`               | sessão ao vivo            | wizard, ao iniciar                    |
| `sessoes/presenca`            | presença                  | abas                                  |
| `sessoes/lista-whatsapp`      | listas de WhatsApp        | abas                                  |
| `sessoes/torneios`            | torneios                  | abas                                  |
| `desempenho*`                 | estatísticas e histórico  | abas                                  |
| `gestao`, `gestao/regras`, `gestao/dados` | gestão        | abas                                  |

---

## 2. As jornadas, e onde elas quebram

### 2.1 Quem organiza marca a pelada

```
painel → comunidade → "marcar pelada" → SessionWizard
       → escolhe elenco → sorteia → confirma → sessão ao vivo
```

**Quebra:** a pelada só existe em `sess.sessions` depois de `confirmDivision`
(`useSessionWizard.ts:508`). Antes disso ela vive só em `activeSession` e não
aparece em lugar nenhum — nem na agenda, nem no painel. E ela nasce com a data
de **hoje** (`sessionLifecycleUseCases.ts:112`).

**Consequência:** *não existe marcar uma pelada para depois*. O produto assume
que você sorteia no dia. Tudo que depende de antecedência — inscrição,
pagamento, convite — está construído sobre um alicerce que não existe.

### 2.2 O atleta entra na lista

```
painel → cartão "próxima pelada" → inscrição → "Quero jogar"
```

**Quebra 1:** o cartão e a agenda só listam sessões que estão em
`sess.sessions` com data `>= hoje` (`agendaViewModel.ts:33-37`). Como a sessão
só entra lá no sorteio, **a tela da inscrição só fica alcançável depois do
sorteio** — e o sorteio autorizado já fecha e tranca a janela. A inscrição
existe para acontecer antes; o caminho até ela só existe depois.

**Quebra 2:** entrar na lista exige **três** coisas no servidor, provadas em
`registrationCoherence.dbtest.ts`: participação ativa na comunidade, uma ficha
de atleta ligada à conta, e estar no elenco daquela comunidade. As três falham
com `42501`. O produto traduzia uma frase só — corrigido em 2026-09-24, agora
são três frases.

### 2.3 Quem recebe o link

```
WhatsApp → /comunidades/:c/sessoes/:s/inscricao
```

**O que funciona hoje** (depois de 2026-09-24): quem **já é da comunidade**,
mesmo sem a pelada neste aparelho, abre a lista. A tela se vira com o id da
URL, que para sessão target é o próprio id de nuvem.

**O que ainda não funciona:**

- **Quem tem conta e não é da comunidade** cai em `/comunidades`.
  `CommunityShell` (`communityRoutes.tsx:61`) redireciona antes de qualquer
  outra coisa quando a comunidade não está neste aparelho. Esta pessoa perde o
  contexto da pelada e não recebe convite nenhum.
- **A data não aparece** para quem chega pelo link: `read_registration_board`
  não devolve nome nem data, e `read_target_session` devolve só o nome.
- **Quem não tem conta** agora vê o convite certo e volta para a pelada depois
  do cadastro — mas chega lá como não-membro, e cai no caso acima.

### 2.4 Entrar na comunidade

```
/comunidades → "entrar com código" (modal) → digita o código → pedido → aprovação
```

**Quebra:** o código de convite **não tem URL**. `JoinCommunityByCode` só existe
como modal dentro de `CommunitiesView` (`CommunitiesView.tsx:315`). Não dá para
mandar um link que faça a pessoa entrar; é preciso dizer o código e torcer para
ela achar o modal. E depois de aprovada ela ainda precisa ser ligada a uma ficha
de atleta e entrar no elenco — dois passos que ninguém lhe explica.

### 2.5 Quem organiza passa a pelada adiante

```
inscrição → "Quem organiza" → assumir, ou escolher a pessoa
```

Funciona (2026-09-24). Mas **tirar a responsabilidade de quem está organizando
tranca a lista aberta no meio do caminho**, com `42501` e sem aviso nenhum —
provado em `registrationCoherence.dbtest.ts`.

---

## 3. Achados, com a evidência

| #   | Achado                                                                                                              | Evidência                          | Situação |
| --- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------- |
| 1   | A inscrição só é alcançável **depois** do sorteio                                                                    | `useSessionWizard.ts:508`, `agendaViewModel.ts:33` | **corrigido** |
| 2   | Não existe marcar pelada futura: nasce com a data de hoje                                                            | `sessionLifecycleUseCases.ts:112`  | **corrigido** |
| 3   | Entrar na lista tem três recusas distintas e o produto dava uma frase só                                             | `registrationCoherence.dbtest.ts`  | **corrigido** |
| 4   | Tirar a organização não parava de pé: o espelho do cargo legado a devolvia                                           | idem                               | **corrigido** |
| 5   | Tirar a responsabilidade tranca a lista aberta, sem aviso                                                            | idem                               | **corrigido** (confirmação diz a consequência) |
| 6   | Sessão `IN_PROGRESS` recusa quem entra, mas a janela continua anunciando `OPEN`                                      | idem                               | **corrigido** |
| 7   | Sessão target nunca desce para outro aparelho                                                                        | `operationalCloudService.ts:72`, `targetSessionVisibility.dbtest.ts` | aberto — **dois portões**, ver abaixo |
| 8   | O muro de conta perdia o destino                                                                                     | `AccountRequiredView.tsx`          | **corrigido** |
| 9   | O convite da inscrição era inalcançável: `CommunityShell` corre antes do `AccountGate`                                | `communityRoutes.tsx:61`           | **corrigido para quem não tem conta** |
| 10  | Quem tem conta e não é da comunidade perde o link                                                                    | `appRoutes.ts:71`                  | **corrigido** (rota `/convite/:codigo`) |
| 11  | O código de convite não tem URL                                                                                      | `CommunitiesView.tsx:315`          | **corrigido** |
| 12  | Quem chega pelo link não vê a data da pelada                                                                         | `registrationBoard.ts:21-38`       | **corrigido** |
| 15  | **Membro comum não lê sessão nenhuma da própria comunidade** — a policy chama `current_user_has_community_role` sem papéis, e o padrão exclui `member` | `targetSessionVisibility.dbtest.ts` | aberto |
| 13  | `read_team_candidate_set` continua sem consumidor                                                                    | mapa de alcançabilidade            | aberto |
| 14  | Dez travas explícitas abaixo de 44px sobraram                                                                        | varredura de 2026-09-23            | aberto |

---

## 4. A ordem de trabalho

A régua é a mesma do mapa de alcançabilidade: **uma fatia que não é alcançável
por um usuário entrega infraestrutura, não software.**

### Fatia 1 — Marcar a pelada antes do dia _(destrava tudo)_

Sem isto, inscrição, pagamento, convite e compartilhamento não têm quando
acontecer. A pelada precisa existir, com data escolhida, antes do sorteio: o
wizard grava a sessão em `sess.sessions` num estado anterior ao sorteio, com
data editável, e ela passa a aparecer na agenda e no painel.

Toca: `sessionLifecycleUseCases`, `useSessionWizard`, `agendaViewModel`,
`SessionWizard`. Fecha os achados **1** e **2**.

### Fatia 2 — Convite por link, com código

Uma rota `/convite/:codigo` que não depende de estado local: mostra a comunidade
e, se vier com a pelada, mostra a pelada; pede a conta quando falta; pede entrada
na comunidade em um toque. O botão de compartilhar passa a gerar este link
quando quem recebe ainda não é do grupo.

Fecha **10** e **11**. Depende da 1 para ter o que anunciar.

### Fatia 3 — A pessoa nova vira atleta sem pedir ajuda

Aprovada na comunidade, ela ainda precisa de ficha de atleta e de entrar no
elenco. Hoje isso é trabalho de quem administra, e ninguém avisa a pessoa. A
tela da inscrição já sabe qual das três coisas falta (achado 3): falta oferecer
o passo seguinte ali mesmo, em vez de só explicar.

### Fatia 4 — A janela para de mentir

`build_registration_board` passa a devolver nome, data e o ciclo de vida da
sessão. Com isso o link mostra a pelada inteira (**12**), a janela deixa de
anunciar `OPEN` numa sessão que já começou (**6**), e a tela para de depender de
cópia local para o cabeçalho.

### Fatia 5 — Tirar a organização com consequência visível

Avisar quem administra que aquela pessoa está organizando uma pelada com lista
aberta, e o que acontece se a responsabilidade sair (**5**). Alternativa de
fundo, decidida à parte: fazer `session.manage` vir da atribuição na sessão em
vez da responsabilidade da comunidade — mexe num portão do qual W3 e W4 inteiras
dependem.

### Fatia 6 — Sessão target visível em outro aparelho

Tentada em 2026-09-24 e **devolvida ao roadmap com o diagnóstico completo**. São
dois portões, não um:

1. **O filtro do cliente.** `scopeOperationalFetch` restringe `sessions` a
   `authority_model = 'legacy'`. Tirá-lo é uma linha, mas quebra o invariante
   `AF-TARGET-005` — "sessão target nunca entra na autoridade nem no merge por
   timestamp do sync genérico" —, cujo gatilho de remoção exige **fronteira
   equivalente ou mais forte**. Baixar a sessão target sem construir essa
   fronteira a joga no merge genérico, que é exatamente o que a regra proíbe.
2. **A política de leitura.** Medido em `targetSessionVisibility.dbtest.ts`: a
   policy de `sessions` chama `current_user_has_community_role(community_id)`
   sem passar papéis, e o padrão da função é `['owner','admin','moderator']`.
   Um `member` comum **não lê sessão nenhuma** da própria comunidade — legada ou
   target. Então, mesmo removendo o filtro, o atleta continuaria sem ver a
   pelada. Alargar isso é decisão de permissão, não de sync.

A fatia precisa das duas coisas: uma fronteira de leitura que não passe pelo
merge genérico, e a decisão sobre o que um `member` pode ler.

### Fatia 7 — Varredura de acabamento

As dez travas abaixo de 44px (**14**), o conjunto de candidatos publicado sem
leitor (**13**), o `AvatarApprovalInbox` sem tela, o selo de pedido de entrada, o
destino da autoavaliação, exclusão de conta e privacidade do bucket de avatar.

---

## 5. O que este documento não decide

- **Se `ORGANIZER` deve deixar de ser pré-requisito** para escrever numa pelada.
  É mudança de modelo de autorização, com spec própria.
- **Se a pelada pode ser pública** — hoje toda tela de comunidade exige conta, e
  um convite realmente aberto (ver a pelada antes de se cadastrar) é decisão de
  produto, não de arquitetura.
- **Se o pagamento vira valor**, e não só pago/não pago.
