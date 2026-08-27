# Especificação Técnica Completa (Full Spec) — Volley / Panelinha Team Balancer

> **Documento:** Especificação Técnica e Funcional do Produto  
> **Data:** 29 de Julho de 2026  
> **Versão:** 2.0 (Fase Produto Escalável & Cloud-First Architecture)  
> **Status:** Aprovado / Em Implementação  

---

## 1. Visão Geral do Produto

**Volley** (originalmente *Panelinha Team Balancer*) é uma plataforma completa para organização, gestão e acompanhamento estatístico de partidas de vôlei amador.

O produto combina uma abordagem **Local-First** (operação 100% funcional sem dependência constante de conexão de rede ou cadastro prévio) com **Sincronização Nuvem Opcional via Supabase**, permitindo governança multi-comunidades, identidades globais de atletas, ranking gamificado e backup resiliente.

### 1.1 Objetivos Principais
- **Balanceamento Inteligente:** Algoritmo de otimização de times baseado em 11 atributos técnicos, gênero, altura, posições em quadra (6x0, 5x1) e histórico de parcerias.
- **Gestão de Sessões e Jogos:** Acompanhamento ao vivo de partidas (Rei da Quadra / Free Play, Torneios com Chaveamento e Ligas de Pontos Corridos) com registro em tempo real de estatísticas e eventos (Ataques, Aces, Bloqueios, Largadas, Erros).
- **Identidade Única do Atleta (Global Identity):** Separação entre contas de usuário (`auth.users`) e perfil canônico de atleta (`players`), permitindo cartões de estatísticas (FUT Cards) e evolução de carreira.
- **Comunidades e RBAC:** Organização em grupos independentes com níveis de permissão finos (*Owner*, *Admin*, *Moderator*, *Member*) e regras de balanceamento personalizadas.
- **Gamificação Resiliente (VUT & Conquistas):** Cálculo determinístico do *Valor Único de Transferência* (VUT) e conquistas baseadas estritamente em eventos operacionais confirmados na nuvem.
- **Integração WhatsApp:** Gerador de listas de chamada e templates formatados para grupos de mensagem, incluindo controle de chave PIX e reservas.

---

## 2. Arquitetura e Design System de Código

O sistema adota uma arquitetura em camadas bem definida (*Clean / Hexagonal Architecture*), isolando regras de negócio puras da infraestrutura e dos componentes de interface.

```text
src/
├── app/                 # Bootstrap da aplicação, roteamento, providers e guards
├── domain/              # Regras de negócio puras, invariantes e permissões
├── application/         # Casos de uso (Use Cases), gateways, Screen Models e View Models
├── infra/               # Adaptadores de I/O (Supabase RPCs, REST, adaptadores de rede)
├── storage/             # Repositório local, Outbox queue, migrações do localStorage
├── ui/                  # Componentes de apresentação e views (React 19 + Tailwind CSS 4)
├── logic/               # Motores numéricos (Balancer Worker, FUT Cards, VUT, Torneios)
└── shared/              # Tipos TypeScript consolidados, constantes e utilitários
```

### 2.1 Princípios Arquiteturais
1. **Cloud-First Autoritativa com Operação Local:** A nuvem é a fonte autoritativa de identidade e membros. A operação em quadra possui cache local e fila de modificações (*Outbox*) isolada por conta e comunidade.
2. **Separação Rígida Apresentação x Negócio:** Componentes React consomem estritamente `ScreenModel` e emitem `Intent`. Nenhuma chamada direta ao Supabase ou `localStorage` é feita a partir de componentes de UI.
3. **Idempotência e Segurança SQL:** Todas as operações que alteram estado na nuvem utilizam chaves de idempotência. Autorizações críticas passam por `Row Level Security` (RLS) e funções `SECURITY DEFINER` com `search_path = public` explícito.
4. **Web Workers para Carga Computacional:** O motor de balanceamento executa em Web Worker (`balancer.worker.ts`) para evitar bloqueios na Thread Principal da UI.

---

## 3. Modelo de Domínio e Entidades Principais

### 3.1 Atleta e Identidade (`Player`)
- **Identificador Único:** `id` (UUID imutável).
- **Atributos Técnicos (0 a 10):**
  - *Ataque*, *Saque*, *Recepção*, *Levantamento*, *Bloqueio*, *Defesa*.
  - *Velocidade*, *Resistência*, *Leitura de Jogo*, *Regularidade*, *Controle Emocional*.
- **Posição Primária e Secundárias:** Levantador, Oposto, Ponteiro, Central, Líbero, All-rounder.
- **Gênero & Biometria:** Gênero (`M`/`F`), Altura (cm), Mão Dominante (`direita`/`esquerda`).
- **Avaliações:**
  - *Autoavaliação (Self-evaluation):* Preenchida pelo próprio atleta, global.
  - *Avaliação Oficial (Official evaluation):* Registrada por administradores de comunidades. A nota oficial da comunidade é calculada por média ponderada de avaliações autorizadas, isolando a autoavaliação.
