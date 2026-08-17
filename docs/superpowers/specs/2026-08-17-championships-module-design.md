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
| **Criar / Excluir Liga** |  Sim |  Não |  Não |
| **Materializar Rodada em Sessão** |  Sim |  Não |  Não |
| **Reagendar Rodada Futura** |  Direto |  Solicita ao capitão adversário |  Não |
| **Aprovar Reagendamento** |  Pode intervir/aprovar |  Aceita/Rejeita (time adversário) |  Não |
| **Editar Nome do Time** |  Direto |  Solicita aprovação do Admin |  Não |
| **Aprovar Alteração de Nome** |  Sim |  Não |  Não |
| **Adicionar/Remover Atletas no Time** |  Sim (Exclusivo) |  Não |  Não |
| **Designar Capitão do Time** |  Sim |  Não |  Não |

---

## 5. Interface das Telas

### 5.1 Hub Global (`ChampionshipsHubView.tsx`)
- **Cards de Métricas**: Ligas Ativas | Rodadas da Semana | Total de Atletas em Ligas.
- **Filtros**: Seleção de Comunidade (Dropdown), Status (*Ativas*, *Encerradas*, *Todas*) e busca textual.
- **Lista de Ligas**: Grid de cards mostrando liga, comunidade proprietária, formato e botão "Abrir Liga".

### 5.2 Wizard de Criação (`ChampionshipWizardView.tsx`)
- **Passo 1 (Básico & Recorrência)**: Comunidade, Nome, Formato (Turno único / Turno e returno), Data início, Hora e Dias da Semana.
- **Passo 2 (Pontuação)**: Vitória (3 pts), Derrota (0 pts), W.O. Vitória (3 pts), W.O. Derrota (0 pts).
- **Passo 3 (Elencos & Capitães)**: Adição de times, seleção de Capitão e adição de atletas (Admin).
- **Passo 4 (Revisão & Confirmar)**: Conferência das rodadas geradas e salvamento.

### 5.3 Visão da Liga (`ChampionshipDetailView.tsx`)
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

## 6. Plano de Verificação e Testes

- **Testes Unitários**:
  - Validação do fluxo de solicitações de reagendamento entre capitães.
  - Cálculo de Aproveitamento % e histórico dos últimos 5 jogos na tabela.
  - Permissões de edição de elenco restritas aos administradores.
- **Testes de UI**:
  - Navegação do Hub Global e abertura de ligas.
  - Submissão do Wizard em 4 passos.
  - Posições da tabela e cálculo de pontuação.
