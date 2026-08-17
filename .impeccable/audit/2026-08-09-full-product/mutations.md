# Mutations — Capture B

| Momento | Ação | Entidade/nome | Finalidade | Cleanup |
|---|---|---|---|---|
| Entre `10-comunidades-lista` e `11-comunidade-criacao` (captura B, 2026-08-09) | Acionou `Nova` | Comunidade `NOVA COMUNIDADE` | Acessar as 10 abas da comunidade durante a auditoria | Possível excluir posteriormente, mas **não será excluída nesta auditoria** por ser ação irreversível. |
| `24-wizard-atletas-selecionados` | Selecionou atletas existentes | `teste`, `TESTEADM` no rascunho regular | Vencer a validação mínima do wizard | Reversível via seleção do rascunho, não executada após o avanço. |
| `27-wizard-convidado-1` a `28-wizard-convidado-2` e antes de `32-wizard-elenco-minimo` | Criou convidados temporários | `AUDIT Convidado 1` a `AUDIT Convidado 7` | Vencer as validações de 4 e 9 atletas do wizard | Possível remover posteriormente; não removidos nesta auditoria para não executar exclusão. |
| `34-wizard-times` a `35-wizard-times-concluido` | Gerou balanceamento | Equipes do rascunho regular | Cobrir a etapa Times | Reversível apenas refazendo/alterando o rascunho; não alterado depois da captura. |
| `36-wizard-tabela` | Acionou `Gerar tabela` | Rascunho `Sessão — 28/06/2026` | Cobrir a etapa Tabela | **Efeito inesperado:** o produto iniciou uma sessão ativa antes de qualquer botão de início final. Não foi iniciada partida, registrado placar nem encerrada sessão. Limpeza exigiria encerrar/excluir, ações proibidas nesta auditoria. |
| `38-torneio-entrada` | Acionou `Novo Torneio` | Rascunho `Torneio — 09/08/2026` | Cobrir a entrada e as regras específicas de torneio | Rascunho permanece sem iniciar torneio; não será descartado, iniciado ou excluído nesta auditoria. |
| `39-torneio-atletas` | Selecionou filtrados | 9 atletas existentes/convidados no rascunho de torneio | Vencer validação e alcançar as regras específicas | Reversível no rascunho; não alterado depois da captura. |
| `a27-rascunho-torneio-etapa-7-tabela` a `a29-torneio-detalhe-ativo-sem-partida` | Gerou e persistiu tabela de torneio | `Torneio — 09/08/2026` | Validar as sete etapas e o estado anterior à primeira partida | O torneio permanece registrado; nenhuma partida foi iniciada. A lista o chama de `Pronto`, mas o detalhe o chama de `Em andamento`. |
| `a30-rascunho-regular-etapa-1-sessao` a `a37-dashboard-sessao-ativa-retorno` | Criou novo rascunho regular, gerou times e acionou `Gerar tabela` | `Sessão — 09/08/2026` | Repetir independentemente o wizard regular e validar o limite seguro | A sessão permanece pronta/ativa antes da primeira partida; nenhuma partida, ponto ou placar foi iniciado. |
| Entre `a27` e `a28` | Abriu `Cancelar Criação`; o usuário escolheu cancelar a confirmação | Rascunho de torneio | Observar recuperação/controle sem descartar dados | Nenhum descarte ocorreu; diálogo nativo não foi capturável enquanto aberto. |
| `session-live-tabs/02` a `session-live-tabs/10` | Iniciou o jogo 1, registrou um ponto detalhado e acionou `Desfazer Ponto` | `Sessão — 09/08/2026` | Cobrir placar, modal de ponto, autores, fundamentos, assistências, erros e reversão | O ponto detalhado foi removido; efeito líquido zero. A automação exibiu `Não informado` no evento antes da reversão, mas isso não foi classificado como bug porque os cliques rápidos podem ter usado localizadores já renderizados. |
| `session-live-tabs/11` a `session-live-tabs/13` | Criou um destaque `Defesa` para `AUDIT Convidado 1` e o removeu | `Sessão — 09/08/2026` | Cobrir formulário, cartão registrado e remoção de destaque | Destaque removido; efeito líquido zero. A remoção ocorreu sem confirmação. |
| `session-live-tabs/14` a `session-live-tabs/19` | Registrou 45 pontos rápidos em três jogos e iniciou os jogos 2 e 3 | `Sessão — 09/08/2026` | Cobrir término de confronto, fila, reentrada, rotação completa e classificação | Jogo 1: Time 1 15×0 Time 2. Jogo 2: Time 1 15×0 Time 3. Jogo 3: Time 1 0×15 Time 2. Resultados preservados na sessão de auditoria. |
| Após `session-live-tabs/19` | Acionou `Encerrar Sessão`, abrindo a confirmação nativa | `Sessão — 09/08/2026` | Alcançar premiações, resumo final e histórico | A caixa nativa bloqueou duas chamadas de automação e reiniciou o kernel do navegador. O encerramento só deve ser considerado efetivado após confirmação visual/DOM; não repetir o clique enquanto a caixa estiver aberta. |

# Mutations — Passagem C (Claude Code, 2026-08-10)

Contexto: o estado das passagens A/B ficou apenas no `localStorage` do Codex In-app Browser e não
existe neste ambiente. Ver `pass-c/report.md` seção 0.

