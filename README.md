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

| Command             | Description                                        |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Development server on port **3000** (host 0.0.0.0) |
| `npm run build`     | Production build → `dist/`                         |
| `npm run preview`   | Serve the production build locally                 |
| `npm run lint`      | Type check (`tsc --noEmit`)                        |
| `npm test`          | All tests (`test:unit` + `test:ui`)                |
| `npm run test:unit` | Logic/service tests (Node test runner + tsx)       |
| `npm run test:ui`   | Hook/component tests (Vitest + RTL + jsdom)        |
| `npm run clean`     | Remove `dist/`                                     |

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
2. Apply the complete migration chain from `supabase/migrations`, in chronological filename order. Prefer the Supabase CLI (`supabase db push`) for a linked project. If using the SQL Editor, run every file in order, starting with `schema.sql` and continuing through the latest dated migration.

```text
supabase/migrations/schema.sql
supabase/migrations/20260610161203_backend_operational_sync.sql
supabase/migrations/20260610161236_upsert_conflict_targets.sql
supabase/migrations/20260610161256_global_athlete_identity.sql
supabase/migrations/20260610195250_harden_function_security.sql
supabase/migrations/20260615200155_point_event_taxonomy.sql
supabase/migrations/20260617180615_community_players_optimization.sql
supabase/migrations/20260618154732_point_event_kind_and_assist.sql
supabase/migrations/20260623133702_game_multiset_sets_and_targets.sql
supabase/migrations/20260623133849_drop_redundant_game_multiset_columns.sql
supabase/migrations/20260624133117_player_avatars_approval.sql
supabase/migrations/20260624133200_player_evaluations.sql
supabase/migrations/20260624133252_link_user_to_player_with_approval.sql
supabase/migrations/20260624133328_unlink_player_rpc.sql
supabase/migrations/20260624133529_rbac_global_roles_and_hardening.sql
supabase/migrations/20260624134502_harden_trigger_functions.sql
supabase/migrations/20260624141708_role_management_rpc.sql
supabase/migrations/20260624203424_community_model_v2.sql
supabase/migrations/20260624204113_community_join_system.sql
supabase/migrations/20260625182618_fix_profile_signup_role.sql
supabase/migrations/20260625192530_community_discovery.sql
supabase/migrations/20260629201136_harden_avatar_storage_update_policy.sql
supabase/migrations/20260629212554_linked_player_self_read.sql
supabase/migrations/20260707143343_community_member_role_remove_rpc.sql
```

> ⚠️ Running only `schema.sql` or only the first backend migration leaves cloud sync, RBAC, avatar approval, join requests, player linking and membership RPCs incomplete.

3. Confirm Data API access for the exposed `public` tables. New Supabase projects may not expose newly created tables to the Data API automatically; the migrations grant access to `authenticated`, but the project Data API settings still need to expose the intended schema/tables.
4. Fill in `.env` with your project URL and publishable key.
5. In the app, open **Nuvem & Conta**, create an account and use _Enviar para nuvem_ / _Baixar da nuvem_ / _Sincronizar_.

### Database Schema

```text
profiles (Users)
  └── communities (Groups)
        ├── players (Athletes)
        │     └── community_players (Relation)
        ├── community_members (Users with roles: owner/admin/moderator/member)
        ├── community_rules (Weights and game settings)
        ├── whatsapp_list_templates (WhatsApp message templates)
        └── sessions → teams, games, point_events,
                       game_reports, session_reports (operational sync)

modification_logs (Audit trail for inserts, updates, and deletes)
```

## Troubleshooting

| Problem                                                 | Cause / Fix                                                                                                                               |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `node: bad option: --import` when running `npm test`    | Node < 20.6. Run `nvm use` (or `nvm install 22`).                                                                                         |
| `npm run dev` fails or Vite errors on startup           | Node < 20. Run `nvm use`.                                                                                                                 |
| "Supabase environment variables are missing" in console | Expected without `.env`. Harmless in local mode; create `.env` to enable cloud sync.                                                      |
| Cloud sync, RBAC, join requests or player linking fail  | The full Supabase migration chain was not applied. Run all files in `supabase/migrations` in chronological filename order.                |
| Data disappeared after clearing browser data            | Local data lives in `localStorage`. Use **Configurações → Exportar Backup (JSON)** regularly, or create an account and sync to the cloud. |

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
