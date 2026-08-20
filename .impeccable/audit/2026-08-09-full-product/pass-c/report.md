# Passagem C — auditoria interna de sessão e torneio (Claude Code)

> Iniciada em **2026-08-10 ~01:05 BRT**. Continuação da auditoria de 2026-08-09 depois da perda do
> estado da passagem anterior.

## 0. Por que esta passagem existe e como a evidência mudou

A passagem anterior rodou no **Codex In-app Browser**. Este ambiente é o **Claude Code**, com um
navegador próprio e outro perfil. Verificado no início desta passagem:

- o processo do Codex não estava mais em execução;
- após o login do usuário, o `localStorage` deste navegador sincronizou da nuvem e trouxe
  **0 sessões, 0 torneios, 0 comunidades, 0 jogos, 0 pontos** e 9 atletas, nenhum deles `AUDIT`;
- portanto `Sessão — 09/08/2026`, `Torneio — 09/08/2026`, `NOVA COMUNIDADE` e os convidados
  `AUDIT Convidado 1..7` **nunca chegaram à nuvem** e não existem aqui;
- não há caixa nativa de `Encerrar Sessão` pendente neste navegador.

Os itens 16–18 da seção 8 do HANDOFF **continuam não cumpridos**. Esta passagem os refaz do zero.

### Formato da evidência

Esta passagem **não gera arquivos `.jpg`**. O navegador desta sessão devolve o screenshot para
inspeção direta, sem gravá-lo em disco, e não há Playwright/Puppeteer no projeto. Cada estado foi
aberto e validado visualmente no momento da captura; a evidência persistida é o estado real do
`localStorage`, o DOM e as medições registradas abaixo. Onde a afirmação depende de pixel, ela é
descrita como observação visual, não como arquivo.

### Diálogos nativos

O navegador desta sessão **não trava** em `window.confirm`: responde automaticamente `false`
(Cancelar). Sonda executada e confirmada. Consequência: toda ação destrutiva vira no-op silencioso.
Para exercitar esses fluxos, `window.confirm` foi instrumentado por ação, registrando mensagem e
resposta. Cada uso está em `../mutations.md`.

## 1. P0 — integridade do elenco: REPRODUZIDO e causa reduzida

Fixture controlado, criado nesta passagem: 9 atletas selecionados —
`teste`, `TESTEADM`, `AUDIT C1` … `AUDIT C7`. Formato Jogo Livre, 3 times, 12 pontos, 3 Direto.

Resultado de `Gerar Times Equilibrados`:

| Time | Atletas |
|---|---|
| Time 1 | AUDIT C1, AUDIT C4, AUDIT C7 |
| Time 2 | AUDIT C2, AUDIT C5 |
| Time 3 | AUDIT C3, AUDIT C6 |

**9 selecionados → 7 distribuídos (3 + 2 + 2).** Exatamente o mesmo formato da passagem anterior.
Os dois ausentes são `teste` e `TESTEADM`.

### O que foi isolado

- As **três** divisões alternativas geradas (`bestDivisions[0..2]`) descartam os mesmos dois
  atletas. Não é aleatoriedade de seed.
- Os dois ausentes são exatamente os que têm **`atributos: {}`** no `localStorage` — nunca
  avaliados. Os sete convidados têm os 11 atributos preenchidos (valor 5) e todos os sete entram.
- **Posição foi descartada como causa:** `teste` foi trocado de `Levantador` para `Ponteiro` na
  etapa de Revisão e a geração foi repetida. Continuou fora. O caminho de alocação de levantador
  não é o culpado.
- `selectedPlayerIds` contém os 9 IDs e todos resolvem no catálogo `players`. A hipótese anterior
  — "IDs ausentes do catálogo", `SessionWizard.tsx:210-212` — **não se sustenta**: aquele filtro
  devolve os 9.
- `buildDivisionGenerationPlan` (`sessionLifecycleUseCases.ts:481`) também repassa os 9.
- `buildInitialSolution` (`balancing.ts:604-750`) empurra todo atleta para algum time; não há
  descarte ali. A perda acontece depois, entre a solução inicial e
  `playerIds: teamAthletes.map(a => a.id)` (`balancing.ts:1455`).

**Gatilho confirmado:** atleta sem nenhum atributo avaliado. **Ponto exato do descarte:** ainda não
fixado numa linha; está entre o annealing e a montagem da divisão. Isso é trabalho de correção, não
de auditoria, e está registrado como tal.

### Agravante — o diagnóstico não denuncia a perda

Na etapa Times, o painel `DIAGNÓSTICO DE EQUILÍBRIO` exibe simultaneamente:

- medidor vermelho **`DESEQUILIBRADA — Diferença: 137 pts`**;
- **todas** as métricas de dispersão em `0.0 PTS` (força geral, ataque, levantamento, bloqueio,
  altura, gênero, forma, lesionados);
