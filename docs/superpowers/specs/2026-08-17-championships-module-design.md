# Especificação Técnica: Módulo Independente de Ligas (Campeonatos por Pontos Corridos)

## 1. Visão Geral e Objetivos

O objetivo desta especificação é desmembrar a gestão de **Ligas** (campeonatos por pontos corridos) das abas internas do componente de Comunidades (`CommunitiesView.tsx`), promovendo o módulo de Ligas a uma área primária da aplicação Volley com:
1. **Hub Global de Ligas (`/ligas`)**: Visão consolidada de todas as ligas ativas, filtros por comunidade/status e métricas da temporada.
2. **Wizard Guiado de Criação (`/ligas/nova`)**: Fluxo em 4 passos para parametrizar recorrência, pontuação, elencos e escalação gráfica na quadra.
3. **Página Detalhada da Liga (`/ligas/:championshipId`)**: Interface inspirada no sistema de tabelas esportivas (`tabelacampeonato`), contendo Tabela de Classificação com **Forma Recente (Últimos Jogos)**, **Aproveitamento %**, visualização paginada de Rodadas, Premiações, Governança de Capitães e **Escalação em Formação de Quadra de Vôlei**.
4. **Governança e Fluxo de Solicitações**:
   - Cada time da liga pode ter um **Capitão** designado (`captainPlayerId`).
   - Reagendamento de rodadas por capitães gera solicitação pendente para o capitão adversário + notificação para os administradores.
   - Alteração de nome de time solicitada por capitão requer aprovação da Administração (Admins podem alterar diretamente).
   - Inclusão/remoção de atletas no time é restrita exclusivamente à Administração da comunidade/liga.

---

## 2. Arquitetura de Rotas e Navegação

### 2.1 Mapeamento de Rotas (`src/app/appRoutes.ts`)
- `/ligas` — Hub Global de Ligas.
- `/ligas/nova` — Wizard de Criação em Passos.
- `/ligas/:championshipId` — Visão Principal da Liga (com sub-abas `/tabela`, `/rodadas`, `/elencos`, `/premiacoes`, `/governanca`).
- `/comunidades/:communityId` — Mantém apenas um Card Resumo com link direcionador para o Hub de Ligas.

---

## 3. Modelo de Dados e Extensões do Domínio (`src/types.ts`)

```typescript
export interface ChampionshipTeam {
  id: string;
  championshipId: string;
  name: string;
  playerIds: string[];
  captainPlayerId?: string; // Capitão do time na Liga
  // Mapeamento posicional na quadra (Posições 1 a 6 + Reserva)
  courtPositions?: Record<string, 1 | 2 | 3 | 4 | 5 | 6 | 'reserva'>;
  cloudId?: string;
  syncStatus?: 'local' | 'pending' | 'synced';
  lastSyncedAt?: string;
  deletedAt?: string;
  updatedAt: string;
}

export type ChampionshipRequestKind = 'reschedule_round' | 'rename_team';
export type ChampionshipRequestStatus = 'pending' | 'accepted' | 'rejected' | 'approved';

export interface ChampionshipRequest {
  id: string;
  championshipId: string;
  kind: ChampionshipRequestKind;
  status: ChampionshipRequestStatus;
  requestedByPlayerId: string;
  requestedByTeamId: string;
  // Payload para reagendamento de rodada
  roundId?: string;
  proposedDate?: string;
  acceptedByCaptainId?: string;
  // Payload para alteração de nome de time
  proposedTeamName?: string;
  approvedByAdminId?: string;
  createdAt: string;
  updatedAt: string;
}
```

---

## 4. Governança e Regras de Permissão

| Ação | Administrador da Liga / Comunidade | Capitão do Time | Atleta / Membro comum |
| :--- | :---: | :---: | :---: |
| **Criar / Excluir Liga** | ✔️ Sim | ❌ Não | ❌ Não |
| **Materializar Rodada em Sessão** | ✔️ Sim | ❌ Não | ❌ Não |
| **Reagendar Rodada Futura** | ✔️ Direto | 🔄 Solicita ao capitão adversário | ❌ Não |
| **Aprovar Reagendamento** | ✔️ Pode intervir/aprovar | 🤝 Aceita/Rejeita (time adversário) | ❌ Não |
| **Editar Nome do Time** | ✔️ Direto | 🔄 Solicita aprovação do Admin | ❌ Não |
| **Aprovar Alteração de Nome** | ✔️ Sim | ❌ Não | ❌ Não |
| **Adicionar/Remover Atletas no Time** | ✔️ Sim (Exclusivo) | ❌ Não | ❌ Não |
| **Designar Capitão do Time** | ✔️ Sim | ❌ Não | ❌ Não |
| **Escalar Jogadores na Quadra** | ✔️ Sim | ✔️ Sim | ❌ Não |