- **Vínculo com Conta de Usuário (`userId`):** Relação 1:1 rigorosa entre `auth.users` e `Player`. Atletas históricos offline utilizam o sistema de *Claim Code* (`legacy_code`) para reinvindicação atômica e remapeamento de histórico.

### 3.2 Comunidade (`Community`)
- **Papéis (*RBAC*):**
  - `owner`: Gestor principal, controle total e transferência de propriedade.
  - `admin`: Gerenciamento de membros, sessões, aprovação de avatares e reivindicação de atletas.
  - `moderator`: Operação de sessões e placar ao vivo.
  - `member`: Leitura, presença em sessões e visualização de rankings.
- **Configurações Locais (`CommunityRules`):** Overrides de pesos do balanceador e metas de pontuação padrão.

### 3.3 Sessão e Operação em Quadra (`Session`)
- **Modos de Jogo (`SessionType`):**
  - `free_play`: Rotação contínua ("Rei da Quadra").
  - `tournament`: Chaveamento (Grupos + Mata-mata: Semifinal, Bronze, Final).
  - `championship`: Liga de Pontos Corridos.
- **Eventos de Pontuação (`PointEvent`):**
  - `kind`: `attack`, `ace`, `block`, `tip` (larga), `error`, `fault`.
  - `assistedBy`: ID do atleta que efetuou a assistência.
  - `highlight`: Destaques técnicos.

---

## 4. Algoritmo de Balanceamento de Times

O balanceador de times é um dos motores centrais do Volley. Ele realiza uma busca combinatória para encontrar a distribuição ideal de atletas entre $N$ times.

### 4.1 Vetor de Força e Métricas Ponderadas
Cada time $T$ possui uma força calculada como:

$$S(T) = \sum_{k} w_k \cdot f_k(T)$$

Onde $f_k(T)$ representa a média ponderada do atributo $k$ dos jogadores do time, ajustada pelos seguintes fatores:
- **Piso de Distribuição de Gênero (`GENDER_WEIGHT_FLOOR`):** Penaliza disparidades excessivas de atletas masculinos e femininos entre times.
- **Cobertura de Posições (Sistema 6x0 ou 5x1):** Verifica a presença de levantadores e especialistas de ataque/defesa.
- **Fator de Parceria Historica (Matriz de Repetição):** Aplica penalização quando atletas jogaram juntos em sessões recentes, promovendo rotação de parceiros.
- **Ajuste de Lesão e Altura Média:** Atletas lesionados recebem peso adaptativo conforme o perfil da sessão.

### 4.2 Perfis de Peso Configuráveis
1. **Equilibrado (`balanced`):** Distribuição uniforme de força e fundamentos.
2. **Competitivo (`competitive`):** Foco em ataque, levantamento, bloqueio e cobertura de posições.
3. **Social (`social`):** Prioriza equidade de gênero, tamanho dos times e integração.
4. **Misto (`mixed`):** Balanceamento rígido para ligas mistas obrigatorias.

### 4.3 Diagnóstico de Qualidade
O balanceador retorna um score de qualidade (0 a 100%) baseado no desvio padrão relativo entre a força dos times:

$$\text{VarianceScore} = 100 \times \left(1 - \frac{\sigma(S(T_1), \dots, S(T_n))}{\mu(S(T_1), \dots, S(T_n))}\right)$$

---

## 5. Gamificação: VUT & Cartões FUT

### 5.1 Cartões FUT (`futCards.ts`)
O sistema gera estatísticas estilo FIFA FUT Card para cada atleta:
- **OVR (Overall General):** Média ponderada dos atributos principais.
- **PAC (Pace/Velocidade):** Derivado de Velocidade + Resistência.
- **SHO (Shooting/Ataque):** Derivado de Ataque + Saque.
- **PAS (Passing/Passe):** Derivado de Levantamento + Recepção.
- **DRI (Dribble/Leitura):** Leitura de Jogo + Regularidade.
- **DEF (Defense):** Defesa + Bloqueio.
- **PHY (Physical/Físico):** Altura + Controle Emocional + Resistência.

### 5.2 Valor Único de Transferência (VUT)
O VUT é a pontuação global de carreira do atleta na plataforma.
- **Caráter Puro e Determinístico:** É calculado unicamente a partir de eventos operacionais confirmados na nuvem (vitórias, pontos marcados, aces, bloqueios, taxa de participação e prêmios).
- **Sem Fator Subjetivo:** Avaliações de administradores ou autoavaliações **não** alteram o VUT.
- **Provisório vs Confirmado:** Durante partidas offline, o VUT exibe um ganho provisório local que se consolida após o upload da sessão.

