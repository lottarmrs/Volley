# Scalable Product Program

Spec: `docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md`

O programa e dividido em cinco planos. Cada plano entrega software testavel e so comeca
depois que o anterior estiver integrado e seus gates estiverem verdes.

| Ordem | Plano | Entrega verificavel | Estado |
| --- | --- | --- | --- |
| 1 | Account Identity & Auth Foundation | Toda sessao valida converge para perfil + jogador 1:1; auth possui estados tipados, onboarding, recovery, Google e MFA shell | **Concluido** (`main`) |
| 2 | Player Claim, Communities & Evaluations | Claim por codigo preserva jogador da conta (mais simples que o design original — sem aprovacao de comunidade); RBAC/comunidades ja existiam; avaliacao oficial por comunidade consolidada (sem agregacao ponderada, adiada) | **Concluido** (`main`) — ver notas abaixo |
| 3 | Career Events, Global VUT & Achievements **(escopo expandido)** | Eventos confirmados geram VUT e conquistas globais deterministicas e recalculaveis; inclui reentrância persistente, erros tipados, scaffold de reset e protecao de troca de conta — **outbox e particao por comunidade sairam, ver nota de fechamento** | **Concluido** (`main`, 2026-07-30) — spec `docs/superpowers/specs/2026-07-27-plano-3-career-events-vut-achievements-design.md` |
| 4 | Cloud-first Operational Offline **(escopo restaurado)** | Owner/device da sessao, pacote offline especifico **e o outbox**, agora escrito contra requisitos offline reais | **Concluído** (`main`, 2026-07-31) |
| 5 | Screen Contracts, Reset & Cutover **(escopo reduzido)** | UI atual usa contratos de aplicacao; reset aplicado em producao; ensaio, rollback e corte fecham Produto escalavel — scaffold de reset implementado no Plano 3 | **Fase 1 concluída** (2026-08-03) — reset ensaiado e cutover validado em producao; proximo passo e Fase 2 (Screen Contracts) |

### Notas sobre o Plano 2 (divergencias do design original)

Entregue em tres pecas, nao uma so: "Athlete Claim Code" (Plan A), "Remove Player Link
Proposal System" (Plan B), e "Plano 2 Atualizado: Avaliacoes". Duas divergencias
deliberadas do spec base (`docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md`),
ambas decididas em brainstorm com o usuario:

- Claim e por codigo unico no cadastro, sem fluxo de aprovacao pela comunidade (secao
  7.3 do spec base). Mais simples; a comunidade nao precisa revisar.
- Avaliacao oficial usa o pipeline existente (`aggregatePlayerEvaluations`, com rejeicao
  de outliers ja implementada), mas a agregacao continua **global**, nao isolada por
  comunidade como a secao 8.2 do spec base pedia. Peso por papel, ancora objetiva via
  `point_events`, e isolamento por comunidade ficam adiados como refinamento futuro —
  ver memoria `multi-evaluation-attributes-design` e
  `docs/superpowers/specs/2026-07-24-plano-2-avaliacoes-design.md`.

### Nota sobre o Plano 3 (desvio de escopo aprovado em 2026-07-27)

Uma investigação systematic-debugging da superfície de sync existente revelou 13
problemas latentes (FK resolution, idempotência parcial, concorrência, offline ausente,
cache staleness, classificação de erros) agrupados em 6 classes. Em brainstorm com o
usuário, decidiu-se **resolver todos** esses problemas no Plano 3, antecipando trabalhos
originalmente atribuídos aos Planos 4 e 5. Consequências:

- **Plano 3** assume: outbox idempotente (uma linha por operação de domínio), cache
  particionado por `(auth_user_id, community_id)` com namespace em localStorage,
  reentrância persistente com TTL, erros tipados `AppError`, e scaffold de reset de
  produção (RPC + sequência referencial) sem aplicação automática — além do core
  original (3 tabelas de carreira, 4 módulos de domínio, retrofit dos FutCard).
- **Plano 4** reduz para: owner/device da sessão e pacotes offline específicos
  (outbox e cache já feitos no Plano 3).
- **Plano 5** reduz para: contratos de tela `ScreenContract`, aplicação manual do
  reset, ensaio/rollback/corte final, e a fase Experiência/Interface
  (esqueumorfismo funcional) — o scaffold de reset já existe.