- alerta verde `DIVISÃO COM MENOR VARIAÇÃO DE FORÇA GERAL ENTRE AS EQUIPES`;
- oito alertas laranja sobre falta de levantador e de atacante de referência — consequência dos
  atletas descartados;
- **nenhuma menção de que 2 dos 9 atletas selecionados ficaram fora de qualquer time.**

O único fato que quebra a sessão é o único que o painel não reporta. `Gerar tabela` permanece
habilitado.

## 2. Escalas incoerentes de avaliação — três unidades na mesma jornada

O mesmo atleta aparece com três grandezas diferentes em passos consecutivos do mesmo wizard:

| Onde | `teste` | `AUDIT C1` | Unidade exibida |
|---|---|---|---|
| Etapa 2, card do atleta | — | `5` | nenhuma |
| Etapa 5, lista de posições | `3` | `50` | nenhuma |
| Etapa 5, análise de pré-jogo | texto: `NENHUM LEVANTADOR FORTE (NÍVEL 6+)` | — | "nível" |
| `localStorage.atributos` | `{}` (vazio) | `5` em 11 atributos | 0–10 |

Nenhum dos números traz unidade ou escala. Lado a lado na etapa 5, um técnico lê `teste 3` contra
`AUDIT C1 50` e conclui que o convidado é 16× mais forte.

Pior: `teste` e `TESTEADM` têm `atributos: {}` — **zero dados** — e mesmo assim recebem o número
`3`, apresentado com o mesmo peso visual de um valor medido. O card do atleta chega a mostrar
`⚠ Sem dados suficientes` e o número ao lado.

## 3. Descartar rascunho apaga atletas sem avisar

Ao entrar nesta passagem havia um rascunho `TORNEIO — 09/08/2026` e **9 atletas** no catálogo, sete
deles convidados (`123`, `1234`, `12345`, `123455`, `1234566`, `123123123`, `1231231231231`).

Após um clique em `Descartar` no card de rascunho pendente do Dashboard, o catálogo passou a ter
**2 atletas**. Os sete convidados desapareceram junto com o rascunho.

- A confirmação é `Deseja realmente descartar o rascunho?` — não menciona atletas.
- O mesmo botão `Descartar` do card de **sessão ativa** dispara `clearActiveSession`
  (`Dashboard.tsx:55`) sem confirmação alguma, enquanto o do rascunho passa por `window.confirm`
  (`App.tsx:732`). Dois botões idênticos, lado a lado no mesmo componente, com contratos de
  segurança diferentes.

Não reproduzi o apagamento em teste controlado nesta passagem — isso exigiria descartar o rascunho
em uso. Está registrado como **a verificar**, com a sequência observada e os horários em
`../mutations.md`.

## 4. Confirmação destrutiva por `window.confirm` é sistêmica

Ocorrências no código, todas em ações destrutivas ou irreversíveis:

- `App.tsx:537` encerrar sessão · `:732` descartar rascunho · `:743` descartar sessão ativa ·
  `:830` excluir comunidade
- `TournamentActiveView.tsx:290`, `:548`, `:1229` e `:1239` W.O. A/B, `:1256` reabrir jogo,
  `:1267` cancelar jogo
- `SessionActiveView.tsx:305` remover time da fila
- `CommunityMembersPanel.tsx:149` remover membro, `:154` sair da comunidade
- `usePlayers.ts:255` excluir atleta · `HistoryView.tsx:626` · `SettingsModule.tsx:64` ·
  `CommunitiesView.tsx:1645` · `useSessionWizard.ts:340`

Numa superfície Operate isso custa: a caixa nativa não mostra o nome do que será destruído, não
diferencia gravidade, não é estilizável, não é testável e não oferece desfazer.

## 5. Acessibilidade e layout — confirmados por DOM e medição

- **Navegação sem estado programático.** Os 8 botões da sidebar (`Dashboard`, `Torneios`,
  `Jogadores`, `Ranking`, `Histórico`, `Nuvem & Conta`, `Configurações`, `Gestão`) têm nome
  acessível correto, mas **nenhum** expõe `aria-current` ou `aria-pressed`. O módulo ativo é
  comunicado só por cor de fundo. Verificado no DOM.
- **Cards principais não são focáveis.** `Nova Sessão`, `Atletas` e `Comunidades` são `div` com
  `onClick` (`Dashboard.tsx:107`), sem `role`, `tabIndex` ou equivalente em teclado.
- **CTA primário fora da tela.** Na etapa 2 com 9 atletas, `Continuar` fica em `y=916` num viewport
  de `694px` — invisível e inalcançável pela roda do mouse sobre a lista, porque a lista tem
  rolagem própria aninhada. Medido: `scrollY=171`, `scrollHeight=1183`. Só rolando fora da lista o
  botão aparece.
- **Colisão de badge no card do atleta.** O número de overall (`5`) fica sob o selo circular de
  seleção no canto superior direito, em todos os 7 cards de convidado.
