# Liga de Pontos Corridos Multi-Data — Design

## Contexto

Hoje, `Session` (`src/shared/types/session.ts:222`) representa um evento de uma
única data (`date: string`). Torneios inteiros — pontos corridos, mata-mata, fase de
grupos — acontecem inteiramente dentro de uma sessão/noite, com times gerados/
rebalanceados a cada sessão pelo balanceador (`Team.sessionId` é obrigatório, não
opcional — todo `Team` pertence a exatamente uma sessão).

Este design introduz um campeonato de pontos corridos que atravessa várias sessões ao
longo de semanas ou meses, com um roster de times fixo durante toda a temporada,
agendamento recorrente (padrão semanal + ajustes manuais) e classificação/premiação
acumuladas entre todas as rodadas já jogadas.

Este é o motor de agendamento e agregação apenas — sem telas novas para o jogador, sem
gamificação. Essa parte fica para a fase Experiência do programa Produto Escalável
(`docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md`), depois
que os gates dos Planos 3-5 fecharem. Decisão explícita do usuário: separar o motor de
agendamento (agora) da experiência do jogador (depois).

## Objetivos

- Criar uma entidade `Championship` que agrupa várias `Session`s ao longo do tempo sob
  um único roster fixo de times e uma única classificação acumulada.
- Gerar o calendário de rodadas automaticamente a partir de um padrão semanal
  (dias da semana + horário + período), com suporte a ajustes manuais (pular ou mover
  uma rodada específica) sem quebrar a série.
- Reaproveitar sem modificar: `generateTournamentSchedule` (já gera o confronto
  round-robin/ida-e-volta abstrato, já trata bye para número ímpar de times),
  `calculateTournamentStandings`, `calculateTournamentAwards`, `calculateTournamentMVP`,
  `calculateTopScorers`.
- Adicionar uma função nova, pequena, de mesma natureza das existentes: melhor jogador
  por posição principal (`calculateAwardsByPosition`).
- Quando a data de uma rodada chega, materializá-la como uma `Session` normal —
  reaproveitando toda a infraestrutura de sessão/jogo/placar existente, sem
  rebalanceamento (os times já são fixos para a temporada).
- Seguir o padrão de sincronização já estabelecido para toda entidade do app (`cloudId`,
  `syncStatus`, `lastSyncedAt`, `deletedAt`).

## Não objetivos

- Telas novas voltadas ao jogador (página de time, histórico, gamificação) — fica para
  a fase Experiência, depois dos Planos 3-5 do programa Produto Escalável.
- Liga entre múltiplas comunidades — uma liga pertence a exatamente uma comunidade.
- Adicionar ou remover time no meio de uma temporada já iniciada — o formato de pontos
  corridos já gerado assume um número fixo de times; isso fica fora de escopo.
- Mover retroativamente uma rodada já materializada (com `Session` vinculada) ao mudar
  a regra de recorrência — a mudança só afeta rodadas futuras ainda não jogadas.
- Formatos de mata-mata/fase de grupos para a liga — só `round_robin` e
  `double_round_robin` fazem sentido numa temporada longa.
- Interface administrativa dedicada nova — a exposição mínima reaproveita padrões
  visuais de uma view administrativa já existente (`GestaoView` ou `CommunitiesView`),
  não uma tela/rota nova.

## Modelo de dados

### `ChampionshipTeam` (novo)

Roster fixo da temporada — existe independente de qualquer sessão específica.

```ts
export interface ChampionshipTeam {
  id: string;
  championshipId: string;
  name: string;
  playerIds: string[];
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
  updatedAt?: string;
}
```

### `Championship` (novo)