| Momento | Ação | Entidade/nome | Finalidade | Cleanup |
|---|---|---|---|---|
| 01:05 BRT, antes de qualquer captura | Instrumentou `window.confirm` com log de mensagem e resposta | Página do produto | O navegador desta sessão responde `false` automaticamente e tornaria toda ação destrutiva um no-op silencioso | Somente em memória da aba; some ao recarregar. Cada resposta `true` está registrada na coluna de finalidade das linhas abaixo. |
| 01:09:07 BRT | `Descartar` no card de rascunho pendente do Dashboard, com `confirm` respondido `true` | Rascunho `Torneio — 09/08/2026` (vazio, criado ~00:56 fora da auditoria) | Liberar o Dashboard para criar a sessão regular da seção 8 | Rascunho não tinha atletas nem tabela; recriável. **Efeito colateral observado:** o catálogo caiu de 9 para 2 atletas — os 7 convidados `123`…`1231231231231` sumiram junto. Não confirmado por teste controlado; ver `pass-c/report.md` seção 3. |
| 01:1x BRT | Criou 7 convidados pelo `+ CONVIDADO` do wizard | `AUDIT C1` a `AUDIT C7` | Recompor um elenco de 9 para refazer a matriz da seção 8 | Permanecem no catálogo. Prefixo `AUDIT` para o usuário identificar e remover quando quiser. |
| 01:1x BRT | Criou sessão pelo wizard | `AUDIT Sessao C — 09/08/2026`, Jogo Livre, 3 times, 12 pontos, 3 Direto | Fixture da seção 8 | Permanece. Nome com prefixo `AUDIT`. |
| 01:2x BRT | `Gerar Times Equilibrados` | 3 divisões alternativas | Reproduzir o P0 de integridade do elenco | Reprodução confirmada: 9 selecionados → 7 distribuídos, nas três divisões. |
| 01:2x BRT | Trocou a posição de sessão de `teste` de `Levantador` para `Ponteiro` e regerou | `AUDIT Sessao C` | Teste controlado para descartar a posição como causa do P0 | `teste` continuou fora dos times. Alteração fica no `playerPositions` da sessão de auditoria; não afeta o cadastro do atleta. |
| 01:22:15 BRT | Recarregou a página com `AUDIT C1` recém-criado | Catálogo de atletas | Teste controlado do sumiço de convidados | Confirmado: o auto-download de startup apagou `AUDIT C1`. Os 7 convidados foram recriados depois. |
| 01:2x–01:35 BRT | Registrou 14 pontos, 1 destaque e 1 desfazer na sessão | `AUDIT Sessao C` | Matriz da seção 8 | Jogo 1: Time 1 12×2 Time 2. Destaque `defesa`/`AUDIT C1` criado e removido — efeito líquido zero. Ponto detalhado e ponto de erro confirmados e mantidos. |
| ~01:36 BRT | `Encerrar Sessão`, com `confirm` respondido `true` | `AUDIT Sessao C` | Alcançar premiação, VUT e Histórico | Sessão **encerrada**. Reveal VUT capturado (2 cartas). Jogo 2 ficou órfão com `status: active` dentro da sessão `finished`. |
| ~01:40 BRT | Criou torneio pelo wizard | `AUDIT Torneio C — 09/08/2026`, Todos contra Todos, 3 times, 12 pontos | Fixture da seção 9 | Permanece, encerrado, no Histórico. |
| ~01:45 BRT | `W.O. a favor de Time 1?` e `Cancelar este jogo?` com `confirm` respondido `false` | Jogo #2 do torneio | Capturar confirmações destrutivas sem executá-las | Nenhum efeito; estado inalterado. |
| ~01:46 BRT | `Finalizar manualmente` (`confirm` `true`), depois `W.O. A` no jogo #2 e `W.O. B` no jogo #3 | Jogos do torneio | Fechar os 3 jogos para observar avanço de rodada, classificação final e encerramento | Jogo #1 `2×1`, #2 `12×0`, #3 `0×12`. Resultados preservados. |
| ~01:48 BRT | `ENCERRAR` torneio | `AUDIT Torneio C` | Resumo final, premiação e reveal VUT | Torneio **encerrado**, reveal VUT capturado, sem tela de resumo final. |

### Rodada D (2026-08-10) — fechamento dos itens 1, 14, 15 e 18

| Momento | Ação | Entidade/nome | Finalidade | Cleanup |
|---|---|---|---|---|
| ~12:10 BRT | Criou torneio pelo wizard, sem disputar jogos | `AUDIT Torneio D — pausa`, Todos contra Todos, 3 times, 15 pontos | Ter um torneio com jogos pendentes, única forma de exercitar `Pausar`/`Retomar` | **Deixado em andamento (0/3) de propósito**, como fixture para reexecutar pausar/retomar e os controles contextuais. |
| ~12:12 BRT | `Pausar` e depois `Retomar` | `AUDIT Torneio D` | Item 18 | Ciclo completo, estado final igual ao inicial (`EM ANDAMENTO`). |
| ~12:14 BRT | Criou 2 destaques (`Defesa` e `Levantamento`, `AUDIT C2`) e removeu os 2 | `AUDIT Torneio D` | Itens 14 e 15 | Efeito líquido zero; feed voltou a `NENHUM EVENTO REGISTRADO`. |

### Pendências de limpeza (decisão do usuário, não executada)

- 7 convidados `AUDIT C1` a `AUDIT C7` no catálogo de atletas.
- Sessão `AUDIT Sessao C — 09/08/2026` e torneios `AUDIT Torneio C — 09/08/2026` (encerrado) e
  `AUDIT Torneio D — pausa` (em andamento, 0/3).
- 1 jogo órfão com `status: "active"` dentro da sessão encerrada.
- Nada foi enviado para fora: nenhum botão WhatsApp/ZAP foi acionado em nenhuma tela.
