# Captura A — produto autenticado

## Método e segurança

- Aba própria e autenticada no Codex In-app Browser, mantida visível durante a captura.
- Cada estado aceito teve DOM recente, espera de estabilidade, screenshot salvo e reaberto em resolução original com `view_image`.
- Nenhuma ação de salvar, excluir, sincronizar, reparar, resolver conflito, importar, restaurar, compartilhar, alterar presença/regra/papel, continuar/descartar rascunho ou iniciar/encerrar sessão foi executada.
- Nenhuma credencial, cookie, token ou conteúdo de storage foi inspecionado ou exportado. E-mail e identificador que aparecem em algumas imagens são conteúdo que o próprio produto renderiza na tela autenticada.
- Viewport desktop padrão: 1264×712. Dashboard e drawer também foram capturados em 850×640.

## Evidências aceitas

| # | Arquivo | IDs cobertos | Saúde | Nota visual breve |
|---:|---|---|---|---|
| 01 | [a01-dashboard-desktop.jpg](screenshots/a01-dashboard-desktop.jpg) | 1.1, 1.3, 1.6 | Atenção | Identidade esportiva e estado de rascunho são claros; “Nova Sessão” domina “Continuar” e o Histórico fica abaixo da dobra. |
| 02 | [a02-dashboard-tablet-sidebar-closed.jpg](screenshots/a02-dashboard-tablet-sidebar-closed.jpg) | 1.1, 1.2, 1.3 | Atenção | Shell recolhe corretamente; os três cards continuam lado a lado em 850 px, comprimindo descrições. |
| 03 | [a03-dashboard-tablet-sidebar-open.jpg](screenshots/a03-dashboard-tablet-sidebar-open.jpg) | 1.2 | Atenção | Drawer/overlay funciona e os alvos são amplos; oito destinos permanecem sem agrupamento e o conteúdo concorrente fica visível atrás. |
| 04 | [a04-torneios-empty.jpg](screenshots/a04-torneios-empty.jpg) | 6.1 | Frágil | CTA “Novo Torneio” é claro, mas o empty state ocupa um painel enorme e não explica dependência de comunidade/elenco. |
| 05 | [a05-jogadores-lista.jpg](screenshots/a05-jogadores-lista.jpg) | 3.1 | Atenção | Busca e CTAs são descobríveis; cards VUT têm personalidade, porém textos/atributos são muito pequenos e densos. |
| 06 | [a06-jogador-criar-formulario.jpg](screenshots/a06-jogador-criar-formulario.jpg) | 3.2, 3.4 | Frágil | “Criar” abre um editor completo com Excluir/Reverter/Salvar e analytics antes da identidade mínima; avaliação já nasce indisponível sem comunidade. Nada foi salvo. |
| 07 | [a07-jogador-editar-formulario.jpg](screenshots/a07-jogador-editar-formulario.jpg) | 3.3, 3.4 | Atenção | Conteúdo esportivo é rico, mas há três colunas, scroll interno e alta densidade; vínculo exibe identificador técnico e atributos desabilitados sem explicação contextual. Nada foi alterado. |
| 08 | [a08-jogador-carta-vut-modal.jpg](screenshots/a08-jogador-carta-vut-modal.jpg) | 3.6 | Atenção | Carta e progressão têm forte especificidade; modal é denso, exige scroll e oferece Compartilhar com mais peso que a leitura. Botão de fechar não tem nome no DOM. |
| 09 | [a09-jogador-vut-carreira.jpg](screenshots/a09-jogador-vut-carreira.jpg) | 3.6 | Saudável com ressalvas | A aba Carreira organiza quatro métricas e um empty state legível; todos os valores zero pedem contexto de como gerar marcos. |
| 10 | [a10-jogador-exclusao-confirmacao.jpg](screenshots/a10-jogador-exclusao-confirmacao.jpg) | 3.7 | Crítico | A confirmação é apenas “Confirmar? Sim Não”, inline e pequena, sem nome do atleta, consequência ou recuperação; foi cancelada por “Não”. |
| 11 | [a11-comunidades-empty-arquivadas.jpg](screenshots/a11-comunidades-empty-arquivadas.jpg) | 2.1; bloqueio 2.2, 2.4–2.14 | Atenção | Empty state é claro; “Arquivadas” ativado confirma ausência total. Há dois CTAs de criação e a sidebar continua destacando Jogadores. |
| 12 | [a12-comunidades-entrar-codigo.jpg](screenshots/a12-comunidades-entrar-codigo.jpg) | 2.3 | Saudável com ressalvas | Modal simples, foco direto no código e Buscar desabilitado; falta explicar formato do código, origem e recuperação. Fechar é icon-only sem nome no DOM. |
| 13 | [a13-ranking-global.jpg](screenshots/a13-ranking-global.jpg) | 6.2 | Frágil | Busca e três ordenações são claras; medalhas classificam duas pessoas com jogos, vitórias e pontos todos zerados, criando falsa precisão. |
| 14 | [a14-historico-lista-empty.jpg](screenshots/a14-historico-lista-empty.jpg) | 6.3; bloqueio 6.4–6.5 | Frágil | Tabs Sessões/Estatísticas são legíveis; empty state não oferece CTA, explicação nem caminho para criar o primeiro registro. |
| 15 | [a15-conta-sync.jpg](screenshots/a15-conta-sync.jpg) | 7.1, 7.2, 7.5, 7.6, 7.7 | Atenção | Diagnóstico “Operacional” e última sync tranquilizam; LWW, “Mesclar Dados” e “Sanear Duplicatas” são técnicos em ações de alto risco. |
| 16 | [a16-configuracoes.jpg](screenshots/a16-configuracoes.jpg) | 8.1 | Frágil | Agrupamento é simples; Importar e Restaurar demo não mostram prévia, escopo, confirmação ou estratégia de recuperação antes da ação. |
| 17 | [a17-gestao-global.jpg](screenshots/a17-gestao-global.jpg) | 8.2 | Crítico | Escopo global/staff é explicitado, mas papéis aparecem como selects editáveis por linha sem resumo de impacto, confirmação ou affordance de salvar/cancelar. Nada foi alterado. |