Estrutura do Plano 3: três blocos sequenciais com gates próprios —
**Sync Foundation** (Classes C/D/E/F), **Career Engine** (Classes A/B + VUT global),
**Retrofit UI** (mantém UI congelada, retrofit dos componentes existentes via adapter).

Spec completo: `docs/superpowers/specs/2026-07-27-plano-3-career-events-vut-achievements-design.md`.

### Nota de fechamento do Plano 3 (2026-07-30)

Uma auditoria do que o plano de fato entregou encontrou duas peças do bloco Sync
Foundation construídas, testadas e **sem nenhum consumidor em produção**. O plano nunca
escreveu a tarefa que as ligaria: a Task 2 dizia que "Task 5 (sync integration)"
consumiria o outbox, mas a Task 5 é o guard de reentrância; a Task 4 produziu
`resolveCacheKey` e não tinha passo que o usasse. Defeito de planejamento, não de
execução. Resolução, decidida com o usuário:

- **Outbox removido** (módulo, tabela e testes; migration `20260730100000`). Ele modelava
  uma escrita por operação de domínio que o app não tem — o sync é reconciliação de
  payload inteiro, e repetir uma reconciliação já é idempotente por construção. As quatro
  operações que validava não tinham ponto de escrita para interceptar. O cliente também
  nunca funcionaria: importava `node:crypto` (quebra o build do browser, verificado) e
  montava updates com chaves camelCase contra colunas snake_case. Volta no Plano 4, onde
  existe o modo offline que justifica uma fila.
- **Partição por comunidade removida** (`resolveCacheKey`). Não há chave correta: ela
  assume um `communityId` por entidade, mas `Player.communityIds` é lista — um jogador
  pertence a várias, então não existe fatia do cache local por comunidade. Se o Plano 4
  quiser isso, precisa antes definir quais entidades são de fato escopadas por comunidade.
- **Um defeito real foi corrigido no lugar delas.** O guard da Task 4 descartava o
  resultado da nuvem na divergência de dono — justamente o download corretivo que
  `planStartupCloudDownload` dispara na troca de conta. A conta B iniciava com os
  jogadores e sessões da conta A, carimbados como dela, e o upload seguinte os escrevia
  na conta B. Agora a divergência limpa o cache local e aplica a nuvem, e operações de
  escrita são barradas enquanto o cache for de outro dono.

## Regras do programa

- A UI visivel permanece igual ate o plano 5 estar concluido.
  - **Excecao aberta no Plano 3B (decisao do usuario, 2026-07-27):** uma aba de linha do
    tempo de marcos de carreira. Escopo fechado a essa aba, reusando componentes
    existentes, sem navegacao nova. Registrada aqui para que a regra nao apareca
    violada sem explicacao; ver
    `docs/superpowers/specs/2026-07-27-career-events-vut-design.md`, secao 3B.
  - **Exceção aberta no Plano 4 (decisão do usuário, 2026-07-30):** três acréscimos,
    sem item novo na barra lateral — aviso de posse na tela de sessão, seção de
    conflitos dentro de "Nuvem & Conta", e faixa clicável de trabalho não entregue.
    A navegação definitiva de sincronização é decisão do Plano 5, junto da arquitetura
    de informação centrada em comunidade. Ver
    `docs/superpowers/specs/2026-07-30-plano-4-offline-operacional-design.md`, seção 9.
- Nenhum reset de producao ocorre antes do ensaio completo do plano 5.
- Cada plano usa TDD, revisao por tarefa e commits pequenos.
- Migrations sao aplicadas primeiro no Supabase local e depois no projeto real.
- RLS e RPCs precisam de testes positivos e negativos antes da aplicacao remota.
- Alteracoes remotas possuem backup, verificacao pos-aplicacao e caminho de rollback.
- A fase Experiencia / Interface com esqueumorfismo funcional comeca somente depois dos
  gates do plano 5.

## Sequencia de planos detalhados

O primeiro plano esta em
`docs/superpowers/plans/2026-07-22-account-identity-auth-foundation.md`.
Os planos seguintes serao escritos contra o codigo resultante da entrega anterior para
evitar caminhos, assinaturas e migrations ficticias.
