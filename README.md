# Panelinha Team Balancer

## Getting Started

### Prerequisites

- Node.js 18.x or higher
- Git
- `nvm` (recommended)
- Supabase project (optional, required for cloud sync)

```bash
# Clone the repository
git clone https://github.com/lottarmrs/Volley.git
cd Volley
```

## 1. Database

The database is hosted on Supabase. To create the required tables, triggers, and RLS policies, run the SQL migration in the Supabase SQL Editor:

```text
supabase/migrations/schema.sql
```

## 2. Frontend

```bash
# Install dependencies
npm install

# Copy and configure environment variables
cp .env.example .env
# edit VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY

# Start the development server (port 3000)
npm run dev
```

## Environment Variables

### Frontend (`.env`)

```env
# Supabase
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-publishable-key"

# Legacy fallback, if your project still uses an anon key.
# VITE_SUPABASE_ANON_KEY="your-anon-key"
```

## Database Schema

### Main Models

```text
profiles (Users)
  └── communities (Groups)
        ├── players (Athletes)
        │     └── community_players (Relation)
        ├── community_rules (Weights and game settings)
        └── whatsapp_list_templates (WhatsApp message templates)

modification_logs (Audit trail for inserts, updates, and deletes)
```

## Features

- Player registry with detailed volleyball attributes.
- Team balancing by overall, gender distribution, and fundamentals.
- Free play mode with winner-stays rotation and live scoring.
- Tournament setup with standings, finals, and third-place match.
- Communities with custom rules and attendance tracking.
- Local persistence with optional Supabase cloud sync.

## Tech Stack

- React + Vite + TypeScript
- Tailwind CSS + daisyUI
- Motion
- Lucide React
- Supabase
