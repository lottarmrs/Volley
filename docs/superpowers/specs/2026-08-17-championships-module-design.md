# Especificação Técnica: Módulo Independente de Ligas (Campeonatos por Pontos Corridos)

## 1. Visão Geral e Objetivos

O objetivo desta especificação é desmembrar a gestão de **Ligas** (campeonatos por pontos corridos) das abas internas do componente de Comunidades (`CommunitiesView.tsx`), promovendo o módulo de Ligas a uma área primária da aplicação Volley com:
1. **Hub Global de Ligas (`/ligas`)**: Visão consolidada de todas as ligas ativas, filtros por comunidade/status e métricas da temporada.
2. **Wizard Guiado de Criação (`/ligas/nova`)**: Fluxo em 4 passos para parametrizar recorrência, pontuação e elencos.
3. **Página Detalhada da Liga (`/ligas/:championshipId`)**: Interface inspirada no sistema de tabelas esportivas (`tabelacampeonato`), contendo Tabela de Classificação com **Forma Recente (Últimos Jogos)**, **Aproveitamento %**, visualização paginada de Rodadas, Premiações e Governança de Capitães.
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
- `/ligas/:championshipId` — Visão Principal da Liga (com sub-abas `/tabela`, `/rodadas`, `/premiacoes`, `/governanca`).
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

---

## 5. O Motor (Core Calculation & State Engine)

O motor de Ligas opera desacoplado da UI através dos seguintes micromotores:

### 5.1 Motor de Agregação de Partidas (`getSeasonStandings`)
- Reavalia dinamicamente todas as Sessões materializadas pertencentes às rodadas da liga.
- Utiliza a ponte `championshipTeamId` presente em cada `Team` da sessão para mapear times temporários da sessão de volta aos times permanentes da liga.
- Calcula de forma reativa:
  - **Jogos Disputados (J)**, **Vitórias (V)**, **Derrotas (D)**.
  - **Pontos de Classificação (P)** (Win=3, Loss=0, WalkoverWin=3, WalkoverLoss=0).
  - **Pontos Pró (PP)** e **Pontos Contra (PC)** acumulados de todos os rallies.
  - **Saldo de Pontos (SP)** = PP - PC.
  - **Aproveitamento (%)** = `(Pontos Conquistados / (Jogos Disputados * 3)) * 100`.
  - **Forma Recente (ÚLT. JOGOS)**: Array ordenado cronologicamente das últimas 5 partidas disputadas pelo time, contendo os status `'v'` (vitória) ou `'d'` (derrota).

### 5.2 Motor de Prêmios e Estatísticas (`getSeasonAwards`)
- Filtra todos os `PointEvent`s de sessões pertencentes à liga.
- Agrupa pontos por atleta e skill (`ataque`, `bloqueio`, `saque`, `defesa`, `recepcao`).
- Calcula o **MVP da Temporada** combinando taxa de vitória do time + pontos individuais + regularidade.
- Calcula os destaques por posição cruzando com a `posicaoPrincipal` cadastrada do atleta.

---

## 6. Integridade Relacional e Tratamento de Exceções

### 6.1 Mapeamento de Relações
- `Community` 1 $\rightarrow$ N `Championship`.
- `Championship` 1 $\rightarrow$ N `ChampionshipTeam` (onde cada time possui N `Player`s e 1 `captainPlayerId`).
- `Championship` 1 $\rightarrow$ N `ChampionshipRound`.
- `ChampionshipRound` 1 $\rightarrow$ 0..1 `Session` (quando materializada).
- `Session` 1 $\rightarrow$ N `Team` (com ponte `championshipTeamId`) $\rightarrow$ N `Game` $\rightarrow$ N `PointEvent`.

### 6.2 Tratamento de Casos Limite (Edge Cases)
- **Atleta desativado ou removido da Comunidade**: O histórico da liga preserva o `playerId` no time da liga. Caso a entidade do atleta seja totalmente removida, fallbacks visuais exibem `"Atleta (Removido)"` sem quebrar o componente.
- **Sessão excluída manualmente do Histórico**: A rodada correspondente tem seu `sessionId` desvinculado e volta ao estado *Não Materializada*, permitindo remarcar ou rematerializar.
- **Empate na Tabela de Classificação**: O critério de desempate segue a ordem rígida: 1. Pontos de Classificação $\rightarrow$ 2. Número de Vitórias $\rightarrow$ 3. Saldo de Pontos $\rightarrow$ 4. Pontos Pró $\rightarrow$ 5. Confronto Direto.
- **Exclusão de Liga**: Aplica o utilitário `detachChampionshipTeamBridges` que desvincula as pontes `championshipTeamId` das sessões passadas para preservar o histórico estático de jogos já realizados.