- **Três tratamentos de "selecionado" no mesmo painel** (etapa 4): `12 Pts` selecionado é uma caixa
  cinza de baixíssimo contraste; `3 DIRETO` é preenchimento azul sólido; `GANHOU FICA` é verde
  translúcido. Mesma semântica, três linguagens.
- **Badge ilegível.** `RASCUNHO PENDENTE` no Dashboard usa `badge-neutral` sobre fundo escuro;
  o texto quase desaparece.
- **Stepper some.** O indicador de 7 etapas não é fixo: rola para fora na etapa 1 e não é renderizado
  na etapa 3. O usuário perde a referência de posição no fluxo.
- **`MÉDIA ALTURA: 0cm`** em vez de estado vazio, com nenhum atleta tendo altura cadastrada.
- **`MÉDIA POWER`** exibe `40` para 9 atletas cujos overalls visíveis são 3 e 5 — o rótulo diz média
  e o número não é média de nada visível na tela.

## 6. P0 — convidado nasce sem `syncStatus` e o sync de startup o apaga

> **Revisão de 2026-08-10, após novo diagnóstico.** A formulação original desta seção —
> "recarregar a página apaga atletas criados localmente" — estava **certa no efeito e errada na
> regra**. Não é toda recarga. A cadeia exata está abaixo; o que vem depois do traço é o registro
> original da observação, mantido porque a evidência continua válida.

### A cadeia, do código

1. `GuestPlayerModal.handleSave` monta o convidado **sem `syncStatus`** e sem `updatedAt`
   (`GuestPlayerModal.tsx:100-136`). Um atleta criado pelo caminho normal recebe
   `syncStatus: 'local'` (`usePlayers.ts:245`). O convidado rápido, não.
2. `countPendingChanges` conta apenas `syncStatus === 'local' || 'pending'`
   (`syncStatus.ts:16`). Um registro com `syncStatus` indefinido é **invisível** para a contagem.
3. `planStartupCloudDownload` usa `pendingChanges > 0` como guarda contra o download automático
   (`cloudSyncStartupUseCases.ts:58-63`). Com a contagem em zero, cai no retorno final:
   `shouldDownload: true` (`:65-68`).
4. `useCloudSync.applyResult` aplica o payload da nuvem por cima do estado local
   (`useCloudSync.ts:154-161`). O convidado, que não tem `cloudId`, desaparece.

**A guarda existe e está correta. Ela só não enxerga exatamente o registro que precisa proteger.**

### Por que o efeito parecia intermitente

Na verificação de 2026-08-10, uma recarga **não** apagou os sete convidados. `vpg_last_synced_at`
não avançou: havia outros registros pendentes na sessão e no torneio, então a guarda funcionou.

E, no estado inspecionado, os próprios convidados estão inconsistentes entre si:

| Atleta | `syncStatus` | `cloudId` |
|---|---|---|
| `teste`, `TESTEADM` | `synced` | sim |
| `AUDIT C1, C2, C4, C5, C7` | `pending` | — |
| **`AUDIT C3`, `AUDIT C6`** | **ausente** | — |

Dois dos sete nunca ganharam o campo. São exatamente os que não protegeriam nada se fossem os
únicos registros locais — que é a situação de um organizador que abre o app, cadastra convidados da
noite e recarrega antes de qualquer outra alteração.

### O buraco é muito maior que os convidados — CORRIGIDO em 2026-08-10

Ao aplicar a correção e medir o estado real, o contador de pendências saltou de **5 para 48**.
Quebrando por coleção, os registros que estavam **invisíveis** para a guarda:

| Coleção | Invisíveis | Total |
|---|---:|---:|
| `vpg_points` | 17 | 17 |
| `vpg_teams` | 9 | 9 |
| `vpg_games` | 8 | 8 |
| `vpg_sessions` | 3 | 3 |
| `vpg_game_reports` | 2 | 2 |
| `vpg_session_reports` | 2 | 2 |
| `vpg_players` | 2 | 9 |
| **Total** | **43** | |

Só 5 registros — os convidados que por acaso já tinham ganhado `pending` — sustentavam a guarda.
**A noite inteira de jogo era invisível:** placar, eventos de ponto, times, jogos, sessões e
relatórios. O convidado não era o problema, era o sintoma que eu tinha conseguido enxergar. Nenhuma
dessas entidades nasce com `syncStatus`.

Se aqueles 5 convidados não existissem por acaso, um único reload teria apagado a sessão, o
torneio, os 17 eventos e os dois relatórios.

### Correção aplicada

**De fundo, em `syncStatus.ts`** — é o que realmente resolve, porque é a guarda compartilhada por
todas as coleções: um registro sem `syncStatus` **e** sem `cloudId` nunca subiu, logo conta como
pendente. O default silencioso era "pode descartar"; agora é o inverso.

**Consistência, em `GuestPlayerModal.tsx:134`** — o convidado passa a nascer com
`syncStatus: 'local'` e `updatedAt`, como já fazia o cadastro normal (`usePlayers.ts:245`).