```ts
export interface ChampionshipRound {
  round: number;
  teamAId: string; // ChampionshipTeam.id
  teamBId: string; // ChampionshipTeam.id
  scheduledDate: string; // data de calendário real, gerada ou ajustada manualmente
  skipped?: boolean; // rodada cancelada (feriado etc.), não gera sessão nem jogo
  sessionId?: string; // preenchido quando a rodada materializa em uma Session
}

export interface ChampionshipRecurrenceRule {
  daysOfWeek: number[]; // 0 (domingo) .. 6 (sábado)
  time: string; // 'HH:mm'
  startDate: string;
  endDate?: string | null;
}

export interface Championship {
  id: string;
  communityId: string;
  name: string;
  format: 'round_robin' | 'double_round_robin';
  classificationPoints: {
    win: number;
    loss: number;
    walkoverWin?: number;
    walkoverLoss?: number;
  };
  recurrenceRule: ChampionshipRecurrenceRule;
  rounds: ChampionshipRound[];
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Ponte com `Team` de sessão (existente)

`Team.sessionId` continua obrigatório — nenhuma mudança na tabela/tipo existente além
de um novo campo opcional:

```ts
// adição em Team (src/shared/types/session.ts:121)
championshipTeamId?: string;
```

Quando uma rodada materializa (ver seção seguinte), o sistema cria `Team` rows normais
de sessão — uma por `ChampionshipTeam` envolvido na rodada — com
`generatedByAlgorithm: false`, `locked: true`, `championshipTeamId` apontando para o
`ChampionshipTeam` de origem, e `playerIds` copiado do roster fixo daquele momento.

## Motor de recorrência

Função pura: `generateRoundDates(recurrenceRule: ChampionshipRecurrenceRule, roundCount: number): string[]`.
Produz `roundCount` datas de calendário respeitando `daysOfWeek`/`time`, a partir de
`startDate`, parando em `endDate` se definido (ou continuando indefinidamente até
completar `roundCount`).

O número de rodadas necessário vem de `generateTournamentSchedule(teamIds, format)`
(já existente, não modificado) — o maior valor de `round` no resultado.

Ajustes manuais (pular ou mover uma rodada específica) são aplicados como uma
sobreposição direta em `ChampionshipRound.scheduledDate`/`skipped` depois da geração
inicial — não uma segunda passada da função de recorrência. Isso preserva o padrão
"regra base + exceções" (como recorrência de calendário/iCal) sem precisar codificar
exceções dentro da própria função pura.

## Classificação e premiação entre sessões

Todas as funções abaixo já existem em `src/logic/tournament.ts` e **não são
modificadas**. O único trabalho novo é a coleta/remapeamento dos dados de entrada:

1. Coletar todos os `Game`/`PointEvent` de toda `Session` vinculada a rodadas não
   puladas do campeonato (via `ChampionshipRound.sessionId`).
2. Remapear cada `Team.id` (efêmero, por sessão) para seu `championshipTeamId`
   correspondente — mesmo padrão de remapeamento de id já usado em outras partes do
   app (ex.: `resolveCloudId`/`remapValue` em `syncService.ts`/`migrations.ts`).
3. Alimentar, com os dados remapeados:
   - `calculateTournamentStandings(games, championshipTeamIds, classificationPoints)`
   - `calculateTournamentAwards(pointEvents, players, teams, standings)`
   - `calculateTournamentMVP(pointEvents, teams, players, standings)`
   - `calculateTopScorers(pointEvents)`

### `calculateAwardsByPosition` (novo)

Mesma entrada que `calculateTournamentAwards` (`pointEvents`, `players`). Reaproveita a
mesma classificação de eventos por fundamento que `calculateTopScorers` já faz
internamente, mas agrupando por `player.posicaoPrincipal` em vez de por fundamento —
para cada posição (`levantador`, `oposto`, `ponteiro`, `central`, `libero`), retorna o
jogador daquela posição com mais pontos conquistados (mesmo critério de desempate de
`calculateTopScorers`: pontos totais, depois aces, depois bloqueios).

```ts
export function calculateAwardsByPosition(
  pointEvents: PointEvent[],
  players: Player[],
): Partial<Record<Position, AwardWinner>>;
```

## Materialização de rodada → sessão

Quando a data de uma `ChampionshipRound` chega (ou o admin abre a rodada manualmente):

1. Criar uma `Session` normal (`type: 'tournament'`, `config.format` igual ao do
   campeonato) vinculada à comunidade do campeonato, com `date` igual a
   `scheduledDate`.
2. Criar duas `Team` rows de sessão (uma por `ChampionshipTeam` da rodada), populadas a
   partir do roster fixo, `generatedByAlgorithm: false`, `locked: true`,
   `championshipTeamId` preenchido.
3. Criar o `Game` entre as duas `Team`s recém-criadas.
4. Preencher `ChampionshipRound.sessionId` com o id da `Session` criada.

Daí em diante, a sessão funciona exatamente como qualquer sessão de torneio hoje —
placar, eventos de ponto, tudo sem mudança.

## Segurança e sincronização

`Championship`/`ChampionshipTeam` seguem o mesmo padrão RLS já estabelecido para
entidades de comunidade neste app (leitura por membro da comunidade, escrita por
owner/admin via `current_user_has_community_role`) — a forma exata das políticas fica
para o plano de implementação, que deve seguir o padrão já usado por `communities`/
`community_rules`/etc. Ambas as tabelas ganham `cloudId`/`syncStatus`/`deletedAt` como
toda outra entidade sincronizável do app.

## Interface do admin (mínima)

Sem tela ou rota nova. Uma seção dentro de uma view administrativa já existente
(`GestaoView` ou `CommunitiesView` — decisão de qual, e o layout exato, fica para o
plano de implementação, seguindo os padrões visuais já usados ali) lista campeonatos
ativos, próximas datas geradas e a classificação atual, usando os mesmos componentes
visuais (cards, tabelas) já usados no resto do app.

## Testes

- **Domínio (puro)**: `generateRoundDates` — datas corretas para um padrão semanal
  simples, respeito a `endDate`, comportamento com múltiplos `daysOfWeek`.
  Remapeamento `Team.id → championshipTeamId` entre múltiplas sessões produz a mesma
  classificação que `calculateTournamentStandings` já produziria para uma lista de
  jogos com ids consistentes (regressão: nenhuma das funções reaproveitadas muda de
  comportamento). `calculateAwardsByPosition` retorna o jogador certo por posição,
  incluindo empates/critério de desempate.
- **Materialização**: rodada não pulada gera `Session`+`Team`s+`Game` corretamente
  vinculados; rodada pulada não gera nada.
- **Banco/RLS**: matriz de leitura/escrita para member/moderator/admin/owner/staff em
  `championships`/`championship_teams`, mesma forma das tabelas de comunidade já
  testadas.

## Referências

- `docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md` (spec
  base do programa Produto Escalável — UI congelada até o Plano 5, fase Experiência
  posterior)
- `src/logic/tournament.ts` (`generateTournamentSchedule`,
  `generateRoundRobinSchedule`, `calculateTournamentStandings`,
  `calculateTournamentAwards`, `calculateTournamentMVP`, `calculateTopScorers` — toda
  lógica reaproveitada sem modificação)
- `src/shared/types/session.ts` (`Session`, `Team` — tipos existentes estendidos, não
  redesenhados)
