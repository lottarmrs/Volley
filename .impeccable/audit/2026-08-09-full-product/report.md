# Auditoria integral do produto — 2026-08-09

## Resultado executivo

A auditoria autenticada percorreu o shell, os oito módulos globais, as dez áreas de comunidade,
cadastro e edição de atletas, VUT/carreira, o wizard de sessão regular, o wizard de torneio, a
tabela gerada e os estados anteriores à primeira partida. Foram produzidas 77 capturas por duas
avaliações independentes (37 na A e 40 aceitas na B), além da matriz de cobertura e do detector
estático.

O produto tem identidade esportiva forte e oferece muitos recursos reais, mas há dois bloqueios
de confiança que devem preceder a Fase 3:

1. nove atletas selecionados podem resultar em apenas sete atletas distribuídos nos times;
2. sessão e torneio são anunciados como ativos/em andamento antes de a primeira partida começar.

Esses problemas não são apenas visuais. Eles afetam integridade de dados, entendimento do estado
operacional e segurança das ações seguintes.

## Método

- Avaliação A e avaliação B usaram abas próprias e autenticadas no Codex In-app Browser.
- A B percorreu todas as opções globais, as dez abas de uma comunidade criada para auditoria e os
  fluxos de sessão/torneio até o limite seguro.
- A A repetiu os fluxos de sessão e torneio sem ler a evidência da B, validou as sete etapas e
  inspecionou os estados pré-primeira-partida.
- Cada captura aceita foi reaberta em resolução original. Uma captura de loading da B foi
  rejeitada e substituída por estado estável.
- Nenhuma partida, ponto, placar, encerramento, exclusão, importação, restauração, sync, mudança de
  papel ou compartilhamento externo foi executado.
- O detector de `src/App.tsx` retornou `[]`. Isso não invalida os achados: eles são de estado,
  arquitetura de informação, semântica e fluxos, fora das regras mecânicas do detector.

## Cobertura consolidada

| Jornada | Coberta visualmente | Limites restantes |
|---|---|---|
| Acesso público | Não nesta rodada autenticada | login, cadastro, recuperação, verificação, username e MFA exigem logout/conta separada |
| Shell e Início | Desktop, tablet, drawer, rascunho, sessão ativa e atalhos | offline/falha de sync não foi fabricada |
| Comunidades | Lista, criação imediata, código e dez áreas internas | estados com muitos dados e permissões alternativas não existiam |
| Atletas | Lista, busca, criar, editar, VUT, carreira, convidado e confirmação de exclusão cancelada | upload/aprovação de avatar sem arquivo autorizado |
| Configurar sessão | sete etapas de torneio; sessão regular até times e transição real após Gerar tabela | em Jogo Livre a etapa Tabela é pulada pelo produto |
| Sessão/torneio ativo | pré-primeira-partida, tabela, classificação vazia e retorno pelo Dashboard | placar, ponto, desfazer, fila, ownership, destaques, premiação e encerramento exigem iniciar/terminar jogo |
| Torneios, ranking e histórico | lista vazia/pronta, detalhe, ranking global e histórico vazio | histórico detalhado/exportação exigem sessão finalizada |
| Conta e sync | perfil, MFA disponível, diagnóstico, backup e manutenção | conflito e falha recuperável não existiam |
| Configurações e gestão | backup/importação/demo e gestão global staff | perfil sem permissão exige outra conta |

Índices completos: [coverage.md](coverage.md), [capture-a.md](capture-a.md) e
[capture-b.md](capture-b.md).

## Fluxos percorridos

### Sessão regular

1. Sessão: nome/data e persistência do rascunho.
2. Atletas: filtros, seleção, convidados e validações de mínimo.
3. Formato: Jogo Livre versus Torneio.
4. Regras: times, pontos, diferença e fila.
5. Revisão: resumo, posições, rotação e alertas.
6. Times: processamento, alternativas, vínculos e diagnóstico.
7. Tabela: prometida pelo stepper, mas não exibida em Jogo Livre; `Gerar tabela` ativa a sessão.

### Torneio

1. Entrada por `Novo Torneio` e retomada do rascunho.
2. Seleção de nove atletas.
3. Formato Torneio.
4. Regras específicas: todos contra todos, turno e returno, mata-mata, fase de grupos e grupos + mata-mata.
5. Revisão e alertas.
6. Times e configurações de vínculos.
7. Tabela, lista de torneios e detalhe anterior à primeira partida.

### Comunidade

Foram percorridos Resumo, Atletas, Presença, Lista WhatsApp, Sessões, Ligas, Ranking, Membros,
Regras e Dados. A criação atual não apresenta formulário intermediário: clicar em `Nova` já cria
`NOVA COMUNIDADE` e abre o detalhe.

## Achados priorizados

### P0 — integridade do elenco