---

## 5. Visualização de Elenco em Formação de Quadra de Vôlei (`VolleyballCourtLineup.tsx`)

Para representar visualmente os times de forma imersiva (semelhante a plataformas como Fantasy/Sorare e a referência fornecida):

### 5.1 Componente de Quadra em Perspectiva
- **Layout Tático de Vôlei**: Quadra em perspectiva com a rede no topo, linha de 3 metros (ataque) e 6 posições fixas:
  - **Ataque (Rede)**: Posição 4 (Ponteiro/Entrada de rede), Posição 3 (Central/Meio de rede), Posição 2 (Oposto/Saída de rede).
  - **Defesa (Fundo)**: Posição 5 (Ponteiro/Fundo esquerdo), Posição 6 (Central/Líbero/Fundo meio), Posição 1 (Levantador/Saque/Fundo direito).
- **Cards dos Jogadores na Quadra**:
  - **Camisa do Time**: Ilustração estilizada de regata/camisa de vôlei com número do atleta e cores do time.
  - **Badge de Capitão (`C`)**: Círculo amarelo no canto da camisa identificando o Capitão.
  - **Etiqueta da Posição**: Sigla (`LEV`, `PON`, `CEN`, `OPO`, `LIB`).
  - **Nome & Overall**: Nome de exibição do atleta e nota/estatística.
- **Área de Reservas**: Trilhão inferior com os demais atletas do elenco (substitutos) para alternar posições com clique simples ou drag-and-drop.

---

## 6. O Motor (Core Calculation & State Engine)

### 6.1 Motor de Agregação de Partidas (`getSeasonStandings`)
- Reavalia dinamicamente todas as Sessões materializadas pertencentes às rodadas da liga.
- Utiliza a ponte `championshipTeamId` presente em cada `Team` da sessão para mapear times temporários da sessão de volta aos times permanentes da liga.
- Calcula de forma reativa:
  - **Jogos Disputados (J)**, **Vitórias (V)**, **Derrotas (D)**.
  - **Pontos de Classificação (P)** (Win=3, Loss=0, WalkoverWin=3, WalkoverLoss=0).
  - **Pontos Pró (PP)** e **Pontos Contra (PC)** acumulados de todos os rallies.
  - **Saldo de Pontos (SP)** = PP - PC.
  - **Aproveitamento (%)** = `(Pontos Conquistados / (Jogos Disputados * 3)) * 100`.
  - **Forma Recente (ÚLT. JOGOS)**: Array ordenado cronologicamente das últimas 5 partidas disputadas pelo time, contendo os status `'v'` (vitória) ou `'d'` (derrota).

### 6.2 Motor de Prêmios e Estatísticas (`getSeasonAwards`)
- Filtra todos os `PointEvent`s de sessões pertencentes à liga.
- Agrupa pontos por atleta e skill (`ataque`, `bloqueio`, `saque`, `defesa`, `recepcao`).
- Calcula o **MVP da Temporada** combinando taxa de vitória do time + pontos individuais + regularidade.
- Calcula os destaques por posição cruzando com a `posicaoPrincipal` cadastrada do atleta.

---

## 7. Integridade Relacional e Tratamento de Exceções

### 7.1 Mapeamento de Relações
- `Community` 1 $\rightarrow$ N `Championship`.
- `Championship` 1 $\rightarrow$ N `ChampionshipTeam` (com `playerIds`, `captainPlayerId` e `courtPositions`).
- `Championship` 1 $\rightarrow$ N `ChampionshipRound`.
- `ChampionshipRound` 1 $\rightarrow$ 0..1 `Session` (quando materializada).
- `Session` 1 $\rightarrow$ N `Team` (com ponte `championshipTeamId`) $\rightarrow$ N `Game` $\rightarrow$ N `PointEvent`.

### 7.2 Tratamento de Casos Limite (Edge Cases)
- **Atleta desativado ou removido da Comunidade**: O histórico da liga preserva o `playerId` no time da liga. Caso a entidade do atleta seja totalmente removida, fallbacks visuais exibem `"Atleta (Removido)"` sem quebrar a quadra ou tabela.
- **Sessão excluída manualmente do Histórico**: A rodada correspondente tem seu `sessionId` desvinculado e volta ao estado *Não Materializada*, permitindo remarcar ou rematerializar.
- **Empate na Tabela de Classificação**: O critério de desempate segue a ordem rígida: 1. Pontos de Classificação $\rightarrow$ 2. Número de Vitórias $\rightarrow$ 3. Saldo de Pontos $\rightarrow$ 4. Pontos Pró $\rightarrow$ 5. Confronto Direto.
- **Exclusão de Liga**: Aplica o utilitário `detachChampionshipTeamBridges` que desvincula as pontes `championshipTeamId` das sessões passadas para preservar o histórico estático de jogos já realizados.