## Cobertura por módulo atual

| Módulo | Evidência |
|---|---|
| Dashboard | a01, a02, a03 |
| Torneios | a04 |
| Jogadores | a05, a06, a07, a08, a09, a10 |
| Ranking | a13 |
| Histórico | a14 |
| Nuvem & Conta | a15 |
| Configurações | a16 |
| Gestão | a17 |

## Bloqueios autenticados

### Comunidade detalhada e dez abas — BLOCKED

- IDs: **2.4–2.14** — card/menu e tabs Resumo, Atletas, Presença, Lista WhatsApp, Sessões, Ligas, Ranking, Membros, Regras e Dados.
- Evidência: **a11** mostra “Nenhuma comunidade cadastrada” com “Arquivadas” ativado; não existe comunidade ativa nem arquivada.
- Motivo de segurança: os dois CTAs de criação chamam `handleAdd`, que executa `addCommunity(...)` imediatamente antes de abrir o detalhe (`src/components/community/CommunitiesView.tsx:279` e `:365`). Portanto, “abrir o formulário” já mutaria dados e ficou fora do escopo autorizado.
- Consequência: 2.2 também está bloqueado como formulário não destrutivo; não há preview seguro de criação. 2.3 foi coberto separadamente em a12 sem enviar código/pedido.

### Histórico detalhado — BLOCKED

- IDs: **6.4, 6.5**.
- Evidência: **a14** mostra “Nenhuma sessão registrada ainda”. Não há item para abrir nem exclusão de sessão que possa ser apenas cancelada.

### Sessão ativa e wizard — BLOCKED por estado/segurança

- IDs: **4.1–4.8, 5.1–5.9**.
- Há um rascunho pendente em a01/a02, mas abrir/continuar foi explicitamente proibido. Não existe sessão ativa no estado autenticado, e iniciar uma seria mutação.

### Estados de nuvem excepcionais — BLOCKED por ausência de fixture

