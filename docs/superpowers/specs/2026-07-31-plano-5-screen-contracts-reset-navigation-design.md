# Plano 5 — Screen Contracts, Reset de Produção e Navegação Centrada em Comunidade

**Programa:** Produto Escalável (Plano 5 de 5)

**Data:** 2026-07-31

**Estado:** A escrever após conclusão do Plano 4 (2026-07-31)

**Abordagem:** Sequencial Linear — Reset/Cutover → Screen Contracts → Nova Navegação → Gates Finais

---

## 1. Resumo

O Plano 5 é a fase final do programa "Produto Escalável". Fecha os 12 gates da spec base (seção 18) e libera a fase Experiência/Interface (Plano 6).

**Escopo:**

1. **Reset de produção** — executar o scaffold `reset_product_data(target_account_uuid text)` em produção após ensaio completo em branch Supabase isolado
2. **Screen Contracts** — aplicar o tipo formal `ScreenContract<Model, Intent>` em 9 telas, gradualmente, tela por tela, começando pelas mais complexas
3. **Nova Navegação** — reestruturar a arquitetura de informação centrada em comunidade (spec base seção 12), decompondo o `App.tsx` monolítico em rotas URL aninhadas e áreas internas state-driven
4. **Gates Finais** — validar os 12 gates do programa e marcar "Produto Escalável" como concluído

**Fora do escopo (Plano 6):**

- Esqueumorfismo funcional (microinterações, animações novas)
- Novo design system / tokens visuais
- Acessibilidade (ARIA, leitores de tela, contraste)
- Responsividade mobile refinada
- Novos visuais (FUT card redesign, VUT reveal, etc.)

---

## 2. Contexto e Motivação

### 2.1 Estado atual

O Plano 4 foi concluído em 2026-07-31. O estado do código neste momento:

- **`App.tsx` monolítico** (1538 linhas) controlado por `useState<Module>` (8 módulos) + `useState<Page>` (7 páginas), sem rotas URL aninhadas. Toda a navegação pós-login é state-driven, não deep-linkable.
- **Zero `ScreenContract` implementado** — o tipo está definido na spec base (seção 12, linhas 304-314) mas nenhum código em `src/` implementa o padrão. As views acessam diretamente hooks, use-cases e infra.
- **3 módulos inline** — Torneios, Ranking e Configurações são JSX renderizado diretamente em `App.tsx` (funções `renderTournamentsModule()`, `renderRankingModule()`, `renderSettingsModule()`), sem componente próprio.
- **Scaffold de reset corrigido** — `reset_product_data(target_account_uuid text)` existe (migration `20260730110000`), bug da tabela `player_achievements` inexistente corrigido, restrito ao role `master` com `require_aal2()`.

### 2.2 Decisões delegadas ao Plano 5

15 referências cruzadas em Planos 2, 3 e 4 delegam explicitamente ao Plano 5:

| Origem | O que delega |
|--------|-------------|
| Spec base seção 15 (linhas 383-389) | Conectar UI por Screen Models e Intents; remover acessos diretos a infra; ensaio final; reset controlado; validar bootstrap |
| Spec base seção 17 (linhas 439-461) | Sequência de 9 passos do cutover |
| Spec base seção 18 (linhas 463-480) | 12 gates finais do programa |
| Plano 3 design (linhas 56-58, 464-471) | ScreenContract; reset em produção; UI Experiência |
| Plano 4 design (linhas 82, 93, 285) | Navegação definitiva de sincronização |
| Plano 2 design (linha 86) | UI congelada até gates do Plano 5 |
| Liga pontos corridos (linha 231) | UI congelada até Plano 5 |
| Migration `20260728110000` (linha 2) | Scaffold para uso manual futuro (Plano 5) |
| Migration `20260729000000` (linha 5) | Reintrodução opcional de capability para programmer |
| Migration `20260730110000` (linhas 1-11) | Bug corrigido antes do cutover do Plano 5 |

### 2.3 Decisões de design aprovadas

1. **Reset e cutover primeiro** — garante backend estável antes de tocar UI
2. **Plano 5 completo** — inclui Screen Contracts + navegação, não só reset
3. **Navegação híbrida** — rotas URL para áreas globais, state-driven dentro de comunidade
4. **Screen Contracts graduais** — tela por tela, começando pelas mais complexas
5. **Ensaio em branch Supabase isolado** — antes de qualquer reset em produção
6. **Experiência fica para Plano 6** — escopo focado, menos risco
7. **Acompanhamento de ligas dentro de Sessões** — torneios/campeonatos são tipos de sessão