---

## 6. Sincronização e Arquitetura Offline-First

### 6.1 Fluxo do Outbox
Todas as mutações geradas em quadra seguem o ciclo de vida do Outbox Queue:

```text
[Ação do Usuário]
       │
       ▼
(completed_local) ──► Gravado instantaneamente no localStorage / Repositório Local
       │
       ▼
(pending_upload)  ──► Fila de envio aguardando conexão
       │
       ▼
  [Sync Engine]    ──► Processa via Supabase RPCs idempotentes
       │
       ├──► Falha de rede: Re-tentativa com Exponential Backoff (recoverable_error)
       └──► Sucesso: (cloud_confirmed) ──► Atualiza status local
```

### 6.2 Isolamento de Dados
- O cache local é estritamente particionado por `auth_user_id` e `community_id`.
- Ao realizar logout, a fila pendente é mantida isolada e encriptada/protegida até que a mesma conta efetue login novamente, impedindo vazamento de dados entre usuários do mesmo dispositivo.

---

## 7. Esquema do Banco de Dados Cloud (Supabase / Postgres)

O banco de dados utiliza esquemas relacionais enriquecidos com RLS e RPCs de segurança:

```text
profiles (auth.users extension)
  ├── id (UUID, PK -> auth.users)
  ├── username (TEXT, UNIQUE)
  ├── role (global_role: master | programmer | user)
  └── created_at / updated_at

players (Atletas)
  ├── id (UUID, PK)
  ├── user_id (UUID, FK -> profiles.id, NULLABLE)
  ├── legacy_code (TEXT, UNIQUE, NULLABLE)
  ├── nome, apelido, genero, posicao_principal
  ├── atributos (JSONB)
  └── status, avatar_url, metadata

communities (Grupos)
  ├── id (UUID, PK)
  ├── name, slug, description, avatar_url
  ├── rules (JSONB)
  └── created_by (FK -> profiles.id)

community_members
  ├── community_id (FK -> communities.id)
  ├── user_id (FK -> profiles.id)
  ├── role (owner | admin | moderator | member)
  └── status (active | pending | invited | rejected)

sessions -> teams -> games -> point_events -> game_reports -> session_reports
  └── Tabela de sincronização operacional de partidas

modification_logs (Audit Trail)
  ├── id, actor_id, table_name, operation, payload, timestamp
```

---

## 8. Matriz de Autorização e RBAC (RLS Policies)

| Recurso / Operação | Anônimo | Membro | Mod | Admin | Owner | Master |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Criar Conta / Onboarding** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Visualizar Comunidade Pública** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Operar Sessão Local (Offline)** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Enviar Sessão para Nuvem** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Editar Avaliação Oficial do Atleta** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Reivindicar Atleta Historico (Claim)** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Alterar Papel de Membro (RPC)** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Deletar Comunidade** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

---

## 9. Plano de Testes e Qualidade

O projeto conta com uma suíte de testes automatizados com execução contínua:

1. **Testes Unitários de Domínio (`npm run test:unit`):**
   - Validação de cálculos do balanceador, invariantes de sessão, motor de torneios e normalização de usernames.
   - Utiliza Node.js Native Test Runner com `tsx`.
2. **Testes de Componentes e UI (`npm run test:ui`):**
   - Validação de hooks, contextos React e comportamento de telas.
   - Utiliza Vitest, React Testing Library e `jsdom`.
3. **Testes SQL e RLS (`supabase/tests`):**
   - Matriz de segurança para validar autorizações e negações explícitas de RLS e RPCs.
4. **Verificação de Build e Linters (`npm run lint` & `npm run build`):**
   - Type check rigoroso (`tsc --noEmit`), ESLint e verificação de formatação.

---

## 10. Roteiro de Evolução do Produto (Roadmap)

### Fase Atual: Produto Escalável (Concluindo)
- [x] Arquitetura Cloud-First com Outbox offline.
- [x] Sistema de Identidade Canônica 1:1 e Claim Code de atletas.
- [x] RBAC de Comunidades via RPCs seguras.
- [x] Separação entre Autoavaliação, Avaliação Oficial e VUT.

### Próxima Fase: Experiência & Interface (UX/UI)
- [ ] Implementação da nova Arquitetura de Informação centrada em Comunidades (Início, Comunidades, Agenda, Meu Perfil).
- [ ] Microinterações e animações com Framer Motion.
- [ ] Visualização aprimorada de FUT Cards e conquistas com efeitos 3D / esqueumorfismo tátil.
- [ ] Code splitting e otimização do tamanho de bundle.

---
*Este documento serve como referência canônica de especificação do produto Volley para desenvolvedores, arquitetos e partes interessadas.*