Verificação: 5 testes em `syncStatus.test.ts` (um deles codificava o bug e foi corrigido),
`701 unit + 136 UI` passando, typecheck e build limpos. No navegador, com `AUDIT C3` e `AUDIT C6`
ainda sem `syncStatus` na base — a fixture natural do bug — o reload preservou os 9 atletas,
`vpg_last_synced_at` não avançou (o download não rodou) e o badge da sidebar passou a refletir 48
pendências reais.

**Fora do escopo desta correção, e ainda em aberto:** `applyResult` continua podendo remover
registro local sem `cloudId`. A guarda agora impede que ele seja chamado no cenário comum, mas o
caminho de troca de dono do cache (`cloudSyncStartupUseCases.ts:51-56`) ignora `pendingChanges` por
design. Vale decidir se ali também se preserva o que nunca subiu.

Severidade original **P0**: perda silenciosa de dados, sem aviso, sem log visível e sem reparo,
num produto que funciona sem nuvem por padrão.

---

### Registro original da observação (mantido)

#### Antes: "recarregar a página apaga atletas criados localmente"

Teste controlado, isolado, reproduzido:

1. `vpg_players` continha `teste`, `TESTEADM` e `AUDIT C1`. `vpg_last_synced_at` = `01:19:38Z`.
2. A página foi recarregada (`http://127.0.0.1:3000`), sem nenhuma outra ação.
3. O auto-download de startup rodou: `vpg_last_synced_at` = `01:22:15Z`.
4. `vpg_players` voltou a `['teste','TESTEADM']`. **`AUDIT C1` deixou de existir.**
5. O rascunho manteve `selectedPlayerIds.length = 10`, dos quais 8 já não resolvem para atleta
   nenhum.

O mesmo aconteceu antes, com os 7 convidados do usuário (`123` … `1231231231231`) e depois com os
7 `AUDIT C1..C7` da primeira tentativa desta passagem: em todos os casos o sumiço coincidiu com um
`vpg_last_synced_at` novo.

**Isto corrige a seção 3 deste relatório:** o gatilho não é `Descartar`, é a sincronização de
inicialização. `Descartar` apenas foi o que provocou o remount naquela ocasião.

Mecanismo, lido no código: `App.tsx:246` guarda `autoSyncedForUser` num `useRef`, então o
download automático roda **uma vez por montagem**. `useCloudSync.applyResult`
(`useCloudSync.ts:154-161`) aplica o payload da nuvem por cima do estado local. O que foi criado
localmente e ainda não subiu é destruído — num produto que se apresenta como local-first e funciona
sem nuvem por padrão.

Consequência direta: `selectedPlayerIds` acumula IDs órfãos que o produto nunca limpa. O contador
de selecionados e a distribuição de times passam a discordar. **É a causa real do sintoma
"9 selecionados, resumo mostra nove IDs, quadra mostra sete"** registrado na passagem anterior.

Observação honesta: o remount que disparou a primeira perda veio logo depois de um `form_input`
programático num `<select>`, e o console acusa `A component is changing a controlled input to be
uncontrolled` e `` `value` prop on `select` should not be null ``. O erro de componente controlado é
real e está no produto; **não afirmo** que ele causa o remount em uso normal. O teste do recarregamento,
esse sim, é limpo e não depende de instrumentação.

## 7. Seção 8 do HANDOFF — matriz da sessão regular

Executada nesta passagem com a fixture `AUDIT Sessao C — 09/08/2026` (Jogo Livre, 3 times,
12 pontos, 3 Direto).

| # | Item | Resultado |
|---|---|---|
| 1 | Estado pré-primeira-partida | ✅ `SESSÃO INICIADA` + `Começar Primeira Partida` |
| 2 | Transição de `Começar Primeira Partida` | ✅ `JOGO 1 — EM ANDAMENTO` |
| 3 | Placar ativo com dois `TeamScoreCard` | ✅ Time 1 (3 atletas) × Time 2 (2 atletas) |
| 4 | Ponto rápido sem autor | ✅ 1×0, evento `reason: null` |
| 5 | Modal, aba `Ponto Nosso` | ✅ |
| 6 | Autor + fundamento + assistência | ✅ `AUDIT C1` / `ataque` / assist `AUDIT C4`, persistido |
| 7 | Modal, aba `Erro Adversário` | ✅ |
| 8 | Categorias de erro | ✅ 9 básicas + 5 avançadas + subtipos + autor adversário |
| 9 | Confirmação e mudança de placar | ✅ 3×0, `fault: serve_out` gravado |
| 10 | `Desfazer Ponto` | ✅ 3→2, evento removido, **sem confirmação** |
| 11 | Fila e rotação | ✅ `Próxima Batalha: Time 1 vs Time 3`, `Próximo da Fila: Time 2`, `Iniciar Próximo Jogo` |
| 12 | Destaques | ✅ criado (`defesa`, `AUDIT C1`), listado no feed, removido — efeito líquido zero |
| 13 | Aviso/ownership da sessão | ➖ não apareceu nesta passagem (sessão de dono único) |
| 14 | Compartilhar/copiar | ⚠️ `Copiar` e `Copiar Próximo` acionados; **WhatsApp/Zap não acionados por decisão** — abrem composição externa |
| 15 | Encerrar partida e transição | ✅ 12×2, `VENCEDOR`, rotação para `JOGO 2` |
| 16 | Encerrar sessão com resumo e premiação | ⚠️ encerra, mas **não existe tela de resumo nem premiação**; ver abaixo |
| 17 | Reveal VUT pós-sessão | ✅ **capturado pela primeira vez na auditoria** |
| 18 | Histórico e exportadores | ✅ sessão listada e detalhada; exportadores inspecionados |

