# Panelinha Team Balancer

App local-first para organizar vôlei amador: cadastro de atletas, balanceamento automático de times, sessões ao vivo com placar, torneios, ranking, comunidades, listas de WhatsApp e sincronização opcional com Supabase.

> **Local-first:** o app funciona 100% offline, sem conta e sem Supabase. Todos os dados ficam no `localStorage` do navegador. O Supabase é opcional e serve apenas para backup/sincronização em nuvem.

## Requirements

- **Node.js 20 or higher** (Node 22 recommended — see `.nvmrc`)
- npm (the project uses `package-lock.json`)
- Git
- `nvm` (recommended)
- Supabase project (**optional** — only for cloud sync)

> ⚠️ Node 18 or lower will fail: Vite 6 requires Node ≥ 20 in practice, and the test script uses `node --import tsx`, which requires Node ≥ 20.6.

## Getting Started

```bash
# Clone the repository
git clone https://github.com/lottarmrs/Volley.git
cd Volley

# Use the right Node version (reads .nvmrc)
nvm use

# Install dependencies
npm install

# Start the development server → http://localhost:3000
npm run dev
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Development server on port **3000** (host 0.0.0.0) |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Type check (`tsc --noEmit`) |
| `npm test` | Unit tests (Node test runner + tsx) |
| `npm run clean` | Remove `dist/` |

## Environment Variables (optional)

Only needed for cloud sync. Without a `.env`, the app runs fully in local mode (a console warning is shown and the "Nuvem & Conta" tab stays disabled).

```bash
cp .env.example .env
```

```env
# Supabase
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-publishable-key"

# Legacy fallback, if your project still uses an anon key.
# VITE_SUPABASE_ANON_KEY="your-anon-key"
```

## Supabase Setup (optional)

1. Create a project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run the migrations **in this exact order**:

```text
1. supabase/migrations/schema.sql
2. supabase/migrations/20260609120000_backend_operational_sync.sql
```

> ⚠️ Running only `schema.sql` leaves the sync of sessions, teams, games and point events broken — the second migration creates the operational tables and the community membership model.

3. Fill in `.env` with your project URL and publishable key.
4. In the app, open **Nuvem & Conta**, create an account and use *Enviar para nuvem* / *Baixar da nuvem* / *Sincronizar*.

### Database Schema

```text
profiles (Users)
  └── communities (Groups)
        ├── players (Athletes)
        │     └── community_players (Relation)
        ├── community_members (Users with roles: owner/admin/organizer)
        ├── community_rules (Weights and game settings)
        ├── whatsapp_list_templates (WhatsApp message templates)
        └── sessions → teams, games, point_events,
                       game_reports, session_reports (operational sync)

modification_logs (Audit trail for inserts, updates, and deletes)
```

## Troubleshooting

| Problem | Cause / Fix |
|---|---|
| `node: bad option: --import` when running `npm test` | Node < 20.6. Run `nvm use` (or `nvm install 22`). |
| `npm run dev` fails or Vite errors on startup | Node < 20. Run `nvm use`. |
| "Supabase environment variables are missing" in console | Expected without `.env`. Harmless in local mode; create `.env` to enable cloud sync. |
| Cloud sync fails for sessions/games | The second migration was not applied. Run `20260609120000_backend_operational_sync.sql`. |
| Data disappeared after clearing browser data | Local data lives in `localStorage`. Use **Configurações → Exportar Backup (JSON)** regularly, or create an account and sync to the cloud. |

## Features

- Player registry with detailed volleyball attributes.
- Team balancing by overall, gender distribution, and fundamentals.
- Free play mode with winner-stays rotation and live scoring.
- Tournament setup with standings, finals, and third-place match.
- Communities with custom rules and attendance tracking.
- WhatsApp list templates (lineups, slots, PIX payment info).
- JSON backup export/import.
- Local persistence with optional Supabase cloud sync.

## Tech Stack

- React 19 + Vite 6 + TypeScript
- Tailwind CSS 4 + daisyUI 5
- Motion (animations)
- Lucide React (icons)
- Recharts (charts)
- Supabase (`@supabase/supabase-js`)
- Node test runner + tsx (unit tests)
