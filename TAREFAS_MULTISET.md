# TAREFAS — Partidas Multi-set + Pontuação Fluida

> Plano de execução até o multi-set funcionar de ponta a ponta (registro,
> estatísticas, notas, UI, mobile) e os bugs relatados estarem resolvidos.
> Marque `[x]` ao concluir.

## Status atual

- ✅ **Núcleo puro commitado** (`95efa7d`): `Game.sets[]`/`Game.setTargets`,
  `evaluateMatchState` (fecha set, decide melhor-de-N, tiebreak de 7), geração de
  playoff `round_robin` via `rank:N`, testes unitários.
- ❌ **Nada disso está ligado ao vivo ainda.** Por isso, ontem, o multi-set "não
  apareceu" e "travou": a pontuação ao vivo, a UI e a persistência não existem.

## Problemas relatados (ontem) — viram tarefas abaixo

1. 📱 **Mobile:** ao marcar cortada, a seção de **assistência** empurra o botão
   **Confirmar** pra fora da tela; sem scroll, impossível confirmar. → **Fase 0**.
2. 🧊 **Multi-set não apareceu / travou tudo** ao chegar na fase. → Fases 1–8.
3. 🔀 **Reordenação de partidas não funcionou.** → **Fase 7**.

---

## Fase 0 — [BLOQUEANTE · independe do multi-set] Modal de ponto no mobile

**Problema:** o `PointModal` cresce além da altura da tela (jogador → fundamento →
assistência) e o botão Confirmar, que está dentro do corpo rolável, fica
inacessível no celular.

**Opções:**
- **A) Footer fixo (sticky) + corpo rolável** — Confirmar sempre visível; o corpo
  (jogador/fundamento/assistência) rola. **Recomendado** (menos toques).
- **B) Fluxo em etapas** como os erros: jogador → fundamento → assistência →
  confirmar. Mais robusto em telas minúsculas, porém +1 toque por ponto.
- **C) Assistência compacta** — chips numa linha de scroll horizontal, sem crescer
  a altura.

**Tarefas:**
- [ ] Reestruturar `PointModal`: `modal-box` em `flex flex-col max-h-[90vh]`;
  header/abas fixos; **corpo `overflow-y-auto flex-1`**; **footer sticky** com
  Confirmar (com `padding` de `env(safe-area-inset-bottom)`).
- [ ] `modal-bottom` no mobile (full-width) / `sm:modal-middle` no desktop.
- [ ] Garantir que abrir a seção de assistência **não** empurre o footer.
- [ ] Validar no preview mobile: cortada + assistência → Confirmar sempre clicável.

---

## Fase 1 — [BLOQUEANTE p/ multi-set] Persistência de `sets[]` e `setTargets`

Sem isso, o estado multi-set se perde no reload/sync (provável causa do "travou").

- [ ] `mapGameToDb`/`mapDbToGame` ([operationalCloudService.ts](src/services/supabase/operationalCloudService.ts)):
  mapear `sets` e `setTargets`. **Recomendado:** guardar dentro de `metadata`
  (jsonb, **sem migração**) OU criar colunas dedicadas (`games.sets jsonb`,
  `games.set_targets`) via migração aditiva.
- [ ] Teste de round-trip do mapper com `sets`/`setTargets`.

---

## Fase 2 — Pontuação ao vivo multi-set (`registerPoint`)

Em [useLiveSession.ts](src/hooks/useLiveSession.ts):
- [ ] Detectar multi-set: `currentGame.setTargets && setTargets.length > 1`.
- [ ] Após incrementar o **set atual**, chamar `evaluateMatchState(currentGame.sets ?? [], scoreAfter.teamA, scoreAfter.teamB, { setTargets, tieBreakMethod, hardPointCap })`.
- [ ] Atualizar `game.sets` + `game.scoreA/scoreB` com o retorno; o `pointEvent`
  mantém o **placar do set** (não resetar o evento).
- [ ] Encerrar a partida no `matchWinner`; gerar `GameReport`.
- [ ] Garantir que o `scoreBefore` do próximo ponto = início do novo set (0-0).
- [ ] Set único (sem `setTargets`) segue no caminho atual, **intacto**.

---

## Fase 3 — Desfazer (undo) cruzando fronteira de set