---

## 3. Não-Objetivos

O Plano 5 NÃO cobre os itens abaixo. Eles pertencem ao Plano 6 (Experiência/Interface):

- **Esqueumorfismo funcional** — microinterações, animações de transição, particle effects, haptics
- **Design system novo** — tokens visuais, paleta, tipografia, spacing scale
- **Acessibilidade** — ARIA roles, leitores de tela, navegação por teclado, contraste WCAG
- **Responsividade mobile refinada** — gestos, bottom sheets, adaptive layouts
- **Novos visuais** — redesenhar FUT card, VUT reveal, tournaments bracket, féries
- **Onboarding/replay** — tutoriais guiados, empty states ilustrados, tour
- **Dark mode** — se não existir, fica para o Plano 6

A UI visível permanece funcional e sem regressões visuais. O Plano 5 é refatoração arquitetural, não redesign.

---

## 4. Fase 1 — Reset de Produção, Ensaio e Cutover

### 4.1 Pré-requisitos

- Scaffold `reset_product_data(target_account_uuid text)` existe e está corrigido (migration `20260730110000`)
- Apenas role `master` possui capability `reset_product_data` (revogado de `programmer` em `20260729000000`)
- `require_aal2()` guard ativo na função
- Orem de deleção children-first verificada contra 18 tabelas de produto

### 4.2 Ensaio em branch Supabase isolado

**Branch:** `plano-5-rehearsal`

**Sequência de 8 passos:**

1. **Criar branch isolado** — `supabase branch create plano-5-rehearsal` (aplica todas as migrations automaticamente)
2. **Popular dados de teste** — simular produção real: contas com jogadores canônicos, comunidades, sessões, games, point events, career events, championships, avaliações
3. **Executar reset** — `SELECT reset_product_data('test-account-uuid')` no branch
4. **Validar contagens** — todas as 18 tabelas de produto zeradas para o account alvo; `auth.users` preservado; constraints íntegras
5. **Smoke tests estruturais** — RLS policies ativas, RPCs existem, grants corretos, `get_advisors` sem advisors críticos
6. **Testar login + bootstrap** — login de conta preservada funciona; `handle_new_user` cria player canônico idempotente
7. **Testar jornada completa** — criar comunidade → adicionar jogadores → iniciar sessão → marcar pontos → finalizar → sync nuvem
8. **Testar negação RLS** — programmer bloqueado para `reset_product_data`; AAL1 rejeitado por `require_aal2()`; master sem AAL2 também rejeitado

**Documento de ensaio:** registrar tempo total, observações, anomalias, e caminho de rollback testado.

### 4.3 Cutover em produção (spec base seção 17)

**Sequência de 9 passos:**

1. **Bloquear escrita + ativar manutenção** — banner no app indicando manutenção; opcionalmente desabilitar mutations via feature flag
2. **Backup completo** — `pg_dump` do banco de produção + snapshot mínimo: `SELECT id, username FROM players WHERE deleted_at IS NULL`
3. **Verificar migrations** — confirmar que todas as migrations estão aplicadas em produção (comparar `supabase/migrations/` com estado do banco)
4. **Smoke tests estruturais** — RLS policies ativas, RPCs existem, grants corretos, `get_advisors` sem advisors críticos
5. **Executar reset** — `SELECT reset_product_data('target-account-uuid')` no Supabase de produção
6. **Validar contagens** — `SELECT count(*)` em cada tabela de produto; constraints, policies, advisors
7. **Testar login de contas preservadas** — login funciona; `handle_new_user` bootstrap idempotente
8. **Testar jornada completa + negação RLS** — criar sessão → marcar pontos → finalizar → sync; programmer bloqueado; AAL1 rejeitado
9. **Liberar escrita + monitorar** — remover banner de manutenção; monitorar logs por 30 minutos

### 4.4 Caminho de rollback