---

## 8. Prevenção de Quebras de Tela (Resiliência & Error Boundaries)

1. **React Error Boundary Dedicado (`ChampionshipErrorBoundary.tsx`)**:
   - Envolve toda a rota `/ligas/*`. Se ocorrer qualquer exceção inesperada ao renderizar uma liga ou a quadra 3D/2D, o componente exibe um painel elegante de recuperação.
2. **Defensive Defaulting & Optional Chaining**:
   - Todo acesso a propriedades aninhadas (`championship.recurrenceRule?.daysOfWeek ?? []`, `team.courtPositions ?? {}`) possui fallbacks defensivos contra `undefined`/`null`.
3. **Migração Automática de Esquema no Carregamento**:
   - Ligas criadas em versões anteriores que não possuem `captainPlayerId` ou `courtPositions` recebem posições defensivas automáticas baseadas nas posições principais dos atletas (`posicaoPrincipal`).
4. **Tratamento de Dados Corrompidos no `localStorage`**:
   - `loadFromStorage` já engloba `JSON.parse` em bloco `try/catch`, retornando arrays vazios em caso de JSON inválido.

---

## 9. Interface das Telas

### 9.1 Hub Global (`ChampionshipsHubView.tsx`)
- **Cards de Métricas**: Ligas Ativas | Rodadas da Semana | Total de Atletas em Ligas.
- **Filtros**: Seleção de Comunidade (Dropdown), Status (*Ativas*, *Encerradas*, *Todas*) e busca textual.
- **Lista de Ligas**: Grid de cards mostrando liga, comunidade proprietária, formato e botão "Abrir Liga".

### 9.2 Wizard de Criação (`ChampionshipWizardView.tsx`)
- **Passo 1 (Básico & Recorrência)**: Comunidade, Nome, Formato (Turno único / Turno e returno), Data início, Hora e Dias da Semana.
- **Passo 2 (Pontuação)**: Vitória (3 pts), Derrota (0 pts), W.O. Vitória (3 pts), W.O. Derrota (0 pts).
- **Passo 3 (Elencos & Quadra Tática)**: Adição de times, seleção de Capitão, atribuição de atletas e visualização da Formação na Quadra.
- **Passo 4 (Revisão & Confirmar)**: Conferência das rodadas geradas e salvamento.

### 9.3 Visão da Liga (`ChampionshipDetailView.tsx`)
- **Aba 1: Classificação (Estilo `tabelacampeonato`)**:
  - Tabela responsiva: `#` | `Time` | `P` (Pontos) | `J` (Jogos) | `V` (Vitórias) | `D` (Derrotas) | `PP` (Pontos Pró) | `PC` (Pontos Contra) | `SP` (Saldo de Pontos) | `%` (Aproveitamento) | `ÚLT. JOGOS` (Badges `V` verde e `D` vermelho dos últimos 5 jogos).
  - Legenda explicativa no rodapé.
- **Aba 2: Rodadas & Confrontos**:
  - Carrossel/Navegação por rodadas (`< 1ª RODADA >`).
  - Botão de **Materializar Rodada** em Sessão ao vivo (apenas Admins).
  - Botão de **Solicitar Reagendamento** (para Capitães) ou Reagendar Direto (Admins).
- **Aba 3: Elencos & Quadra de Vôlei (`VolleyballCourtLineup`)**:
  - Visualização tática da quadra de vôlei com as 6 posições, camisas numeradas, badge do Capitão (`C`), etiquetas de posição e banco de reservas.
- **Aba 4: Premiações & Estatísticas**:
  - MVP da Temporada, Top Pontuadores, Premiações por Posição/Fundamento (Ataque, Bloqueio, Saque, Levantamento, Defesa, Passe).
- **Aba 5: Governança & Solicitações**:
  - Painel de aprovação de solicitações pendentes (Reagendamentos e Alterações de Nome de Time).
  - Central de notificações administrativas.

---

## 10. Plano de Verificação e Testes

- **Testes Unitários**:
  - Validação do posicionamento tático no objeto `courtPositions`.
  - Validação do fluxo de solicitações de reagendamento entre capitães.
  - Cálculo de Aproveitamento % e histórico dos últimos 5 jogos na tabela.
  - Permissões de edição de elenco restritas aos administradores.
- **Testes de UI**:
  - Renderização do componente `VolleyballCourtLineup` com os 6 atletas na quadra e badge de Capitão.
  - Navegação do Hub Global e abertura de ligas.
  - Submissão do Wizard em 4 passos.
  - Posições da tabela e cálculo de pontuação.
  - Renderização do Error Boundary em cenários de falha induzida.