- [ ] `undoLastPoint`: detectar se o último ponto **fechou um set** (último item de
  `game.sets` == `scoreAfter` do ponto) → **remover esse set** e restaurar
  `scoreA/scoreB` para o `scoreBefore` do ponto.
- [ ] Reabrir a partida (`status: 'active'`, limpar `winnerTeamId`/`finishedAt`) se
  o ponto desfeito havia encerrado o confronto.
- [ ] Teste de undo atravessando a virada de set.

---

## Fase 4 — Nota e estatísticas multi-set

- [ ] `rating`: a exposição `E` deve **somar todos os sets + o set atual** (helper
  `gameExposure(game)`), não só `scoreA+scoreB`. Aplicar em `calculateMatchRating`,
  `calculateSessionRating` e `calculateLiveGameRatings` ([rating.ts](src/logic/rating.ts)).
- [ ] Conferir relatórios/premiação: pontos já são por jogo (somam os sets) — validar.

---

## Fase 5 — UI ao vivo (sets na tela)

Em [TournamentActiveView.tsx](src/components/live/TournamentActiveView.tsx) /
[TeamScoreCard.tsx](src/components/live/TeamScoreCard.tsx):
- [ ] Mostrar **sets vencidos** (ex.: "Sets 1 × 0") e o **set atual** em destaque.
- [ ] Histórico de sets ("Set 1: 12-9 | Set 2: 7-5").
- [ ] Indicar **"Tiebreak"** quando o set atual tem alvo menor (ex.: 7).
- [ ] Não quebrar o layout do set único.

---

## Fase 6 — Wizard / configuração

Em [SessionWizard.tsx](src/components/session/SessionWizard.tsx) /
[useSessionWizard.ts](src/hooks/useSessionWizard.ts):
- [ ] Toggle **`roundRobinPlayoffs`** + formato **`playoffSetTargets`** ([12,12,7]).
- [ ] Ao materializar a tabela em `Game`s: **gravar `setTargets`** nos jogos de
  final/3º; set único nos demais.
- [ ] Garantir resolução dos placeholders `rank:N` na criação/propagação.

---

## Fase 7 — Chaveamento e reordenação de partidas

- [ ] **Investigar e corrigir `reorderScheduledGame`** (não funcionou ontem) —
  verificar se reordena `sequenceNumber`/`round` e persiste.
- [ ] Garantir que `propagateKnockoutResults` roda **ao finalizar cada jogo** para
  resolver `rank:N`/`winner:N` (final/3º saem de "A definir" para os times reais).
- [ ] Bracket renderiza final/3º após o grupo.

---

## Fase 8 — [CRÍTICO] Robustez anti-travamento

Provável causa do "ficou tudo travado sem aparecer":
- [ ] **`currentGame` com `teamId` placeholder** (`rank:1`/`winner:1`) não resolvido
  → **não** tentar renderizar um time inexistente. Mostrar "Aguardando
  classificação" e **bloquear iniciar** até resolver.
- [ ] Guards em `getGameWinner`/`evaluateMatchState` para `setTargets` vazio/`NaN`
  → fallback seguro, nunca `NaN`/loop.
- [ ] Erro amigável em vez de tela branca (try/catch + fallback de UI).

---

## Fase 9 — Testes e validação

- [ ] Unit: núcleo ✅; adicionar `registerPoint` multi-set, `undo`, `gameExposure`.
- [ ] Validação no **preview mobile**: cortada+assistência (Fase 0), multi-set 2×0,
  virada no tiebreak, reordenação, propagação do `rank:N`.
- [ ] `npm run build` + suíte verde.

---

## Pitfalls (resumo do que quebrou ontem)

| Sintoma | Causa provável | Fase |
|---|---|---|
| Confirmar fora da tela (mobile) | Modal sem footer fixo/scroll | 0 |
| Multi-set "não apareceu" / travou | Placeholder `rank:1` não resolvido → time inexistente | 7, 8 |
| Sets não avançavam | `registerPoint` só tratava set único | 2 |
| Estado perdido no reload | `sets`/`setTargets` não persistiam | 1 |
| Reordenar não funcionou | `reorderScheduledGame` com bug | 7 |

## Ordem recomendada de execução

**0 → 1 → 2 → 3 → 4 → 8 → 5 → 6 → 7 → 9.**
(A Fase 0 é independente e destrava a marcação do dia a dia; faça primeiro.)
