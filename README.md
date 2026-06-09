# Panelinha Team Balancer

## O que é

App para balancear times de vôlei misto, registrar partidas semanais, organizar torneios e acompanhar estatísticas com uma temática inspirada em RPGs clássicos.

## Funcionalidades

- **Recrutamento**: Cadastro de jogadores com atributos detalhados (Saque, Ataque, Defesa, etc.).
- **Atributos de Elite**: Cálculos de Overall baseados em pesos de posição (Ponteiro, Levantador, etc.).
- **Balanceamento Inteligente**: Algoritmo que busca igualar Overall médio, distribuição de gêneros e fundamentos específicos.
- **Comunidades**: Organização de grupos, presença e regras personalizadas.
- **Modo Jogo Livre**:
  - Sistema de rotação "Ganhou Fica".
  - Regra de "3 partidas e sai" (limite de permanência em quadra).
  - Placar ao vivo com registro de proezas individuais.
- **Torneios**: Configuração de formato, tabela, final, disputa de terceiro lugar e critérios de classificação.
- **Crônicas do Confronto**: Histórico de pontos detalhado e ranking de pontuadores (MVP).
- **Persistência e Nuvem**: Dados salvos localmente com sincronização opcional via Supabase.

## Regras de Jogo (Configuráveis)

- **Pontuação**: 12, 15, 21 ou 25 pontos.
- **Desempate**: "3 Direto" (cap +2) ou "Vai a 2".
- **Rotação**: Limite de partidas consecutivas para garantir que todos joguem.

## Como rodar

### Pré-requisitos

- **Node.js 18.x** ou superior
- **Git**
- **nvm** recomendado

### Instalação

```bash
git clone https://github.com/lottarmrs/Volley.git
cd Volley
npm install
cp .env.example .env
npm run dev
```

O servidor de desenvolvimento roda na porta `3000`.

### Variáveis de ambiente

Configure o `.env` com as chaves públicas do seu projeto Supabase para ativar login e sincronização em nuvem:

```env
VITE_SUPABASE_URL="https://sua-url-do-projeto.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sua-chave-publica"
```

## Banco de Dados

O banco de dados é hospedado no Supabase. Para aplicar a estrutura com tabelas, triggers e RLS, execute o conteúdo de [`supabase/migrations/schema.sql`](supabase/migrations/schema.sql) no **Supabase > SQL Editor**.

### Modelos principais

```text
profiles (Usuários)
  └── communities (Grupos)
        ├── players (Atletas)
        │     └── community_players (Relação)
        ├── community_rules (Pesos e regras de jogo)
        └── whatsapp_list_templates (Modelos de lista para WhatsApp)

modification_logs (Auditoria de inserts, updates e deletes)
```

## Estrutura Técnica

- **React + Vite + TypeScript**
- **Tailwind CSS**: Estilização temática dark/RPG.
- **daisyUI**: Componentes e tema visual.
- **Motion (Framer Motion)**: Animações e transições fluidas.
- **Lucide React**: Iconografia.
- **Supabase**: Autenticação e sincronização em nuvem.
