# Guia de Instalação e Execução - Volley (Panelinha)

Este guia orienta na configuração do ambiente de desenvolvimento e do banco de dados no Supabase para rodar o projeto localmente.

---

## 🚀 Requisitos Prévios

Antes de começar, certifique-se de ter instalado em sua máquina:

- **Node.js** (Versão 18 ou superior recomendada)
- **Gerenciador de pacotes**: `npm` (incluído no Node.js) ou `pnpm`/`yarn` (ambos possuem arquivos de lock no projeto).

---

## 🛠️ Passo a Passo de Instalação

### 1. Instalar as Dependências

Abra o terminal na pasta raiz do projeto e instale os pacotes necessários:

```bash
npm install
```

*(ou se preferir, use `pnpm install` ou `yarn install`)*

---

## ☁️ Configurando o Supabase

O projeto possui integração opcional de sincronização na nuvem com o Supabase. Para que essa funcionalidade funcione:

### 1. Obter Credenciais do Supabase

1. Crie uma conta ou acesse o seu painel em [supabase.com](https://supabase.com/).
2. Crie um novo projeto.
3. No painel do projeto, acesse **Project Settings > API** e copie:
   - **Project URL** (`VITE_SUPABASE_URL`)
   - **API Key** Anon/Public (`VITE_SUPABASE_PUBLISHABLE_KEY`)

### 2. Configurar Variáveis de Ambiente

1. Copie o arquivo `.env.example` para um novo arquivo chamado `.env`:

   ```bash
   cp .env.example .env
   ```

2. Abra o `.env` e preencha as variáveis correspondentes:

   ```env
   # Credenciais do Supabase
   VITE_SUPABASE_URL="https://seu-projeto-ref.supabase.co"
   VITE_SUPABASE_PUBLISHABLE_KEY="sua-anon-public-key"
   ```

### 3. Aplicar o Schema do Banco de Dados

O arquivo contendo a estrutura de tabelas, triggers e RLS (Row Level Security) está localizado em [supabase/migrations/schema.sql](file:///c:/Users/Matheus%20Silva/antigravity/Volley/supabase/migrations/schema.sql).

Você pode aplicar esse schema de duas maneiras:

- **Painel do Supabase**: Acesse **SQL Editor** no console do Supabase, crie uma nova query, cole o conteúdo do arquivo `schema.sql` e clique em **Run**.
- **Via Ferramenta de IA / CLI**: O schema já foi aplicado de forma automatizada no banco remoto associado à configuração deste assistente.

As seguintes tabelas serão criadas:

- `profiles`: Cadastro de organizadores/administradores associados ao Auth do Supabase.
- `communities`: Grupos de comunidade criados pelos organizadores.
- `players`: Cadastro de atletas e atributos físicos/desempenho.
- `community_players`: Tabela de vínculo entre atletas e comunidades.
- `community_rules`: Regras de jogo específicas de cada comunidade (pesos de balanceamento, cores/nomes dos times).
- `whatsapp_list_templates`: Modelos de mensagens e templates configuráveis para convocações do WhatsApp.
- `modification_logs`: Histórico e auditoria de alterações (gerado automaticamente via triggers).

---

## 💻 Como Rodar o Projeto

Após instalar as dependências e configurar o arquivo `.env`, execute o servidor de desenvolvimento local:

```bash
npm run dev
```

O terminal exibirá a URL local (ex: `http://localhost:5173`). Abra o endereço no navegador para utilizar o aplicativo.

---

## 📂 Visão Geral da Sincronização

A sincronização na nuvem do aplicativo é baseada no modelo **local-first**:

1. O aplicativo salva todas as sessões, jogos e relatórios no **LocalStorage** do próprio navegador.
2. Apenas os cadastros essenciais (comunidades, atletas vinculados, regras e templates do WhatsApp) são sincronizados com a nuvem do Supabase quando o usuário clica para fazer o backup ou upload em nuvem na tela de **Sincronização & Backup**.
3. Isso garante que o app funcione offline durante as partidas na quadra sem depender de conexão contínua de internet.