### 7.1 Encerrar sessão não entrega resumo nem premiação

`Encerrar Sessão` → confirmação nativa → **reveal VUT** (2 cartas) → **Dashboard**. Não há tela de
resumo da noite, não há `AwardsPanel`, não há classificação final. O item 16 da matriz descreve algo
que o produto não faz para Jogo Livre. O usuário fecha a noite e é despejado na home.

### 7.2 Reveal VUT — o único momento de recompensa do produto

`NOVA CARTA ESPECIAL!`, `ATLETA 1 DE 2`, abas `2 ESPECIAIS` / `2 CONQUISTAS`. Cartas:

- `AUDIT C1` — ouro, `EDIÇÃO ESPECIAL: MVP DA NOITE`, moldura `Multi-cor RARE`, química com C4 e C7;
- `AUDIT C4` — turquesa, `EDIÇÃO ESPECIAL: MAESTRO`.

É de longe a superfície mais bem resolvida do produto. Dois problemas de craft: a carta exibe
`50 PON` e `6.3` lado a lado — as duas escalas incoerentes da seção 2, agora a 3 cm uma da outra —
e o botão flutuante `PRÓXIMA CARTA` / `CONCLUIR PACOTE` cobre o cartão `QUASE LÁ` logo abaixo.

### 7.3 Histórico da sessão finalizada

`TOTAL DE JOGOS 1 · PONTOS MARCADOS 14 · TIMES ATIVOS 3 · MVP DA NOITE: **AUDIT**`.

- **O nome do MVP aparece truncado como `AUDIT`**, não `AUDIT C1`. O card corta no primeiro espaço.
- `ARTILHEIROS` lista `AUDIT C1 1 pts`, `AUDIT C4 0 pts`, `AUDIT C7 0 pts`. Dos 14 pontos da noite,
  **1** tem autor. Os outros 13 foram registrados pelo botão `Rápido`, que é o caminho padrão e o
  mais proeminente da tela. A consequência é estrutural: quem usa o produto como ele convida a ser
  usado termina a noite com uma tabela de artilheiros vazia e um MVP decidido por quase nada.
- `DESEMPENHO DOS TIMES` correto: Time 1 `1V 0D SD +10`, Time 3 `0V 0D SD 0`, Time 2 `0V 1D SD -10`.

### 7.4 Jogo 2 fica órfão

A sessão foi encerrada com o `JOGO 2` em andamento (0×0). Depois do encerramento:
`vpg_sessions[0].status = "finished"`, mas `vpg_games[1].status` continua **`"active"`**. Um jogo
ativo dentro de uma sessão encerrada. O Histórico conta `1` partida e ignora o órfão, sem avisar
que um jogo foi descartado.

## 8. Achados de craft e acessibilidade da sessão ao vivo

- **Botões de ponto indistinguíveis para leitor de tela.** `Rápido` ×2 e `Detalhar` ×2, sem
  `aria-label`, sem o nome do time. Verificado no DOM. É a ação mais consequente da tela.
- **Nenhuma região `aria-live` na sessão ao vivo.** Placar, fim de jogo, rotação de fila e
  classificação mudam sem qualquer anúncio. Consulta ao DOM: zero `[aria-live]`, zero `role="status"`.
- **`Remover lance` é `opacity-0` até hover.** Classe verificada:
  `opacity-0 group-hover:opacity-100`. Num app de beira de quadra, usado no celular, o único
  caminho para apagar um destaque é invisível e inalcançável sem mouse. A remoção também não pede
  confirmação nem oferece desfazer.
- **Três botões sem nome acessível no Histórico.** WhatsApp, Copiar e **Excluir sessão** são
  ícones puros: sem texto, sem `aria-label`, sem `title`. Um deles apaga a sessão para sempre.
- **`Copiar` não dá retorno nenhum.** Depois do clique não há toast, não há mudança de rótulo, não
  há região viva. Verificado logo após o clique: nenhum elemento de toast/alert no DOM.
