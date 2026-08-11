# HANDOFF — Panelinha / Plano 5 Fase 3

> Atualizado em **2026-08-11**, ao integrar o spike A1 e a spec da Fase 3 com o Gate 0 já
> mergeado. Este é o ponto de retomada canônico se o limite da conversa acabar.

## 1. Objetivo em andamento

- Produto: app React + Vite local-first para vôlei amador, com sync opcional via Supabase.
- Prioridade atual do framework: Produto Escalável, depois Experiência.
- Foco imediato: Plano 5 — **Fase 3 (Nova Navegação)**. As duas pré-condições estão satisfeitas:

  1. **Gate 0 — integridade e estado canônico** (PR #21, mergeado em 2026-08-11). Fechou os três
     P0 da auditoria: sync apagando registros locais, atletas descartados pelo balanceador
     (causa real: `genero: null`) e estado operacional contraditório. Entregou
     `src/domain/sessionPhase.ts`, a fonte única que a nova navegação deve ler.
     Spec e plano em `docs/superpowers/`.
  2. **Spike A1 — `SessionContext` na raiz** (PR #20, este branch). Sem ele a árvore remonta ao
     navegar por rotas URL e a sessão ativa se perde. Detalhe na seção Pós-Spike A1 abaixo.

- **A spec de design da Fase 3 está pronta**, em
  `docs/superpowers/specs/2026-08-06-plano-5-fase-3-nova-navegacao-revisao-design.md`: árvore de
  rotas, mapeamento Modules→rotas, estratégia de migração (router-in-parallel + cutover único) e
  as mudanças no input do `ScreenContract` (`setPage` → `navigate`). Ela responde ao
  `impeccable critique` de 2026-08-05 (24/40, 3 P0s) e substitui a §6 da spec de julho onde
  conflitar. **Próximo passo é `superpowers:writing-plans`, não novo brainstorming.**

- Fase 2 (Screen Contracts) concluída em 2026-08-04; Fase 1 (reset + cutover) em 2026-08-03.

### Agenda — decidido em 2026-08-11: `/agenda` global

Num brainstorming de 2026-08-11, a Agenda chegou a ser discutida como "primeiro bloco do Início,
sem item próprio na sidebar". **Essa direção foi descartada.** Vale a spec da Fase 3: `/agenda`
como **rota global**.

O argumento contra a rota global era que um item de sidebar chamado Agenda apontando para `/`
competiria com Início no mesmo destino. Isso valia para a spec de julho, em que Agenda não tinha
rota própria — a spec revisada resolve dando a ela `/agenda` de verdade, e a competição deixa de
existir.

Além disso, a §12 da spec base (`2026-07-22-scalable-product-restructure-design.md`, linha 289)
lista Agenda entre as quatro áreas globais aprovadas — Início, Comunidades, Agenda, Meu perfil.
Rebaixá-la foi justamente o P0-1 da crítica de 2026-08-05. **Não reabrir sem decisão explícita de
produto.**

## Pós-Spike A1 (Plano 5 — gate de infra da Fase 3)

Pré-requisito da Fase 3 (Nova Navegação) satisfeito em **2026-08-05**. O estado da sessão
ativa (`activeSession`/`games`/`pointEvents`/`gameReports`/`teams`/`sessions`/`sessionReports`)
vivia em `useSessions()` chamado no `App.tsx` (ho local do shell). Hoje `App.tsx` nunca
desmonta (`AppRouter` é `/*` catch-all), então o state sobrevive; mas na Fase 3 (rotas URL
react-router v7) a árvore remonta ao navegar e perderia placar/sorteio/heartbeat sem um
contexto acima de `<App/>`.

- **Spike A1 (escopo completo, escolhido pelo usuário):** extrai `SessionContext` que detém o
  state de `useSessions()` e o eleva à raiz (`main.tsx`), acima de `<AppRouter/>`. Padrão
  espelhado em Toast (PR #16): Context + hook consumer no mesmo `use*.ts`, Provider one-liner
  que injeta o store externo — sem reimplementar `useSessions` (já persiste/normaliza/limpa
  órfãos/propaga knockout).
- **Arquivos:** `src/ui/common/useSession.ts` (Context + `SessionContextValue` + `useSession()`
  com guard PT-BR), `src/ui/common/SessionProvider.tsx` (Provider one-liner),
  `src/main.tsx` (`<SessionProvider>` dentro de `<ToastProvider>` envolvendo `<AppRouter/>`),
  `src/App.tsx` (`useSessions()` → `useSession()`, nome `sess` preservado, ~120 refs intocadas),
  `src/app/AppRouter.spec.tsx` (harness envolve `<AppRouter/>` em `<SessionProvider>`).
- **Gate de infra Fase 2 intacto:** views e o novo contexto não importam `@storage`/`@infra`.
- **Verificação:** `lint` (tsc --noEmit) + `test:unit` (699) + `test:ui` (136) + `build` verdes.
- **Prova do gate A1:** Provider acima de `<App/>` detém o state — desmontar/remontar `<App/>`
  (rotas URL Fase 3, StrictMode double-mount, HMR) não destrói a sessão ativa.
- **Não toca em rotas URL (Fase 3);** views continuam via `ScreenContract` (Fase 2 preservada).
  `useCloudSync` sem redesign: `CloudSyncDeps` inalterada, só a origem dos setters.
- **Estado:** spike A1 fechado. O `impeccable critique` exigido pelo §6.9 foi rodado em
  2026-08-05 (24/40) e respondido pela spec da Fase 3.

> Os números de verificação acima (`test:unit` 699 / `test:ui` 136) são do momento do spike, em
> 2026-08-05. Depois do Gate 0 a suíte está em 734 / 139.

## 1.1 Auditoria do produto — concluída

A Fase 3 estava condicionada a uma auditoria visual e funcional completa do produto, incluindo as
superfícies internas de sessão e de torneio — estados que só aparecem depois de iniciar partidas,
registrar pontos e concluir fixtures.

**Essa auditoria foi concluída** (seções 8 e 9 desta página: 18/18 e 20/21, com o único item
faltante não aplicável ao formato usado). Os bloqueadores que ela levantou estão fechados pelo
Gate 0. O que ela deixou aberto e ainda não é da Fase 3 está registrado em
`.impeccable/audit/2026-08-09-full-product/pass-c/report.md`.

## 2. Estado do repositório

- Workspace: `C:\Users\Matheus Silva\antigravity\Volley`
- Branch de trabalho: `worktree-plano-5-fase-3-navegacao`
- `main` em `98d712a` (spike A1, PR #20), logo após `f2ce974` (Gate 0, PR #21).
- Servidor local: **parado**; porta 3000 livre.
- Fase 1 do Plano 5: reset/cutover concluído em 2026-08-03.
- Fase 2 do Plano 5: 9/9 telas migradas para `ScreenContract<Model, Intent>` e gate fechado.
- Gate 0 (integridade e estado canônico): concluído em 2026-08-11.
- Spike A1 (`SessionContext` na raiz): concluído e mergeado.
- Fase 3: **não iniciada**, mas desbloqueada — spec de design pronta, próximo passo é
  `superpowers:writing-plans`.
- `App.tsx` ainda é o shell monolítico e usa `activeModule` + `page` +
  `renderActiveContent()`; os módulos autenticados continuam em `/`.
- **Nenhum PR aberto.** #19 foi fechado sem merge em 2026-08-11 (duplicata: seu conteúdo já
  estava em `main` via #18 e #20, e as linhas exclusivas dele eram código pré-Gate-0 que o merge
  teria revertido).

### Working tree

Há vários arquivos/diretórios não rastreados que pertencem ao usuário ou ao ambiente (`.agents/`,
`.codex/`, `.claude/`, `.github/hooks/`, `AGENTS.md`, lockfiles e artefatos de sessão). **Não apagar,
resetar, adicionar ou versionar em massa.** Os artefatos `.impeccable/` desta auditoria também estão
não rastreados por design.

## 3. Processo e skills obrigatórios

O trabalho corrente segue:

1. `product-design:audit` — screenshots primeiro, cada imagem aberta/validada e notas ligadas à
   evidência;
2. `browser:control-in-app-browser` — usar exclusivamente o Codex In-app Browser para o produto;
3. `superpowers:writing-plans` — este handoff foi atualizado antes de continuar a execução;
4. `superpowers:brainstorming` — não implementar a Fase 3 antes de o desenho ser aprovado;
5. `superpowers:verification-before-completion` — nenhum “concluído” sem verificação fresca.

O preflight de contexto do Product Design não pôde rodar: o Python global não existe e o pacote
instalado não contém `user_context_preflight.py` no caminho documentado. Não havia contexto salvo na
rodada anterior; usar este repositório, as capturas atuais e a spec como fontes.

## 4. Auditoria já concluída

### Evidência

- Relatório consolidado:
  `.impeccable/audit/2026-08-09-full-product/report.md`
- Matriz de cobertura:
  `.impeccable/audit/2026-08-09-full-product/coverage.md`
- Avaliação A:
  `.impeccable/audit/2026-08-09-full-product/capture-a.md`
- Avaliação B:
  `.impeccable/audit/2026-08-09-full-product/capture-b.md`
- Registro de mutações:
  `.impeccable/audit/2026-08-09-full-product/mutations.md`
- Screenshots A:
  `.impeccable/audit/2026-08-09-full-product/screenshots/`
- Screenshots B:
  `.impeccable/audit/2026-08-09-full-product/screenshots-b/`
- Crítica Impeccable versionada:
  `.impeccable/critique/2026-08-10T00-00-56Z__src-app-tsx.md`

Verificação fresca anterior: **37 evidências A + 40 evidências B aceitas = 77**; uma captura de
loading da B foi rejeitada. Links locais do relatório estavam íntegros. Critique score: **15/40**,
com **2 P0** e **5 P1**.

### Superfícies já percorridas

- Shell desktop/tablet e drawer.
- Oito módulos globais: Dashboard, Torneios, Jogadores, Ranking, Histórico, Nuvem & Conta,
  Configurações e Gestão.
- Comunidades: lista, criação imediata, entrar por código e dez áreas — Resumo, Atletas, Presença,
  Lista WhatsApp, Sessões, Ligas, Ranking, Membros, Regras e Dados.
- Atletas: lista, busca, criar, editar, avaliação, VUT, carreira, convidado e confirmação de
  exclusão cancelada.
- Wizard regular: Sessão, Atletas, Formato, Regras, Revisão, Times e transição após `Gerar tabela`.
- Wizard de torneio: as sete etapas, configurações/vínculos e tabela.
- Estado de sessão/torneio antes da primeira partida.

## 5. Mutações já existentes na conta/estado local

O usuário autorizou afetar a conta e os rascunhos para completar a auditoria.

- Comunidade `NOVA COMUNIDADE`.
- `AUDIT Convidado 1` a `AUDIT Convidado 7`.
- Torneio `Torneio — 09/08/2026`, tabela gerada, nenhuma partida iniciada na última captura.
- Sessão regular `Sessão — 09/08/2026`, marcada pronta/ativa antes da primeira partida.
- Uma sessão anterior `Sessão — 28/06/2026` foi ativada inesperadamente na primeira passagem.
- Nenhum ponto/placar/encerramento havia sido registrado até este handoff.

Registrar toda nova mutação imediatamente em
`.impeccable/audit/2026-08-09-full-product/mutations.md`. Não limpar fixtures antes de capturar
histórico, premiação e reveal; limpeza é uma decisão posterior.

## 6. Achados bloqueadores já confirmados

### P0 — integridade do elenco

Nove atletas selecionados resultaram em apenas sete distribuídos (3 + 2 + 2), mas o produto liberou
tabela/ativação. O resumo continuou exibindo nove IDs e `7M / 0F`.

Hipótese observável: `selectedPlayerIds` pode conter IDs ausentes do catálogo `players`; a UI conta
IDs no resumo, enquanto `SessionWizard.tsx:210-212` filtra apenas jogadores existentes para o
balanceador. Não tratar como causa fechada sem diagnóstico próprio.

### P0 — máquina de estados contraditória

- Torneio aparece `Pronto` na lista e `Em andamento` no detalhe, embora ainda ofereça
  `Iniciar Torneio`.
- Jogo Livre mostra `Sessão ativa`/`Partida em andamento` antes de `Começar Primeira Partida`.

### P1 — `Gerar tabela` tem semântica diferente por formato

- Torneio avança para a etapa 7 e oferece `Iniciar torneio`.
- Jogo Livre usa `confirmDivision()` para persistir e navegar direto ao estado ativo; a etapa 7
  prometida pelo stepper não aparece.

### P1 — arquitetura de informação

- Todos os destinos permanecem em `/`.
- Comunidades fica escondida sob Jogadores.
- A spec propõe cinco áreas comunitárias state-driven, mas a auditoria recomenda subrotas reais.
- `GestaoView` é administração global, não gestão comunitária.
- Backup/importação são globais e não devem migrar automaticamente para a comunidade.

## 7. Pedido atual ainda não concluído

**Percorrer todas as superfícies internas da sessão ativa e do torneio ativo.** O usuário autorizou
“fazer o que for necessário”. Isso permite usar as fixtures `AUDIT`, iniciar partidas, registrar
pontos de teste, desfazer quando necessário e finalizar fixtures para desbloquear histórico,
premiação e VUT reveal.

Esta autorização não inclui sincronizar manualmente, importar/restaurar backup, alterar papéis,
apagar comunidade/atletas reais ou compartilhar externamente. Use somente os fixtures `AUDIT` e os
rascunhos criados pela auditoria.

### Checkpoint de execução — passagem C (2026-08-10, Claude Code)

**O estado das passagens A/B foi perdido.** Ele existia apenas no `localStorage` do Codex In-app
Browser; o processo do Codex não está mais em execução e nada daquilo tinha subido para a nuvem.
Depois do login em outro navegador, o estado sincronizado trouxe 0 sessões, 0 torneios, 0
comunidades e nenhum atleta `AUDIT`. A confirmação nativa pendente de `Encerrar Sessão` morreu
junto e **não precisa mais ser clicada**.

A passagem C refez as seções 8 e 9 do zero, com fixtures próprias:

- seção 8 (sessão regular): **concluída**, itens 1–18, com `AUDIT Sessao C — 09/08/2026`;
- seção 9 (torneio): **concluída, 20/21**, com `AUDIT Torneio C — 09/08/2026` e a rodada
  complementar `AUDIT Torneio D — pausa`, que fechou os itens 1, 14, 15 e 18. O item 8
  (`TournamentBracket`) é não aplicável ao round-robin usado e exige mata-mata para ser exercitado;
- reveal VUT e Histórico capturados nos dois fluxos, pela primeira vez na auditoria.

Relatório completo, com achados e correções: `.impeccable/audit/2026-08-09-full-product/pass-c/report.md`.

**Achado que muda o diagnóstico do P0 — causa raiz fechada:** `GuestPlayerModal.handleSave`
(`GuestPlayerModal.tsx:100-136`) cria o convidado **sem `syncStatus`**, enquanto o cadastro normal
grava `syncStatus: 'local'` (`usePlayers.ts:245`). `countPendingChanges` conta apenas `'local'` e
`'pending'` (`syncStatus.ts:16`), então o convidado fica invisível para a contagem que serve de
guarda contra o download automático (`cloudSyncStartupUseCases.ts:58-63`). Com a contagem em zero,
o startup baixa e `applyResult` (`useCloudSync.ts:154-161`) sobrescreve o local, levando o registro
sem `cloudId`. A guarda existe e está correta — só não enxerga o registro que precisa proteger.
Isso explica também por que o efeito parece intermitente. É a causa real do "9 selecionados, 7
distribuídos". A hipótese antiga (`SessionWizard.tsx:210-212`) foi verificada e **descartada**.

**Corrigido em 2026-08-10.** Ao medir o estado real, o contador de pendências saltou de **5 para
48**: não eram só os 2 convidados: 17 eventos de ponto, 9 times, 8 jogos, 3 sessões e 4 relatórios
também estavam invisíveis para a guarda. **Nenhuma entidade criada localmente nasce com
`syncStatus`** — o convidado era só o sintoma visível.

- `src/logic/syncStatus.ts` — registro sem `syncStatus` **e** sem `cloudId` passa a contar como
  pendente. É a guarda compartilhada por todas as coleções e é o que resolve de fato.
- `src/components/player/GuestPlayerModal.tsx` — convidado nasce com `syncStatus: 'local'` e
  `updatedAt`, como o cadastro normal.
- `src/logic/syncStatus.test.ts` — um teste codificava o bug (`ignores ... undefined statuses`) e
  foi corrigido; dois casos novos cobrem a regra.

Verificado: 701 unit + 136 UI passando, typecheck e build limpos; no navegador, reload preservou os
9 atletas com `AUDIT C3`/`AUDIT C6` ainda sem `syncStatus`, sem disparar o download.

**Ainda em aberto:** `applyResult` pode remover registro local sem `cloudId`, e o caminho de troca
de dono do cache (`cloudSyncStartupUseCases.ts:51-56`) ignora `pendingChanges` por design. Decidir
se ali também se preserva o que nunca subiu.

Além dela, um segundo defeito independente foi reproduzido três vezes: o balanceador descarta
atletas com `atributos: {}`, e o painel de diagnóstico não menciona a perda.

**Evidência desta passagem não tem arquivos `.jpg`** — o navegador desta sessão devolve screenshots
para inspeção mas não os grava em disco, e o projeto não tem Playwright/Puppeteer. Cada estado foi
aberto e validado no momento da captura; a evidência persistida é o estado do `localStorage`, o DOM
e as medições no relatório.

Para retomar: **não é preciso recriar nada.** As seções 8 e 9 estão fechadas. `AUDIT Torneio D —
pausa` ficou em andamento com 0/3 jogos de propósito — é a fixture pronta para reexecutar
pausar/retomar e os controles contextuais sem montar tudo de novo.

`coverage.md` e a crítica foram atualizados. Score:
**15/40 (2 P0, 5 P1) → 11/40 (3 P0, 7 P1)**, em
`.impeccable/critique/2026-08-10T12-04-02Z__src-app-tsx.md`.

O servidor de dev foi **encerrado**; a porta 3000 está livre e nenhum processo `node` ficou
pendurado.

Com a auditoria fechada, as decisões da seção 13 estão liberadas — mas a evidência recomenda uma
ordem: **integridade de dados antes de navegação.** Enquanto o estado local e o da nuvem
discordarem em silêncio, nenhuma rota nova sobrevive ao primeiro reload.

### Checkpoint de execução — sessão regular (passagem anterior, estado perdido)

Estado confirmado às **21:18 BRT**:

- pasta criada e preenchida: `.impeccable/audit/2026-08-09-full-product/session-live-tabs/`;
- evidências aceitas `01` a `19`;
- jogo 1 finalizado: Time 1 15×0 Time 2;
- jogo 2 finalizado: Time 1 15×0 Time 3;
- jogo 3 finalizado: Time 1 0×15 Time 2;
- modal detalhado percorrido nas abas `Ponto Nosso` e `Erro Adversário`, incluindo autor,
  fundamento, assistência, categorias avançadas e subtipo de erro;
- um ponto detalhado foi registrado e desfeito; efeito líquido zero;
- um destaque `Defesa` para `AUDIT Convidado 1` foi criado e removido; efeito líquido zero;
- `Próxima Batalha`, `Próximo da Fila`, reentrada, rotação e classificação foram validados;
- `Copiar Próximo` abriu alerta nativo, posteriormente dispensado; clipboard lido vazio;
- `Encerrar Sessão` foi acionado após o terceiro jogo. A confirmação nativa permaneceu aberta e
  bloqueou duas chamadas de automação, reiniciando o kernel do navegador. **Não repetir o clique**:
  primeiro recuperar a aba, chamar `getJsDialog()` e aceitar a confirmação existente, ou pedir ao
  usuário um único clique manual se a caixa ainda estiver visível;
- após confirmar, ainda faltam resumo/premiação, VUT reveal (se houver), Histórico e exportadores;
- a auditoria interna do torneio ainda não começou nesta passagem.

Mutações detalhadas e reversões estão em
`.impeccable/audit/2026-08-09-full-product/mutations.md`.

## 8. Matriz obrigatória — sessão regular

Criar a pasta:

`.impeccable/audit/2026-08-09-full-product/session-live-tabs/`

Capturar e validar, em ordem:

1. Estado pré-primeira-partida.
2. Confirmação/transição de `Começar Primeira Partida`.
3. Placar ativo com os dois `TeamScoreCard`.
4. Ponto rápido do time sem autor.
5. Modal `Registrar Detalhes do Ponto` — aba `Ponto Nosso`.
6. Autor do ponto + fundamento + assistência/levantador.
7. Modal — aba `Erro Adversário`.
8. Categorias de erro: Saque, Recepção, Levantamento, Ataque, Bloqueio, Defesa,
   Rede/Invasão, Líbero, Outro e categorias avançadas.
9. Confirmação de ponto e mudança do placar.
10. `Desfazer Ponto` e recuperação do placar.
11. Fila/rotação: `Próxima Batalha`, `Próximo da Fila`, fila vazia e `Iniciar Próximo Jogo`.
12. Destaques/lances: abrir FAB/formulário, criar um destaque `AUDIT`, listar e remover somente o
    destaque criado.
13. Aviso/ownership da sessão e eventual confirmação de assumir controle, se aparecer.
14. Compartilhar/copiar próxima partida: abrir apenas estados seguros; não enviar externamente.
15. Encerrar partida e transição para a próxima.
16. Encerrar sessão com confirmação, resumo e premiação.
17. Reveal VUT pós-sessão, se produzido.
18. Histórico detalhado da sessão finalizada e exportadores apenas em preview/cópia segura.

Para cada etapa: DOM recente → ação única → espera estável → screenshot → abrir via `view_image` →
aceitar/rejeitar → nota de UX/design/acessibilidade.

## 9. Matriz obrigatória — torneio

Criar a pasta:

`.impeccable/audit/2026-08-09-full-product/tournament-live-tabs/`

Capturar e validar:

1. Lista `Pronto` e detalhe contraditório pré-início.
2. `Iniciar Torneio` e primeira partida.
3. Header: Sair, Editar, Pausar/Retomar e Encerrar.
4. Status, formato, rodada e regra.
5. Placar ativo e os dois times.
6. PointModal nas duas abas (`Ponto Nosso`/`Erro Adversário`) e um evento de teste.
7. Desfazer ponto.
8. Tabela/chave do torneio (`TournamentBracket`) conforme formato.
9. Classificação e critérios de desempate.
10. Tabela de jogos e cada controle contextual: Iniciar/Pausar, mover para cima/baixo, W.O. A/B,
    Editar placar, Cancelar, WhatsApp e Copiar. Confirmações destrutivas devem ser capturadas e
    canceladas, salvo quando uma fixture `AUDIT` precisar ser concluída.
11. Artilheiros.
12. MVP parcial.
13. Premiação parcial (`AwardsPanel`).
14. Destaques e remoção apenas do destaque `AUDIT` criado.
15. Sessões do confronto.
16. Compartilhar classificação, artilharia, jogo e resumo final sem envio externo.
17. Finalizar jogos suficientes para observar `Próxima Partida`, placar final e avanço de rodada.
18. Pausar/retomar torneio.
19. Encerrar torneio, resumo final, classificação final, MVP e prêmios.
20. Histórico detalhado, bracket final e exportadores.
21. Reveal VUT pós-torneio, se produzido.

## 10. Estados transversais a observar

- Loading e processamento.
- Empty/no-data antes e depois do primeiro ponto.
- Confirmação, cancelamento e recuperação.
- Controles desabilitados e explicação do motivo.
- Status anunciado no header, Dashboard, lista e detalhe.
- Foco, nomes acessíveis, `aria-pressed`/`aria-current`, dependência de cor e microtexto.
- Reflow em desktop e pelo menos um viewport tablet/mobile nos painéis mais densos.
- Nomes longos/truncamento.
- Consistência entre quantidade selecionada, quantidade distribuída e participantes da partida.
- Persistência ao sair/voltar e recarregar a rota `/`.

## 11. Runbook de execução

1. Confirmar que `HANDOFF.md` contém este runbook e verificar o diff antes de qualquer interação.
2. Iniciar `npm run dev -- --host 127.0.0.1` oculto; registrar PIDs e confirmar porta 3000.
3. Conectar ao Codex In-app Browser com binding próprio; ler documentação completa da superfície.
4. Abrir o produto sem recarregar uma aba útil; se a autenticação expirou, pedir login e esperar.
5. Capturar o estado inicial antes da primeira mutação.
6. Executar sessão regular conforme seção 8, registrando cada mutação.
7. Executar torneio conforme seção 9.
8. Atualizar `coverage.md`, `report.md`, `capture-a.md`/novo relatório complementar e a crítica
   Impeccable com os novos achados.
9. Reavaliar o score e os P0/P1; versionar nova snapshot via `critique-storage.mjs`.
10. Parar apenas os PIDs do servidor criado nesta rodada e confirmar porta 3000 livre.
11. Rodar verificação fresca dos arquivos, links, contagens e estados alegados.
12. Entregar relatório inline com screenshots e lista numerada de todas as etapas.

## 12. Critério de conclusão desta auditoria

A auditoria complementar só pode ser chamada de concluída quando:

- toda linha das seções 8 e 9 tem screenshot aceito ou bloqueio nomeado;
- cada screenshot foi aberto em resolução original;
- todas as mutações estão registradas;
- sessão e torneio finalizados aparecem no Histórico, ou o motivo técnico do bloqueio está provado;
- premiação/VUT reveal foram capturados ou marcados honestamente como não produzidos;
- o relatório e a crítica foram atualizados;
- o servidor local foi encerrado;
- nenhuma ação fora do escopo foi executada.

## 13. Decisões de design pendentes após a auditoria

Não decidir até a evidência complementar estar pronta:

1. Inserir um `Gate 0` de integridade do elenco + máquina de estados antes da Fase 3.
2. Usar subrotas reais para as cinco áreas comunitárias.
3. Agenda como rota própria ou seção do Início.
4. Separar Administração da plataforma, Gestão da comunidade e Dados/backup.
5. Modelo único de transição `rascunho → pronto → partida em andamento → encerrado` para Jogo Livre
   e Torneio.

## 13.1 Faxina de branches — 2026-08-11

Todos os branches antigos foram analisados e removidos. Nenhum PR ficou aberto. Registro do que
foi descartado **com análise**, para ninguém redescobrir e achar que encontrou trabalho perdido:

**`codex/project-closeout`** (14 commits, 29/07) — descartado. Cada item tem substituto melhor
em `main`:

- `fix(security): make career totals view invoker-safe` — aplicaria `security_invoker = true`
  na view `career_totals`, fazendo-a respeitar o RLS de `career_events`. **Contradiz decisão de
  produto posterior:** o schema em `main` documenta que a view é global de propósito ("o card de
  terceiros fica global e correto sem revelar em quais comunidades a pessoa joga"). Esse
  comentário **não existe no branch** — a migration é anterior à decisão. Aplicá-la hoje
  regrediria a feature.
- `docs: formally close Plan 3` — o fechamento real está no programa mestre
  (`| 3 | ... | Concluido (main, 2026-07-30) |`), com a nota de escopo. O
  `plan3-closeout-2026-07-29.md` do branch é anterior e menos completo.
- Spec e plano de `session-device-control-offline` (29/07, 252 + 730 linhas) — **sucedidos pelo
  Plano 4** (`docs/superpowers/plans/2026-07-30-plano-4-offline-operacional.md`), que está em
  `main` e consta como **concluído em 2026-07-31**.
- `chore(deps)` react-router `^7.17.0` → `^8.3.0` — major bump que `main` não adotou.
- `style: format prettier` — refeito melhor pelo PR #18 (`endOfLine: lf`).
- `fix(migrations)` ×2 e `fix(career)` — pressupõem migrations que `main` nunca recebeu.

**`feat/plan4-session-control`** (2 commits, 29/07) — descartado. `sessionOperations.ts` (105
linhas) + tipos (157) + **257 linhas de teste**, sem nenhum consumidor em `main`. Modelava
*operações causais* (`deriveEffectiveOperations`, `validateOperationDependency`,
`projectSessionOperations`). O produto seguiu por outro modelo — *posse e heartbeat* — que foi
implementado e fechado: `sessionOwnershipUseCases.ts`, `SessionOwnershipNotice.tsx`,
`sessionOwnershipCloudService.ts`. Abordagens diferentes para o mesmo problema; a segunda venceu.

**`worktree-reposicionar-export-import`** (1 commit, 04/08) — descartado por decisão do usuário em
2026-08-11. Commit `3e94b16` `refactor(settings): gate export/import behind offline mode, drop
orphan Dashboard props`, que existia **apenas no disco local** (sem remoto, fora de `main`).
Tocava `src/App.tsx` (64 linhas) e `Dashboard.tsx` — exatamente a área que a Fase 3 vai reescrever,
o que motivou o descarte em vez do merge. Recuperável pelo reflog enquanto ele durar.

**Pergunta em aberto, herdada desta análise:** `src/infra/outbox/` **não existe em `main`**, mas a
linha do Plano 4 no programa mestre diz "e o outbox" como escopo restaurado e concluído. Ou o
outbox vive noutro caminho, ou aquela linha está otimista. Vale confirmar um dia — não bloqueia
a Fase 3.

## 14. Referências principais

- Spec de design da Fase 3 (a que vale):
  `docs/superpowers/specs/2026-08-06-plano-5-fase-3-nova-navegacao-revisao-design.md`
- Spec da Fase 3 (base de julho, substituída na §6 pela acima):
  `docs/superpowers/specs/2026-07-31-plano-5-screen-contracts-reset-navigation-design.md`
- Plano mestre:
  `docs/superpowers/plans/2026-07-22-scalable-product-program.md`
- Plano concluído da Fase 2:
  `docs/superpowers/plans/2026-08-03-plano-5-fase-2-screen-contracts.md`
- Shell/router:
  `src/App.tsx`, `src/app/AppRouter.tsx`, `src/application/appShellViewModel.ts`
- Wizard:
  `src/components/session/SessionWizard.tsx`, `src/hooks/useSessionWizard.ts`,
  `src/application/sessionLifecycleUseCases.ts`
- Sessão/tournament live:
  `src/components/live/SessionActiveView.tsx`, `src/components/live/TournamentActiveView.tsx`,
  `src/components/live/PointModal.tsx`, `src/components/live/TeamScoreCard.tsx`,
  `src/components/live/AwardsPanel.tsx`, `src/components/live/HighlightFab.tsx`

## 15. Comandos de verificação do projeto

Ordem CI definida em `AGENTS.md`:

```text
npm run typecheck
npm run lint:eslint
npm run format:check
npm test
npm run build
```

Não executar a suíte completa apenas por editar artefatos de auditoria. Executá-la quando houver
mudança em código-fonte, ou antes de fechar uma fase de implementação.