---

## 7. Prevenção de Quebras de Tela (Resiliência & Error Boundaries)

Para garantir que a página de Ligas **nunca quebre nem apresente "tela branca"**:

1. **React Error Boundary Dedicado (`ChampionshipErrorBoundary.tsx`)**:
   - Envolve toda a rota `/ligas/*`. Se ocorrer qualquer exceção inesperada ao renderizar uma liga, o componente exibe um painel elegante de recuperação com opção de recarregar ou voltar ao Hub Global.
2. **Defensive Defaulting & Optional Chaining**:
   - Todo acesso a propriedades aninhadas (`championship.recurrenceRule?.daysOfWeek ?? []`, `team.playerIds ?? []`, `standings ?? []`) possui fallbacks defensivos contra `undefined`/`null`.
3. **Migração Automática de Esquema no Carregamento**:
   - Ligas criadas em versões anteriores que não possuem `captainPlayerId` ou `classificationPoints` recebem valores padrão transparentes na inicialização do hook `useChampionships`.
4. **Tratamento de Dados Corrompidos no `localStorage`**:
   - `loadFromStorage` já engloba `JSON.parse` em bloco `try/catch`, retornando arrays vazios em caso de JSON inválido.

---

## 8. Interface das Telas

### 8.1 Hub Global (`ChampionshipsHubView.tsx`)
- **Cards de Métricas**: Ligas Ativas | Rodadas da Semana | Total de Atletas em Ligas.
- **Filtros**: Seleção de Comunidade (Dropdown), Status (*Ativas*, *Encerradas*, *Todas*) e busca textual.
- **Lista de Ligas**: Grid de cards mostrando liga, comunidade proprietária, formato e botão "Abrir Liga".

### 8.2 Wizard de Criação (`ChampionshipWizardView.tsx`)
- **Passo 1 (Básico & Recorrência)**: Comunidade, Nome, Formato (Turno único / Turno e returno), Data início, Hora e Dias da Semana.
- **Passo 2 (Pontuação)**: Vitória (3 pts), Derrota (0 pts), W.O. Vitória (3 pts), W.O. Derrota (0 pts).
- **Passo 3 (Elencos & Capitães)**: Adição de times, seleção de Capitão e adição de atletas (Admin).
- **Passo 4 (Revisão & Confirmar)**: Conferência das rodadas geradas e salvamento.

### 8.3 Visão da Liga (`ChampionshipDetailView.tsx`)
- **Aba 1: Classificação (Estilo `tabelacampeonato`)**:
  - Tabela responsiva: `#` | `Time` | `P` (Pontos) | `J` (Jogos) | `V` (Vitórias) | `D` (Derrotas) | `PP` (Pontos Pró) | `PC` (Pontos Contra) | `SP` (Saldo de Pontos) | `%` (Aproveitamento) | `ÚLT. JOGOS` (Badges `V` verde e `D` vermelho dos últimos 5 jogos).
  - Legenda explicativa no rodapé.
- **Aba 2: Rodadas & Confrontos**:
  - Carrossel/Navegação por rodadas (`< 1ª RODADA >`).
  - Botão de **Materializar Rodada** em Sessão ao vivo (apenas Admins).
  - Botão de **Solicitar Reagendamento** (para Capitães) ou Reagendar Direto (Admins).
- **Aba 3: Premiações & Estatísticas**:
  - MVP da Temporada, Top Pontuadores, Premiações por Posição/Fundamento (Ataque, Bloqueio, Saque, Levantamento, Defesa, Passe).
- **Aba 4: Governança & Solicitações**:
  - Painel de aprovação de solicitações pendentes (Reagendamentos e Alterações de Nome de Time).
  - Central de notificações administrativas.

---

## 9. Plano de Verificação e Testes

- **Testes Unitários**:
  - Validação do fluxo de solicitações de reagendamento entre capitães.
  - Cálculo de Aproveitamento % e histórico dos últimos 5 jogos na tabela.
  - Permissões de edição de elenco restritas aos administradores.
  - Resiliência contra dados nulos/incompletos no motor de classificação.
- **Testes de UI**:
  - Navegação do Hub Global e abertura de ligas.
  - Submissão do Wizard em 4 passos.
  - Posições da tabela e cálculo de pontuação.
  - Renderização do Error Boundary em cenários de falha induzida.