- **Pré-reset**: backup `pg_dump` completo + snapshot de usernames
- **Se reset falhar (erro durante execução)**: restaurar do backup via `pg_restore`
- **Se reset succeed mas dados inválidos**: backup disponível para restore seletivo das tabelas afetadas
- **Se bootstrap quebrar**: `handle_new_user` trigger é idempotente (cria player se não existe) — re-login resolve
- **Se RLS quebrar**: backup disponível; migrations de RLS podem ser reaplicadas manualmente

### 4.5 Reintrodução opcional de capability para programmer

A migration `20260729000000` revogou `reset_product_data` do role `programmer`. O Plano 5 pode reintroduzir via nova migration se houver justificativa (ex: scripts de manutenção automatizados com aprovação externa). Esta reintrodução é opcional e fica a critério do usuário master.

### 4.6 Critério de gate (Fase 1 → Fase 2)

A Fase 1 está concluída quando:

- Ensaio no branch `plano-5-rehearsal` concluído com sucesso (8 passos)
- Cutover em produção validado (9 passos)
- `get_advisors` sem advisors de segurança críticos
- `npm run build` + `npm test` passando no código pós-cutover
- Documento de ensaio arquivado
- `HANDOFF.md` atualizado com estado pós-cutover

**Skill auxiliar:** `systematic-debugging` se o reset falhar no branch isolado (diagnóstico antes de propor correção). `verification-before-completion` antes de declarar a fase concluída.

---

## 5. Fase 2 — Screen Contracts (gradual)

### 5.1 Tipo formal

Conforme spec base seção 12 (linhas 304-314):

```ts
type ScreenContract<Model, Intent> = {
  model: Model;
  dispatch(intent: Intent): Promise<void>;
};
```

**Regra:** renderização não consulta infraestrutura (Supabase, localStorage, outbox, RLS, regras de permissão) e eventos de UI não carregam autorização. A view recebe `Model` pronto e emite `Intent` pura.

### 5.2 Estrutura por tela

Cada tela migrada para ScreenContract terá 3 arquivos no diretório `src/application/screens/`:

| Arquivo | Responsabilidade |
|---------|------------------|
| `<screen>Model.ts` | Tipo `Model` — dados prontos para renderizar, sem refs a infra |
| `<screen>Intents.ts` | Tipo `Intent` — união discriminada de ações que a tela pode emitir |
| `<screen>Contract.ts` | Factory `buildScreenContract(input): ScreenContract<Model, Intent>` que conecta hooks/use-cases existentes em `Model` + `dispatch` |

A view (`.tsx`) consome apenas `ScreenContract` — importa `Model` e chama `dispatch(intent)`. Não importa `@infra/*`, `@storage/*`, nem acessa hooks diretamente.

### 5.3 Ordem de aplicação (9 telas, gradual)

| Ordem | Tela | Complexidade | Justificativa |
|-------|------|-------------|---------------|
| 1 | `SessionWizard` | Alta | 6 steps, muitos callbacks, estado de wizard complexo — melhor caso de teste do padrão |
| 2 | `SessionActiveView` | Alta | Súmula ao vivo, PointModal, AwardsPanel, heartbeat — segundo maior acoplamento |
| 3 | `PlayerEditView` | Média | Formulário + sliders + autoavaliação + avaliação oficial |
| 4 | `CommunitiesView` | Média | Lista + membros + descoberta + join por código |
| 5 | `PlayersView` | Baixa | Lista simples + busca |
| 6 | `Dashboard` | Baixa | Cards de ação + resumo |
| 7 | `HistoryView` | Baixa | Lista + tabs de exportação |
| 8 | `AccountSyncView` | Média | Sync + conflitos + backup |
| 9 | `GestaoView` | Baixa | Admin staff-only |

### 5.4 Padrão de migração (5 passos por tela)

1. **Extrair `Model`** — o que a view precisa para renderizar, já calculado, sem lazy fetch. Converter props espalhadas em um tipo coeso.
2. **Extrair `Intent`** — o que a view faz (`onNext`, `onPrev`, `onTogglePlayer`, `onSaveMatch`, etc.) como união discriminada.
3. **Criar `buildScreenContract()`** — factory que junta hooks/use-cases existentes em `Model` + `dispatch(intent)`. O `dispatch` recebe uma `Intent`, delega para o use-case/hook apropriado, e retorna `Promise<void>`.
4. **Refatorar a view** — trocar props individuais por `ScreenContract`. Sem mudanças visuais. A view não importa mais `@infra/*` nem `@storage/*`.
5. **Testes do contract** — teste unitário que verifica: (a) `Model` é construído corretamente a partir dos inputs; (b) cada `Intent` despacha para o use-case/hook correto. Arquivo `.test.ts` ao lado do contract.