O resumo mantém nove IDs selecionados, mas os três times exibem 3 + 2 + 2 atletas. O fluxo libera
tabela e ativação mesmo assim. A interface também apresenta `7M / 0F` para nove selecionados.

Requisito: antes de persistir times ou tabela, validar que cada atleta selecionado existe, aparece
exatamente uma vez e que a união dos times coincide com a seleção. IDs ausentes precisam bloquear
o avanço e oferecer reparo explícito.

### P0 — estados operacionais contraditórios

Um torneio `Pronto` abre como `Em andamento` enquanto ainda exibe `Iniciar Torneio`. No Jogo Livre,
o cabeçalho e o Dashboard mostram `Partida em andamento` antes de `Começar Primeira Partida`.

Requisito: separar ao menos `rascunho`, `tabela_pronta`, `sessao_pronta`, `partida_em_andamento`,
`pausada` e `encerrada`; cada CTA deve declarar a transição e sua consequência.

### P1 — `Gerar tabela` inicia sessão sem confirmação

No Jogo Livre, `confirmDivision()` persiste a sessão e navega para a tela ativa, embora o stepper
prometa uma sétima etapa. A copy e o comportamento divergem.

Requisito: ou mostrar a etapa Tabela e um CTA separado `Iniciar sessão`, ou renomear a ação e
pedir confirmação explícita antes de ativar.

### P1 — navegação não endereçável

Os oito módulos e Comunidades permanecem em `/`; Comunidades ainda fica sob Jogadores. Back,
refresh, favoritos e compartilhamento não representam o lugar real.

Requisito: rotas globais e subrotas reais para `/comunidades/:id/visao-geral`, `/sessoes`,
`/pessoas`, `/desempenho` e `/gestao`.

### P1 — gestão global e comunitária estão misturadas na proposta

`GestaoView` administra papéis globais; a área Dados/Configurações contém backup global. Nenhuma
das duas deve ser movida inteira para a gestão de uma comunidade.

Requisito: separar `Administração da plataforma`, `Gestão da comunidade` e `Dados/backup globais`.

### P1 — ações de alto risco carecem de alvo e consequência

Descartar, Encerrar, W.O. A/B, Cancelar, limpar histórico, excluir comunidade, importar e restaurar
aparecem com contexto insuficiente ou confirmação genérica.

Requisito: nomear entidade afetada, efeito, possibilidade de recuperação e CTA seguro padrão.

### P1 — semântica e loading

Cards principais usam interação não nativa, navegação usa botões sem URL/`aria-current`, seleções
dependem de cor, ícones de fechar não têm nome e o lazy loading pode ficar em branco.

Requisito: `Link`/`NavLink`, foco e `aria-current`, `aria-pressed` nas escolhas, nomes acessíveis e
fallback de loading anunciado.

### P2 — densidade, empty states e linguagem

- Ranking premia atletas com todos os valores zerados.
- Histórico vazio não conduz à primeira sessão.
- Conta usa termos como `LWW` e `sanear duplicatas` sem explicar consequência.
- O editor de convidado pede onze sliders de uma vez e apresenta overflow.
- Nomes longos truncam e vários textos críticos usam 9–10 px.

## Implicações obrigatórias para a Fase 3

1. Corrigir integridade e máquina de estados antes de reestruturar o shell.
2. Tornar comunidade e suas cinco áreas endereçáveis por URL.
3. Fazer `Continuar` dominar `Nova Sessão` quando houver rascunho ou sessão pronta/ativa.
4. Tratar sessão e torneio como jornadas relacionadas, mas não equivalentes: torneio possui regras,
   tabela, classificação, chave e estados próprios.
5. Separar administração global, gestão comunitária e dados/backup.
6. Preservar o contexto da comunidade em sessão/tabela/partida e em todos os retornos.
7. Definir estados vazios, loading, erro, permissão e dados inconsistentes nos contratos de tela.

## Alterações feitas para a auditoria

O registro detalhado está em [mutations.md](mutations.md). Permaneceram na conta/local state:

- comunidade `NOVA COMUNIDADE`;
- convidados `AUDIT Convidado 1` a `AUDIT Convidado 7`;
- um torneio criado com tabela pronta;
- uma sessão regular pronta/ativa antes da primeira partida;
- nenhum jogo, placar ou ponto registrado.

Nenhuma limpeza foi executada porque excluir/encerrar é irreversível ou altera histórico. A limpeza
deve ser decidida separadamente.

## Limites honestos

Não foram visualmente reproduzidos: acesso público, outra matriz de permissões, falha/conflito de
sync, upload real, partida com placar, fila/ownership, destaques, premiação, encerramento, histórico
finalizado e reveal pós-jogo. Esses estados não são tratados como validados. O código e os testes
podem orientar uma rodada dedicada, mas não substituem evidência visual.