- **Contradição de estado, de novo.** Com o jogo 1 encerrado, o cabeçalho global continua verde com
  `PARTIDA EM ANDAMENTO` enquanto o corpo diz `JOGO 1 — FINALIZADO` e os dois cards dizem
  `JOGO ENCERRADO`. Antes da primeira partida, o mesmo cabeçalho já dizia `PARTIDA EM ANDAMENTO`
  sobre um corpo que dizia `SESSÃO INICIADA — toque para iniciar a primeira partida`.
- **`Gerar tabela` pula a etapa 7 no Jogo Livre.** O stepper promete `1…7 · TABELA`; o clique leva
  direto à sessão ativa. A etapa prometida nunca é exibida.
- **Título do confronto ocluído.** `JOGO 1 — FINALIZADO` fica atrás da borda do card vencedor.
- **CTAs dos dois times desalinhados.** Time 1 tem 3 atletas e Time 2 tem 2, então `Rápido` e
  `Detalhar` ficam em alturas diferentes nos dois lados de uma comparação simétrica.
- **FAB cobre conteúdo.** O botão de destaque sobrepõe o valor numérico da `CLASSIFICAÇÃO GERAL`.
- **Modal do ponto pula na tela.** A caixa muda de altura e reposiciona a cada nível do fluxo
  (categoria → subtipo → autor); a borda superior saltou de `y≈42` para `y≈127` entre passos.
- **Quatro controles de compartilhamento no mesmo painel** — `Zap Próximo`, `Copiar Próximo`,
  `WhatsApp`, `Copiar` — sem diferenciação clara entre os pares.
- **Sem escala em lugar nenhum.** O mesmo atleta é `5`, `50`, `6.0`, `6.3` e `nível 6+` dependendo
  da tela. Nenhum desses números traz unidade.

Não classificado: cliques sintéticos disparados em rajada (5 e 9 em sequência imediata) registraram
apenas 1 ponto. Não é possível concluir defeito de produto — nenhum humano toca nessa velocidade e
os cliques espaçados registraram 100%. Fica registrado como **não testado** na faixa entre
0 e 1000 ms.

## 9. Seção 9 do HANDOFF — matriz do torneio

Fixture: `AUDIT Torneio C — 09/08/2026`, Todos contra Todos, 3 times, 12 pontos, 3 Direto, sem
playoffs. Mesmos 9 atletas; mesma perda de 2 na distribuição.

| # | Item | Resultado |
|---|---|---|
| 1 | Lista `Pronto` × detalhe contraditório pré-início | ✅ **fechado na rodada D** — ver 9.7 |
| 2 | `Iniciar Torneio` e primeira partida | ✅ |
| 3 | Header: Sair, Editar, Pausar, Encerrar | ✅ presentes durante o torneio |
| 4 | Status, formato, rodada, regra | ✅ `EM ANDAMENTO` · `TODOS CONTRA TODOS` · `1` · `ATÉ 12 - 3 DIRETO` |
| 5 | Placar ativo e os dois times | ✅ |
| 6 | PointModal nas duas abas + evento de teste | ✅ modal idêntico ao da sessão; ponto com autor e `ace` registrado |
| 7 | Desfazer ponto | ✅ 1→0 |
| 8 | Bracket (`TournamentBracket`) | ➖ **não aplicável** ao formato escolhido; round-robin usa classificação |
| 9 | Classificação e critérios de desempate | ✅ colunas `J V D PF PC SD % PTS`, critérios explicitados, `POR SALDO DE PONTOS` no desempate |
| 10 | Tabela de jogos e controles contextuais | ✅ todos vistos; `W.O. a favor de Time 1?` e `Cancelar este jogo?` **capturados e cancelados** sem efeito |
| 11 | Artilheiros | ✅ estado vazio: `SEM PONTUAÇÃO INDIVIDUAL AINDA` |
| 12 | MVP parcial | ⚠️ não existe painel próprio; o MVP só aparece no Histórico, como `---` |
| 13 | Premiação parcial (`AwardsPanel`) | ⚠️ `SEM DADOS SUFICIENTES` com 0/3, com 2/3 **e com 3/3 jogos** |
| 14 | Destaques no torneio | ✅ **fechado na rodada D** — ver 9.7 |
| 15 | Sessões do confronto | ✅ **fechado na rodada D** — ver 9.7 |
| 16 | Compartilhamentos | ⚠️ `Compartilhar Classificação`, `Compartilhar Artilharia`, `Compartilhar Final`, `Copiar Resumo`, `ZAP`, `COPIAR` presentes; **WhatsApp/ZAP não acionados por decisão** |
| 17 | Avanço de rodada | ✅ `PRÓXIMA PARTIDA (2 RESTANTES)`, contador `1/3 → 2/3 → 3/3` |
| 18 | Pausar e retomar | ✅ **fechado na rodada D** — ver 9.7 |
| 19 | Encerrar torneio com resumo, classificação final, MVP e prêmios | ⚠️ encerra e revela VUT, mas **não há tela de resumo final**; ver 9.4 |
| 20 | Histórico, bracket final e exportadores | ⚠️ presente, mas com números errados; ver 9.2 |
| 21 | Reveal VUT pós-torneio | ✅ capturado |