- IDs: **7.3, 7.4**.
- a15 mostra diagnóstico operacional, sem falha recuperável ou conflito. Nenhum sync/reparo foi disparado para fabricar esses estados.

### Gestão sem permissão — BLOCKED por perfil atual

- ID: **8.3**.
- O perfil autenticado é staff e enxerga Gestão (a17). Reproduzir usuário comum exigiria trocar de sessão/conta, fora desta captura.

### Avatar/upload — BLOCKED por segurança

- ID: **3.5**.
- O acionador visual está presente no editor, mas a auditoria não recebeu um arquivo autorizado e não abriu upload/aprovação.

## Limites da evidência

- Esta rodada é captura visual autenticada e avaliação combinada de UX/design/riscos observáveis. Ela não comprova conformidade WCAG, comportamento de leitor de tela, contraste medido, ordem completa de tabulação, estados offline ou desempenho em rede lenta.
- Os DOMs foram lidos diretamente no momento de cada captura, mas não foram persistidos porque a entrega solicitada é screenshot + nota; nenhum dado de storage foi exportado.
- Estados bloqueados não foram inferidos como visualmente validados. Quando útil, apenas o motivo técnico de bloqueio foi confirmado no código.

## Rodada complementar — rascunhos, torneio e sessão ativa

Esta rodada reutilizou a mesma conta autenticada, em aba própria do Codex In-app Browser. O usuário autorizou alterações reversíveis no rascunho e na conta; nenhuma partida foi iniciada, nenhum ponto/placar foi registrado, nenhuma sessão ou torneio foi encerrado/excluído e nenhum conteúdo foi compartilhado externamente. Cada imagem abaixo teve DOM recente, espera de estabilidade e validação em resolução original com `view_image`.