### 5.5 Paralelização (telas 3-9)

Após as telas 1 e 2 (SessionWizard + SessionActiveView) serem migradas com o padrão validado e gate verde, as telas 3-9 podem ser despachadas em paralelo usando `dispatching-parallel-agents`:

```
Tela 1 (SessionWizard)        ← sequencial, define o padrão
Tela 2 (SessionActiveView)    ← sequencial, valida o padrão
   ↓ gate verde + padrão confirmado
Telas 3-9 (paralelo)          ← dispatching-parallel-agents
   ├── Tela 3 (PlayerEditView)
   ├── Tela 4 (CommunitiesView)
   ├── Tela 5 (PlayersView)
   ├── Tela 6 (Dashboard)
   ├── Tela 7 (HistoryView)
   ├── Tela 8 (AccountSyncView)
   └── Tela 9 (GestaoView)
```

**Pré-condição para paralelizar:** telas 1 e 2 validadas com `typecheck → test:unit → test:ui → build` verde e padrão de migração documentado.

### 5.6 Gate entre telas

Cada tela migrada para ScreenContract deve passar:

- `npm run lint` (typecheck)
- `npm run test:unit`
- `npm run test:ui`
- `npm run build`

Avança para a próxima só com tudo verde.

### 5.7 O que NÃO muda nesta fase

- Navegação (continua `Module`/`Page` atual)
- Layout visual
- URLs (continua state-driven)
- `App.tsx` como shell (mas as views internas passam a consumir contratos)

**Skills auxiliares:** `test-driven-development` em cada tela (RED-GREEN-REFACTOR). `dispatching-parallel-agents` nas telas 3-9. `verification-before-completion` em cada gate entre telas.

### 5.8 Critério de gate (Fase 2 → Fase 3)

A Fase 2 está concluída quando:

- 9 telas migradas para ScreenContract
- Nenhuma view importa `@infra/*` ou `@storage/*`
- `typecheck → test:unit → test:ui → build` verde
- Testes de contract cobrem Model e Intent de cada tela

---

## 6. Fase 3 — Nova Navegação Centrada em Comunidade

### 6.1 Arquitetura de informação (spec base seção 12)

**Áreas globais (rotas URL deep-linkable):**

| Rota | Conteúdo |
|------|----------|
| `/` | Início — dashboard com resumo inter-comunidades, próxima sessão, atalhos |
| `/comunidades` | Lista de comunidades do usuário + descoberta + criar nova |
| `/comunidades/:id/*` | Dentro de uma comunidade (state-driven internamente) |
| `/perfil` | Meu perfil — dados do atleta, FUT card, carreira, sync nuvem |

**Dentro de uma comunidade (state interno, não URL):**

| Área | Conteúdo atual que migra para cá |
|------|--------------------------------|
| Visão geral | Dashboard resumo da comunidade, próximas sessões, ranking resumido |
| Sessões | SessionWizard + SessionActiveView + Torneios/Campeonatos (acompanhamento de ligas) + histórico de sessões |
| Pessoas | PlayersView + PlayerEditView + CommunityMembersPanel + convites/pedidos + AthleteUsernameSearch + AvatarApprovalInbox |
| Desempenho | Ranking + HistoryView + estatísticas + exportadores |
| Gestão | GestaoView (staff-only) + Configurações da comunidade + regras + WhatsApp templates |

### 6.2 Mapeamento atual → novo

| Atual (Module) | Novo destino |
|----------------|-------------|
| `dashboard` | `/` (Início) |
| `torneios` | Sessões dentro de comunidade |
| `players` | Pessoas dentro de comunidade |
| `ranking` | Desempenho dentro de comunidade |
| `historico` | Desempenho dentro de comunidade |
| `conta` (Nuvem & Conta) | `/perfil` (Meu perfil) — sync vira seção do perfil |
| `configuracoes` | Gestão dentro de comunidade |
| `gestao` | Gestão dentro de comunidade (staff) |

