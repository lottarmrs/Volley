# Estratégia e Design da Suíte de Testes End-to-End (E2E) com Playwright Test

**Data:** 2026-08-20  
**Projeto:** Panelinha Team Balancer (Volley)  
**Foco Crítico:** Preparação para Liga de Pontos Corridos (Longa Duração) + Matriz Detalhada de Roles  
**Status:** Atualizado & Aprovado  

---

## 1. Visão Geral

O objetivo deste projeto é estabelecer uma suíte de testes End-to-End (E2E) completa e determinística usando **Playwright Test** para cobrir 100% das telas, wizards, rotas, regras de negócio e permissões do Panelinha.

Com o início iminente do **Campeonato de Pontos Corridos (duração de vários meses)**, o design dedica atenção especial às **Ligas/Campeonatos**, simulação de múltiplos turnos/rodadas ao longo do tempo, cálculo de classificação, desempates, prêmios por posição, governança e a atuação de cada perfil de usuário (**Jogador/Member, Organizador, Moderador, Admin, Owner da Comunidade e Master Global**).

A execução será **híbrida**:
1. **Modo Local-First (Padrão/Offline)**: Testes ultrarrápidos isolados em `localStorage`.
2. **Modo Cloud Sync (Supabase Híbrido)**: Validação de sincronização na nuvem e persistência entre sessões de longo prazo.

---

## 2. Infraestrutura Playwright Test

### 2.1 Configuração (`playwright.config.ts`)
- **Base URL**: `http://localhost:3000`
- **Web Server Automático**: Executa `npm run dev` antes dos testes.
- **Browsers**: Chromium (Desktop) e Mobile Chrome.
- **Diretório**: `e2e/`.

### 2.2 Fixtures & Helpers (`e2e/fixtures/`)
- `auth.ts`: Injeção de estado de autenticação por role (`master`, `programmer`, `owner`, `admin`, `moderator`, `organizador`, `member`).
- `seed.ts`: Pré-população de `localStorage` com ligas pré-configuradas (rodadas ativas, times, tabela de pontos corridos) para simulação determinística de campeonatos de longa duração.

---

## 3. Matriz Completa de Roles & Permissões em Ligas e Comunidades

| Papel / Role | Criar / Excluir Liga | Aprovar Governança / Solicit. | Materializar Rodada / Iniciar Jogo | Lançar Resultados de Jogos | Visualizar Tabela, Elenco & Prêmios |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Global Master** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Global Programmer** | ❌ (Leitura) | ❌ | ❌ | ❌ | ✅ |
| **Community Owner** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Community Admin** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Community Moderator** | ❌ (Criação bloquear) | ❌ (Aprovar pedido) | ✅ | ✅ | ✅ |
| **Community Organizador**| ❌ | ❌ | ✅ | ✅ | ✅ |
| **Community Member / Jogador** | ❌ | ❌ (Pode submeter pedido) | ❌ | ❌ | ✅ |

---

## 4. Detalhamento dos 10 Módulos de Testes (Com Foco em Ligas de Pontos Corridos)

### `e2e/01-onboarding.spec.ts` (QuickStart & Boas-Vindas)
- Primeiro acesso sem dados (`/comecar`).
- Adição expressa de elenco e restauração de atletas demonstrativos (`handleRestoreDemoPlayers`).
- Criação inicial da comunidade e transição para o painel.

### `e2e/02-auth-and-account.spec.ts` (Autenticação, Perfil & Sincronização Cloud)
- Rotas `/perfil` e `/perfil/sync`.
- Login, Logout, alternância de contas e exibição do status do sync (`synced`, `pending`, `error`).
- Resolução de pendências de sync (`syncIssueSummary`, `recoverableSyncActions`).
- Exportação e importação de backups JSON.

### `e2e/03-roles-and-permissions.spec.ts` (Teste Extensivo da Matriz de Roles)
- Teste sistemático do comportamento da interface para cada uma das 7 roles (`master`, `programmer`, `owner`, `admin`, `moderator`, `organizador`, `member`).
- Verificação de visibilidade e bloqueio de botões de exclusão, edição de regras, aprovação de membros e botões de governança da liga.