| # | Arquivo | IDs cobertos | Saúde | Evidência e leitura |
|---:|---|---|---|---|
| 18 | [a18-dashboard-rascunho-torneio.jpg](screenshots/a18-dashboard-rascunho-torneio.jpg) | 1.3 | Atenção | Rascunho de torneio é recuperável e tem ações claras, porém Descartar aparece sem explicação de impacto. |
| 19 | [a19-rascunho-torneio-etapa-1-sessao.jpg](screenshots/a19-rascunho-torneio-etapa-1-sessao.jpg) | 4.1 | Saudável com ressalvas | Etapa, campos e resumo lateral são claros; a ação seguinte fica abaixo da dobra e a data é repetida em formatos diferentes. |
| 20 | [a20-rascunho-torneio-etapa-2-atletas.jpg](screenshots/a20-rascunho-torneio-etapa-2-atletas.jpg) | 4.2 | Frágil | Filtros e contadores ajudam, mas lista, scroll interno, resumo fixo e nove cards competem; a composição 7M/0F contradiz o total de nove. |
| 21 | [a21-rascunho-convidado-formulario.jpg](screenshots/a21-rascunho-convidado-formulario.jpg) | 3.8, 4.2 | Frágil | Modal rápido exige identidade, referência e onze sliders de uma vez; há overflow horizontal no viewport e controles de salvar ficam fora da visão inicial. Foi cancelado. |
| 22 | [a22-rascunho-torneio-etapa-3-formato.jpg](screenshots/a22-rascunho-torneio-etapa-3-formato.jpg) | 4.3 | Saudável com ressalvas | Comparação binária é legível, mas o estado selecionado depende de cor/borda e não expõe `aria-pressed` no DOM. |
| 23 | [a23-rascunho-torneio-etapa-4-regras.jpg](screenshots/a23-rascunho-torneio-etapa-4-regras.jpg) | 4.4 | Frágil | Cinco formatos, playoffs, times, pontuação e vitória formam uma tela longa; escolhas usam cor como principal sinal de seleção. |
| 24 | [a24-rascunho-torneio-etapa-5-revisao.jpg](screenshots/a24-rascunho-torneio-etapa-5-revisao.jpg) | 4.5 | Atenção | Revisão reúne dados e alerta pré-jogo, mas combina decisão de balanceamento, rotação e nove posições; nomes de convidados truncam. |
| 25 | [a25-rascunho-torneio-etapa-6-times.jpg](screenshots/a25-rascunho-torneio-etapa-6-times.jpg) | 4.6 | Crítico | Resumo diz nove selecionados, mas os cards de times mostram 3+2+2 = sete atletas. Ainda assim a progressão é liberada. |
| 26 | [a26-rascunho-times-configuracoes-vinculos.jpg](screenshots/a26-rascunho-times-configuracoes-vinculos.jpg) | 4.6 | Atenção | Anti-repetição e vínculos são compreensíveis, porém o close icon não tem nome no DOM e “Jogar Juntos”/“Forçar Separação” dependem de cor para o estado. |
| 27 | [a27-rascunho-torneio-etapa-7-tabela.jpg](screenshots/a27-rascunho-torneio-etapa-7-tabela.jpg) | 4.7 | Saudável com ressalvas | Rodadas são escaneáveis e o CTA final é explícito; compartilhar/copiar tem peso visual antes da validação de integridade dos sete atletas distribuídos. |
| 28 | [a28-torneio-lista-pronto.jpg](screenshots/a28-torneio-lista-pronto.jpg) | 6.1 | Atenção | Gerar a tabela fez o torneio aparecer como Pronto, com zero partidas, sem uma confirmação intermediária de criação. |
| 29 | [a29-torneio-detalhe-ativo-sem-partida.jpg](screenshots/a29-torneio-detalhe-ativo-sem-partida.jpg) | 5.8, 6.1 | Crítico | Ao abrir o item Pronto, o detalhe já diz Em andamento e oferece Pausar/Encerrar, enquanto o centro ainda diz Tabela pronta e Iniciar Torneio. W.O., Cancelar e setas ficam muito próximos e sem contexto de partida no nome acessível. |
| 30 | [a30-rascunho-regular-etapa-1-sessao.jpg](screenshots/a30-rascunho-regular-etapa-1-sessao.jpg) | 4.1 | Saudável com ressalvas | Novo fluxo regular começa limpo e mantém o mesmo modelo mental, mas não explica que o progresso cria estado persistente. |
| 31 | [a31-rascunho-regular-etapa-2-atletas.jpg](screenshots/a31-rascunho-regular-etapa-2-atletas.jpg) | 4.2 | Frágil | Selecionar Filtrados é rápido, porém mistura atletas regulares e convidados e repete a incoerência de gênero 7M/0F para nove pessoas. |
| 32 | [a32-rascunho-regular-etapa-3-formato.jpg](screenshots/a32-rascunho-regular-etapa-3-formato.jpg) | 4.3 | Saudável com ressalvas | Jogo Livre e Torneio são distintos, mas o stepper continua prometendo Tabela para ambos sem explicar a diferença de saída. |
| 33 | [a33-rascunho-regular-etapa-4-regras.jpg](screenshots/a33-rascunho-regular-etapa-4-regras.jpg) | 4.4 | Atenção | Regras de fila são específicas e úteis; botão de dois times aparece desabilitado sem motivo, e seleção permanece majoritariamente cromática. |
| 34 | [a34-rascunho-regular-etapa-5-revisao.jpg](screenshots/a34-rascunho-regular-etapa-5-revisao.jpg) | 4.5 | Atenção | Boa síntese, mas o alerta de ausência de levantador forte não impede avançar nem explica consequência/recomendação. |
| 35 | [a35-rascunho-regular-etapa-6-times.jpg](screenshots/a35-rascunho-regular-etapa-6-times.jpg) | 4.6 | Crítico | A mesma perda de dois atletas reaparece. “137 pts/Desequilibrada” contradiz todas as métricas de dispersão em 0 e ratings 50. |
| 36 | [a36-sessao-ativa-pre-primeira-partida.jpg](screenshots/a36-sessao-ativa-pre-primeira-partida.jpg) | 1.4, 5.1 | Crítico | `Gerar tabela` saiu direto da etapa Times para Sessão iniciada, sem mostrar a etapa 7. Antes da primeira partida, o header já anuncia Partida em andamento. A primeira partida não foi iniciada. |
| 37 | [a37-dashboard-sessao-ativa-retorno.jpg](screenshots/a37-dashboard-sessao-ativa-retorno.jpg) | 1.4, 4.8 | Crítico | Dashboard mostra Partida ativa/Partida em andamento antes de existir jogo, e coloca Descartar ao lado de Continuar sem copy de perda ou recuperação. |