### 6.3 Estrutura técnica de rotas

```
AppRouter.tsx
├── /entrar, /cadastro, /recuperar-senha, /auth/* (público — sem mudança)
├── / (Início)                    ← HomeScreen lazy
├── /comunidades (lista)          ← CommunitiesListScreen lazy
├── /comunidades/:id (shell)      ← CommunityShell lazy
│   └── state interno: Visão geral | Sessões | Pessoas | Desempenho | Gestão
├── /perfil (Meu perfil)          ← ProfileScreen lazy
└── * → Navigate to /
```

### 6.4 Decomposição do `App.tsx` monolítico

| Fragmento extraído | Destino |
|--------------------|---------|
| `renderActiveContent()` switch | Removido — cada rota renderiza seu próprio componente |
| `renderTournamentsModule()` inline | Movido para `SessõesScreen` dentro de comunidade |
| `renderRankingModule()` inline | Movido para `DesempenhoScreen` dentro de comunidade |
| `renderSettingsModule()` inline | Movido para `GestaoScreen` dentro de comunidade |
| Sidebar + header + toast | `AppShell` componente reutilizável (envolve todas as rotas autenticadas) |
| Estado de sessão ativa/wizard | Contexto compartilhado (`SessionContext`) — não para ao navegar entre rotas globais |

### 6.5 Navegação "Nuvem & Conta" → Perfil

A sincronização (`AccountSyncView`, `SyncConflictSection`) deixa de ser item de topo separado e vira uma seção dentro de `/perfil`. O badge de pendências continua, mas anexo ao item `/perfil` na sidebar.

### 6.6 Sidebar resultante

**Global (fora de comunidade):** 4 itens

```
Início          → /
Comunidades     → /comunidades
Agenda          → / (sub-seção de Início, mostra próximas sessões inter-comunidades)
Meu perfil      → /perfil (badge: sync pendente)
```

**Dentro de comunidade ativa:** 5 áreas + voltar

```
← Voltar para comunidades
Visão geral     → state: overview
Sessões         → state: sessions
Pessoas         → state: people
Desempenho      → state: performance
Gestão          → state: management (staff only)
```

### 6.7 Sessão ativa/wizard via contexto compartilhado

A sessão ativa e o wizard são estado transitório que não pertence a uma rota específica. Para que o usuário possa navegar entre rotas globais sem perder o placar ativo:

- `SessionContext` provedor no `AppShell` (envolve todas as rotas autenticadas)
- Estado da sessão ativa, wizard draft, e ownership heartbeat vivem no contexto
- Navegar de `/` para `/comunidades/:id/sessoes` não interrompe a sessão ativa
- O badge "Partida em Andamento" continua visível no header de qualquer rota

### 6.8 Acompanhamento de ligas (torneios e campeonatos)

Torneios e campeonatos ficam dentro de **Sessões** na área de comunidade. São tipos de sessão, não áreas separadas. A visão de Sessões mostra:

- Próximas sessões (free play, torneio, campeonato)
- Sessão ativa (se houver)
- Wizard de nova sessão
- Lista de torneios/campeonatos da comunidade com status (pronto, ativo, finalizado)
- Tabela de classificação de campeonato (pontos corridos)
- Árvore de torneio (mata-mata)

### 6.9 Critério de gate (Fase 3 → Fase 4)

A Fase 3 está concluída quando:

- Rotas URL globais funcionando (`/`, `/comunidades`, `/comunidades/:id/*`, `/perfil`)
- `App.tsx` decomposto — switch `renderActiveContent()` removido
- 5 áreas internas de comunidade navegáveis
- Sessão ativa/wizard não interrompida ao navegar entre rotas
- Badge de sync pendente no item `/perfil`
- `typecheck → test:unit → test:ui → build` verde

**Skill auxiliar:** `impeccable` (modo `critique`) antes de iniciar a refatoração — revisar a arquitetura de informação proposta verificando UX, scanability, native expectations. `verification-before-completion` no gate final.

---

## 7. Cronograma e Dependências

### 7.1 Diagrama de fases

