# Scalable Product Program

Spec: `docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md`

O programa e dividido em cinco planos. Cada plano entrega software testavel e so comeca
depois que o anterior estiver integrado e seus gates estiverem verdes.

| Ordem | Plano | Entrega verificavel | Estado |
| --- | --- | --- | --- |
| 1 | Account Identity & Auth Foundation | Toda sessao valida converge para perfil + jogador 1:1; auth possui estados tipados, onboarding, recovery, Google e MFA shell | **Concluido** (`main`) |
| 2 | Player Claim, Communities & Evaluations | Claim por codigo preserva jogador da conta (mais simples que o design original — sem aprovacao de comunidade); RBAC/comunidades ja existiam; avaliacao oficial por comunidade consolidada (sem agregacao ponderada, adiada) | **Concluido** (`main`) — ver notas abaixo |
| 3 | Career Events, Global VUT & Achievements **(escopo expandido)** | Eventos confirmados geram VUT e conquistas globais deterministicas e recalculaveis; **inclui outbox idempotente, cache particionado, reentrância persistente, erros tipados e scaffold de reset** — ver nota de desvio abaixo | **Em implementação** (`main`) — spec `docs/superpowers/specs/2026-07-27-plano-3-career-events-vut-achievements-design.md` |
| 4 | Cloud-first Operational Offline **(escopo reduzido)** | Owner/device da sessao e pacote offline especifico — outbox e cache particionado implementados no Plano 3 | A escrever apos plano 3 |
| 5 | Screen Contracts, Reset & Cutover **(escopo reduzido)** | UI atual usa contratos de aplicacao; reset aplicado em producao; ensaio, rollback e corte fecham Produto escalavel — scaffold de reset implementado no Plano 3 | A escrever apos plano 4 |

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

## Regras do programa

- A UI visivel permanece igual ate o plano 5 estar concluido.
  - **Excecao aberta no Plano 3B (decisao do usuario, 2026-07-27):** uma aba de linha do
    tempo de marcos de carreira. Escopo fechado a essa aba, reusando componentes
    existentes, sem navegacao nova. Registrada aqui para que a regra nao apareca
    violada sem explicacao; ver
    `docs/superpowers/specs/2026-07-27-career-events-vut-design.md`, secao 3B.
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