### 9.1 Etapa 7 existe no torneio e não existe no Jogo Livre — confirmado

`Gerar tabela` no torneio leva a uma etapa `TABELA GERADA` real, com `3 JOGOS | 3 RODADAS | TODOS
CONTRA TODOS`, os confrontos, `Compartilhar Tabela`, `Copiar Tabela` e `Iniciar torneio`. No Jogo
Livre o mesmo botão pula direto para a sessão ativa. O stepper promete as mesmas 7 etapas nos dois
formatos.

Nessa tabela, os três confrontos são rotulados **`Jogo 1`, `Jogo 1`, `Jogo 1`** — o número não
incrementa entre rodadas. Na tela do torneio ativo os mesmos jogos são `#1`, `#2`, `#3`.

### 9.2 W.O. entra na classificação e some do relatório

Resultado final dos três jogos: `Time 1 2×1 Time 2` (finalizado manualmente), `Time 1 12×0 Time 3`
(W.O. A) e `Time 2 0×12 Time 3` (W.O. B).

`CLASSIFICAÇÃO FINAL` conta os três: Time 1 `2V 0D SD +13 6pts`, Time 3 `1V 1D SD 0 3pts`,
Time 2 `0V 2D SD -13 0pts`. Correto.

O Histórico do mesmo torneio diz:

- **`TOTAL DE JOGOS: 1`** — foram 3;
- **`PONTOS MARCADOS: 3`** — foram 27; os 24 pontos dos dois W.O. sumiram;
- **`MVP DA NOITE: ---`**;
- e, na mesma tela, a `CLASSIFICAÇÃO FINAL` mostra cada time com **2 jogos disputados**.

Um jogo no cabeçalho, seis jogos-time na tabela logo abaixo. A lista de Histórico também anuncia
`PARTIDAS 1`.

### 9.3 Pausar/retomar exige jogo pendente

`PAUSAR` e `EDITAR` desaparecem do header assim que o último jogo é finalizado — o header passa a
ter só `SAIR` e `ENCERRAR`. No torneio C usei W.O. para fechar os dois últimos jogos e os controles
sumiram antes de eu exercitá-los. Fechado depois com a fixture `AUDIT Torneio D — pausa`; ver 9.7.

### 9.4 Premiação nunca produz nada

O painel `PREMIAÇÃO PARCIAL` / `PREMIAÇÃO` exibiu `SEM DADOS SUFICIENTES PARA A PREMIAÇÃO AINDA`
em **todos** os estados: 0/3, 2/3 e 3/3 jogos, com campeão decidido e classificação final fechada.
Encerrar o torneio leva ao reveal VUT e depois ao Dashboard, sem tela de resumo, sem campeão, sem
prêmios.

O denominador comum com a sessão regular: artilharia, MVP e premiação dependem de **ponto com
autor**, e os caminhos que o produto torna mais fáceis — o botão `Rápido`, `Finalizar
manualmente`, `W.O.` — não produzem autor nenhum. Quem usa o produto pelo caminho mais curto chega
ao fim da noite com as telas de recompensa vazias.

### 9.5 A carta VUT do torneio é idêntica à da sessão

A carta revelada ao encerrar o torneio é, campo a campo, a mesma revelada ao encerrar a sessão:
`AUDIT C1`, `50 PON`, `6.3`, atributos `61/60/60/60/60/60`, química com C4 e C7, `CONQUISTAS 1`,
moldura `Multi-cor RARE` e o mesmo selo **`EDIÇÃO ESPECIAL: MVP DA NOITE`** — num torneio cujo
painel de artilheiros está vazio e cujo Histórico registra `MVP: ---`.

O cabeçalho do bloco diz `DESTAQUES DA SESSÃO` mesmo no reveal de torneio.

### 9.6 Craft do torneio

- **Oito controles por linha na tabela de jogos**, todos com peso visual parecido, três deles
  destrutivos (`CANCELAR`, `W.O. A`, `W.O. B`) encostados no primário `INICIAR` e no inofensivo
  `COPIAR`. Num celular de beira de quadra isso é um campo minado.
- **`W.O. A` / `W.O. B` não dizem quem é A e quem é B.** A linha mostra `TIME 2 vs TIME 3`; a
  correspondência é posicional e nunca é declarada. A confirmação nativa (`Registrar W.O. a favor
  de Time 1?`) é o primeiro lugar onde o usuário descobre o que ia acontecer.
- **`Cancelar este jogo?` não diz qual jogo.**
- **A barra de métricas do header rola horizontalmente** com setas `◄ ►` a 783px de largura: quatro
  células que não cabem viram um carrossel.
- Ícones de status (`✓`, `🕐`) e o menu `⋮` de cada linha não têm texto nem rótulo.

### 9.7 Rodada D — os quatro itens que faltavam