```
Fase 1: Reset + Ensaio + Cutover
  ├── 1a. Branch Supabase + ensaio (8 passos)
  ├── 1b. Cutover produção (9 passos)
  └── 1c. Validação pós-cutover
      ↓ GATE: produção estável, advisors limpos, build+test verde
Fase 2: Screen Contracts (9 telas, gradual)
  ├── 2a. SessionWizard (sequencial, define padrão)
  ├── 2b. SessionActiveView (sequencial, valida padrão)
  └── 2c-2i. Telas 3-9 (paralelo, dispatching-parallel-agents)
      ↓ GATE: 9 telas com contratos, verde total
Fase 3: Nova Navegação
  ├── 3a. AppShell + rotas URL globais
  ├── 3b. CommunityShell + 5 áreas internas
  ├── 3c. Migrar Nuvem & Conta → Perfil
  ├── 3d. Decompor App.tsx (remover switch inline)
  └── 3e. Sessão ativa/wizard via contexto compartilhado
      ↓ GATE: navegação completa, verde total
Fase 4: Gates Finais do Programa
  └── Validar 12 gates (spec base seção 18)
      ↓ GATE: programa "Produto Escalável" concluído
```

### 7.2 Estimativa de tarefas

| Fase | Complexidade | Risco | Estimativa de tarefas |
|------|-------------|-------|----------------------|
| Fase 1 (Reset+Cutover) | Média | Médio (produção) | ~6-8 tarefas |
| Fase 2 (Screen Contracts) | Alta (9 telas) | Baixo (gradual, TDD) | ~18-22 tarefas (2-3 por tela) |
| Fase 3 (Nova Navegação) | Alta (refatoração grande) | Médio (mudança estrutural) | ~8-10 tarefas |
| Fase 4 (Gates) | Baixa (verificação) | Baixo | ~4-6 tarefas |
| **Total** | | | **~36-46 tarefas** |

---

## 8. 12 Gates Finais do Programa (spec base seção 18)

| # | Gate | Como verificar |
|---|------|---------------|
| 1 | Supabase = fonte de verdade | Sync bidirecional funcional; dados locais são cache; `syncService` funciona em ambos os sentidos |
| 2 | Conta pronta = 1 jogador canônico | `handle_new_user` cria exatamente 1 player por auth user; testes de bootstrap passando |
| 3 | Username e ID interno separados e protegidos | `username` normalizado único; `internal_id` protegido por RLS; invariante de tabela ativa |
| 4 | Claim atômico, idempotente, auditável | Testes de claim (approve/reject/cancel) passando; `career_events` auditam o merge |
| 5 | Autoavaliação, oficial e VUT com semânticas separadas | 3 tabelas independentes (`self_evaluations`, `player_evaluations`, `career_events`); sem cross-contaminação |
| 6 | Gestão sensível protegida por RLS + AAL2 | RPCs de role mutations exigem `require_aal2()`; testes negativos por papel passando |
| 7 | Offline só para comunidades preparadas | Regras de comunidade controlam modo offline; comunidades não preparadas não permitem offline |
| 8 | Cache e outbox isolados por conta/comunidade | Sync scoped por `owner_id`; não vaza cross-user; testes de isolamento passando |
| 9 | UI atual consome contratos sem acessar infraestrutura | Views não importam `@infra/*` nem `@storage/*`; grep no `src/components/` confirma |
| 10 | Reset e rollback ensaiados antes de produção | Documento de ensaio arquivado; caminho de rollback testado no branch isolado |
| 11 | Suite, build, testes SQL, matriz RLS e E2E críticos passando | `npm test` + `npm run build` verdes; testes SQL passando; matriz RLS (por papel/AAL) validada |
| 12 | Documentação operacional = código implantado | Specs e docs refletem o estado final do código; `HANDOFF.md` atualizado; migration list completa |

---

## 9. Riscos e Mitigações

### Risco 1: Reset em produção corromper dados

**Probabilidade:** Baixa (scaffold testado no branch)
**Impacto:** Alto (perda de dados de produção)
**Mitigação:**
- Ensaio completo em branch Supabase isolado antes de tocar produção
- Backup `pg_dump` completo pré-reset
- Snapshot de usernames como checkpoint mínimo
- Caminho de rollback documentado e testado
- Reset só executa com `master` + AAL2

### Risco 2: Refatoração de Screen Contracts quebrar sessão ativa