As capturas full-page a23–a26, a29, a34 e a35 repetem header/sidebar fixos entre segmentos; isso é artefato conhecido da captura longa, não duplicação real da interface. O conteúdo auditado de cada estado permanece visível e foi validado.

### Mutações e estados inesperados observados

1. Gerar a tabela do rascunho de torneio persistiu um torneio Pronto na lista (a27 → a28), sem confirmação explícita de criação.
2. Abrir esse item Pronto levou a um detalhe marcado Em andamento, apesar de ainda pedir Iniciar Torneio e mostrar 0/3 jogos (a28 → a29).
3. No Jogo Livre, `Gerar tabela` não mostrou a etapa Tabela prometida pelo stepper; iniciou a sessão e abriu o estado pré-primeira-partida (a35 → a36).
4. Antes de qualquer partida, header e Dashboard anunciam Partida em andamento/Partida ativa (a36–a37).
5. O cancelamento do wizard abriu um diálogo nativo de confirmação e foi cancelado pelo usuário, preservando a navegação naquele momento. A API de screenshot fica bloqueada enquanto o diálogo nativo está aberto, portanto esse estado foi observado e cancelado, mas não recebeu imagem própria.

### Matriz do que ficou sem cobertura visual

| IDs | Estado não coberto | Motivo |
|---|---|---|
| 0.1–0.8 | Entrada, cadastro, recuperação, verificação, username e MFA | A rodada foi autenticada; sair/trocar conta não fazia parte desta continuação. |
| 1.5 | Offline/falha de sync | Nenhuma falha reproduzível sem fabricar estado operacional. |
| 2.2, 2.4–2.14 | Criação segura e dez abas de comunidade | Nenhuma comunidade ativa/arquivada; criar persiste imediatamente. |
| 3.5 | Upload/aprovação de avatar | Nenhum arquivo autorizado. |
| 4.7 (Jogo Livre) | Tabela/ordem antes de ativar | O produto pulou da etapa Times para Sessão iniciada. |
| 4.8 | Screenshot da confirmação de cancelar | Diálogo nativo observado/cancelado, mas não capturável pela API enquanto aberto. |
| 5.2–5.7 | Placar, ponto, desfazer, fila, ownership, destaques e saída | Dependem de iniciar a primeira partida ou executar mutações proibidas. |
| 5.9 | Reveal VUT | Exige encerramento real, proibido. |
| 6.4–6.6 | Detalhe/exclusão de histórico e exportadores | Histórico continuava sem sessão finalizada; compartilhar/exportar não foi executado. |
| 7.3–7.4 | Falha recuperável e conflito | Conta permaneceu operacional. |
| 8.3 | Gestão sem permissão | Perfil autenticado é staff. |

### Achados priorizados desta rodada

- **P0 — Integridade do elenco:** nove atletas selecionados viram apenas sete atletas distribuídos (a20/a24/a25 e a31/a34/a35), sem bloqueio antes da tabela/sessão.
- **P0 — Estado operacional contraditório:** Pronto vira Em andamento ao abrir, e Partida em andamento aparece antes da primeira partida (a28–a29, a36–a37). O usuário não consegue confiar em status nem no risco de Pausar/Encerrar/Descartar.
- **P1 — CTA e stepper enganosos no Jogo Livre:** `Gerar tabela` pula a etapa 7 e inicia uma sessão sem confirmação (a35–a36).
- **P1 — Controles de alto risco sem contexto:** W.O. A/B, Cancelar, Pausar, Encerrar e Descartar aparecem compactos e sem alvo, consequência ou recuperação explícitos (a29, a37).
- **P2 — Seleção/acessibilidade observável:** cards e opções usam principalmente cor/borda, sem `aria-pressed`; ícones de fechar/fixar são sem nome e nomes longos truncam (a22–a26, a32–a35).
