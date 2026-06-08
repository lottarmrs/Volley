# Getting Started

## Prerequisites

- **Node.js 18.x** or higher
- **nvm** (recommended)
- **Git**

```bash
# Clone the repository
git clone https://github.com/lottarmrs/Volley.git
cd Volley
```

---

## 1. Database (Supabase)

O banco de dados é hospedado no Supabase. Para aplicar a estrutura do banco de dados (tabelas, triggers e RLS):

1. Acesse o painel do **Supabase > SQL Editor**.
2. Crie uma nova query e execute o conteúdo do arquivo localizado em:
   [supabase/migrations/schema.sql](file:///c:/Users/Matheus%20Silva/antigravity/Volley/supabase/migrations/schema.sql)

---

## 2. Environment Variables

### Frontend (.env)

Crie um arquivo `.env` na raiz do projeto contendo as chaves de conexão do seu projeto Supabase:

```env
# Supabase Configuration
VITE_SUPABASE_URL="https://sua-url-do-projeto.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sua-anon-public-key"
```

---

## 3. Frontend Execution

Navegue para a pasta do projeto e inicie o servidor local de desenvolvimento:

```bash
# Install dependencies
npm install

# Copy and configure environment variables
cp .env.example .env

# Start the dev server (port 3000)
npm run dev
```

---

## Database Schema (Postgres)

### Main Models

```text
profiles (Users)
  └── communities (Groups)
        ├── players (Athletes)
        │     └── community_players (Relation)
        ├── community_rules (Weights, Game Settings)
        └── whatsapp_list_templates (WhatsApp message templates)

modification_logs (Audit trail for inserts, updates, and deletes)
```