**Probabilidade:** Média
**Impacto:** Médio (sessão ativa é a tela mais complexa)
**Mitigação:**
- Tela mais complexas (SessionWizard, SessionActiveView) migradas primeiro
- TDD em cada tela (RED-GREEN-REFACTOR)
- Testes UI existentes (`useLiveSession.spec.tsx`, `useSessions.spec.ts`) validam comportamento
- Gate verde entre telas

### Risco 3: Decomposição do `App.tsx` afetar comportamento existente

**Probabilidade:** Média
**Impacto:** Médio (navegação quebra)
**Mitigação:**
- Screen Contracts já aplicados (Fase 2) antes de mudar navegação
- Testes UI existentes (`AppRouter.spec.tsx`, `useCommunities.spec.tsx`, etc.) validam rotas
- Sessão ativa/wizard via contexto compartilhado (não depende de rota)
- `impeccable` critique da arquitetura de informação antes de iniciar

### Risco 4: Screen Contracts aplicados gradualmente gerarem inconsistência

**Probabilidade:** Baixa
**Impacto:** Baixo (gradual é mais seguro que tudo-de-uma-vez)
**Mitigação:**
- Gate verde por tela
- Padrão de migração documentado após telas 1-2
- Telas 3-9 paralelizadas só após padrão validado
- Testes de contract cobrem Model e Intent

---

## 10. Critérios de Aceitação

O Plano 5 está concluído quando:

1. **Reset/cutover:** ensaio validado em branch isolado + cutover em produção concluído (9 passos) + `get_advisors` sem críticos
2. **Screen Contracts:** 9 telas migradas + nenhuma view importa `@infra/*` ou `@storage/*` + testes de contract passando
3. **Nova Navegação:** rotas URL globais funcionando + `App.tsx` decomposto + 5 áreas internas de comunidade + sessão ativa via contexto
4. **12 Gates:** todos os Gates da seção 8 validados
5. **Build + Testes:** `npm run lint` + `npm run lint:eslint` + `npm run format:check` + `npm test` + `npm run build` verdes
6. **Documentação:** `HANDOFF.md` atualizado com estado pós-Plano 5 + spec placeholder do Plano 6 criada + `docs/superpowers/plans/2026-07-22-scalable-product-program.md` marcado como "Concluído"

---

## Skills Utilizadas

| Skill | Fase | Quando invocar |
|-------|------|----------------|
| `using-superpowers` | Sempre | Já carregada — define como descobrir/usar skills |
| `brainstorming` | Pré-plano | Já aplicada — definiu escopo e escolhas |
| `writing-plans` | Pós-spec | Cria plano de implementação detalhado |
| `subagent-driven-development` | Execução | Executa o plano tarefa por tarefa com review |
| `test-driven-development` | Fase 2 | RED-GREEN-REFACTOR em cada tela |
| `dispatching-parallel-agents` | Fase 2 (telas 3-9) | Subagentes paralelos após padrão validado |
| `impeccable` (critique) | Fase 3 (antes) | Revisar arquitetura de informação antes de refatorar |
| `verification-before-completion` | Todos os gates | Antes de declarar fase concluída |
| `systematic-debugging` | Fase 1 (se falhar) | Diagnóstico se reset falhar no branch isolado |
| `writing-skills` | Final | Spec placeholder do Plano 6 |

---

## Referências

- Spec base: `docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md` (seções 5.5, 12, 15, 17, 18)
- Programa mestre: `docs/superpowers/plans/2026-07-22-scalable-product-program.md`
- Plano 3 design: `docs/superpowers/specs/2026-07-27-plano-3-career-events-vut-achievements-design.md`
- Plano 4 design: `docs/superpowers/specs/2026-07-30-plano-4-offline-operacional-design.md`
- Migration reset scaffold: `supabase/migrations/20260728110000_reset_scaffold.sql`
- Migration programmer revoke: `supabase/migrations/20260729000000_reset_scaffold_programmer_revoke.sql`
- Migration table fix: `supabase/migrations/20260730110000_reset_product_data_drop_missing_table.sql`
- View model atual: `src/application/appShellViewModel.ts` (`Module`, `Page`, `ShellNavigationTarget`)
- Router atual: `src/app/AppRouter.tsx`
- Shell atual: `src/App.tsx` (`renderActiveContent()`, `renderTournamentsModule()`, `renderRankingModule()`, `renderSettingsModule()`)