Fixture `AUDIT Torneio D — pausa`, Todos contra Todos, 3 times, 15 pontos, criada só para fechar as
lacunas. Nenhum jogo foi disputado.

**Item 1 — `Pronto` na lista, `Em andamento` no detalhe.** Confirmado, e mais forte do que a
passagem anterior registrou. Na lista de Torneios, o card traz o badge **`PRONTO`** e
`Partidas Realizadas: 0`. Abrindo o mesmo torneio, na mesma tela e ao mesmo tempo:

- header: `0/3 JOGOS`, com `EDITAR`, **`PAUSAR`** e **`ENCERRAR`** já habilitados;
- barra de status: `STATUS: **EM ANDAMENTO**`;
- corpo: `TABELA PRONTA — INICIE A PRIMEIRA PARTIDA DO TORNEIO.`;
- CTA primário: `INICIAR TORNEIO`.

Quatro afirmações sobre o mesmo objeto, três delas incompatíveis entre si. E o produto oferece
pausar e encerrar algo que ele mesmo diz que ainda não começou.

**Item 18 — pausar e retomar.** O ciclo funciona: `PAUSAR` → faixa `TORNEIO PAUSADO`,
`STATUS: PAUSADO`, botão vira `RETOMAR` em verde; `RETOMAR` → `STATUS: EM ANDAMENTO` e o botão volta
a `PAUSAR`. Sem confirmação, o que é adequado para uma ação reversível.

**Mas o estado pausado não desabilita nada.** Com `TORNEIO PAUSADO` na tela, o CTA azul
`INICIAR TORNEIO` continua ativo e clicável. Pausar não é um estado, é um rótulo.

**Item 14 — destaques no torneio.** O FAB e o modal `LANCE DE DESTAQUE` são os mesmos da sessão.
Dois destaques criados (`AUDIT C2`, fundamentos `Defesa` e `Levantamento`) e os dois removidos.
Efeito líquido zero. A remoção continua sem confirmação e sem desfazer, e o botão `Remover lance`
continua `opacity-0` até o hover — verificado de novo aqui, nas duas linhas do feed.

**Item 15 — sessões do confronto no torneio.** O painel existe, com estado vazio
`NENHUM EVENTO REGISTRADO.`, passa a listar `J1•#1 · AUDIT C2 · TIME 2 · Lance · Defesa · 🌟` ao
registrar o destaque, e volta ao estado vazio após a remoção. Ciclo completo.

**Não classificado, e resolvido:** o primeiro destaque gravou `defesa` embora eu tivesse clicado em
`Recepção`. Repeti o teste escolhendo `Levantamento` e o evento gravou `levantamento`. O fundamento
é respeitado; o primeiro caso foi clique meu chegando antes do modal renderizar. **Não é defeito do
produto** e não entra na lista.

**Confirmação visual do P0 de sync.** Com sete convidados locais na base, o badge do item
`NUVEM & CONTA` da sidebar exibia **`5`**. São exatamente os cinco com `syncStatus: 'pending'`;
`AUDIT C3` e `AUDIT C6`, sem o campo, não são contados. O contador que o usuário vê e a guarda que
protege os dados leem a mesma função — e ambos ignoram os mesmos dois registros.

**Estado da nav.** Durante todo o wizard, o item `DASHBOARD` da sidebar permaneceu marcado como
ativo. O destaque visual de navegação não acompanha a tela em que o usuário está.

## 10. Correção a uma afirmação anterior deste relatório

A seção 2 registrou que o card do atleta mostra `5` e a revisão mostra `50` para o mesmo convidado,
tratando isso como duas escalas. **Está errado e fica corrigido:** o card mostra `50`; o selo
circular de seleção cobre o último dígito, e o que sobra visível é `5`. É **um** defeito de
oclusão, não uma segunda escala — e é pior do que oclusão estética, porque muda o número que o
usuário lê.

A incoerência de escala continua real e confirmada nos demais pontos: `3` e `50` na revisão, `6.0`
e `6.3` na sessão ao vivo, `nível 6+` na análise de pré-jogo, `50 PON` e `6.3` lado a lado na carta
VUT. Nenhum desses números traz unidade.

## 11. Estado final desta passagem

- `AUDIT Sessao C — 09/08/2026` — encerrada, no Histórico.
- `AUDIT Torneio C — 09/08/2026` — encerrado, 3/3 jogos, no Histórico.
- `AUDIT Torneio D — pausa` — **em andamento, 0/3 jogos**, deixado aberto de propósito: é a fixture
  que permite reexecutar pausar/retomar e os controles contextuais sem recriar nada.
- 7 convidados `AUDIT C1..C7` e 1 jogo órfão `active` permanecem no estado local.
- Servidor de dev encerrado; porta 3000 livre.

Seções 8 e 9 do HANDOFF: **concluídas**. Único item sem execução direta é o 8 da seção 9
(`TournamentBracket`), não aplicável ao formato round-robin usado — exercitá-lo exige um torneio
mata-mata ou grupos + mata-mata.