### `e2e/04-player-management.spec.ts` (Gestão de Atletas)
- Cadastro de atletas com notas por fundamento (Saque, Recepção, Ataque, Levantamento, Bloqueio).
- Adição de jogador convidado em rodada/liga (`GuestPlayerModal`).
- Atribuição de posição tática (Levantador, Ponteiro, Oposto, Central, Líbero) e avatar.
- Filtros, busca por nome e confirmação de exclusão.

### `e2e/05-session-wizard.spec.ts` (Wizard de Sorteio de Times para Partidas)
- Seleção de presenças e convidados.
- Balanceamento via Web Worker (algoritmo de distribuição proporcional).
- Troca manual de jogadores entre os times.
- Gestão de rascunhos de sessão (`onResumeDraft` e `onClearDraft`).

### `e2e/06-live-session.spec.ts` (Partida ao Vivo e Marcador de Pontos)
- Contagem de pontos/sets em tempo real.
- Atribuição de pontos individuais (`PointModal` - Aces, Bloqueios, Ataques, Erros).
- Substituição de atletas no decorrer da partida.
- Finalização da partida, relatório final e eleição do MVP da rodada.

### `e2e/07-community-management.spec.ts` (Gestão da Comunidade, Membros e Regras)
- Criação e alternância entre comunidades.
- Código de convite (`joinCode`) e aprovação de membros pendentes (`pending`).
- Alteração de cargos (`set_community_member_role`) e personalização de regras de balanceamento.

### `e2e/08-championship-and-tournament.spec.ts` (Módulo Crítico: Liga de Pontos Corridos)
- **Wizard de Criação de Liga (`ChampionshipWizardView`)**:
  - Escolha do formato **Pontos Corridos** (Round-Robin).
  - Definição de critérios de pontuação (ex: 3 pontos por vitória 2-0/3-0, 2 pontos por vitória no tiebreak 2-1/3-2, 1 ponto por derrota no tiebreak, 0 por derrota normal).
  - Definição de número de turnos (Turno e Returno) e datas recorrentes de rodadas (`generateRoundDates`).
- **Navegação por Abas em `ChampionshipDetailView`**:
  - **Aba Tabela (Standings)**: Cálculo automático de pontos, jogos, vitórias, derrotas, sets pró/contra, saldo de sets, e forma recente (últimos jogos `calculateRecentForm`).
  - **Aba Rodadas (Rounds)**: Navegação entre rodadas (Rodada 1, 2... N), materialização de rodada (`materializeChampionshipRound`) e disparo de partida ao vivo associada à rodada.
  - **Aba Elencos (Lineups)**: Visualização da formação tática na quadra (`VolleyballCourtLineup`) para cada equipe.
  - **Aba Prêmios (Awards)**: Apuração de líderes de estatísticas (Maior pontuador, Rei do Saque/Ace, Rei do Bloqueio, MVP por Posição `calculateAwardsByPosition`).
  - **Aba Governança (Governance)**: Fluxo de solicitações de alteração de partidas, aprovação/rejeição por parte do Owner/Admin (`approveChampionshipRequest`, `rejectChampionshipRequest`).
- **Fluxo por Role no Campeonato**:
  - *Dono/Admin*: Ajusta regras, aprova governança, encerra liga e cancela rodadas.
  - *Organizador/Moderador*: Materializa rodadas, lança placares e inicia jogos.
  - *Jogador*: Acompanha evolução na tabela, seu desempenho individual nas rodadas e estatísticas no ranking de prêmios.

### `e2e/09-ranking-and-history.spec.ts` (Ranking e Histórico de Longo Prazo)
- Filtros de ranking (Geral, Mês, Temporada, Últimas N rodadas).
- Métricas avançadas de longo prazo (taxa de vitória, presença, assiduidade, cartões FutCards).
- Consulta ao histórico de rodadas de ligas passadas.

### `e2e/10-settings-and-sync.spec.ts` (Configurações e Manutenção do Campeonato)
- Painel `/admin` para gestão de perfis globais.
- Resolução de conflitos de dados em campeonatos em andamento (`syncConflicts`).
- Exportação de backup periódico do campeonato em JSON para garantir segurança durante os meses de competição.

---

## 5. Estratégia de Execução Incremental

1. **Configuração da Infraestrutura**: Iniciar com `playwright.config.ts` e scripts no `package.json`.
2. **Construção 1 a 1**: Criar, executar e validar **cada um dos 10 arquivos `.spec.ts` sequencialmente** até obter 100% de luz verde antes de passar ao próximo.
