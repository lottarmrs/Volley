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

```bash
# A ordem correta NÃO é a ordem alfabética do diretório: `schema.sql` precisa vir primeiro,
# e ele ordena por último entre os nomes (dígito ordena antes de letra). Este comando lista
# na ordem em que devem ser aplicadas, e é a mesma ordem que o harness de teste usa.
ls supabase/migrations/*.sql | grep -v '/schema\.sql$' | sort | sed '1i supabase/migrations/schema.sql'
```

`schema.sql` mais todas as migrations datadas. Não mantenha uma lista fixa aqui — a anterior
ficou para trás sem ninguém notar, e quem a seguisse ao pé da letra provisionaria um banco sem
MFA obrigatório, sem eventos de carreira, sem posse de sessão e sem toda a cadeia de identidade,
comunidade e Session das ondas W2 a W4.

> ⚠️ Running only `schema.sql` or only the first backend migration leaves cloud sync, RBAC, avatar approval, join requests, player linking and membership RPCs incomplete.

`20260902141626_finalize_session_roster.sql` adiciona o comando que materializa uma Registration
travada no roster da Session; ele não disponibiliza uma interface de navegador.

`20260904132823_legacy_registration_introduction.sql` introduz a Registration alvo em uma Session já
migrada do modelo legado: razão de proveniência privada, predicado de elegibilidade compartilhado,
inspeção e o comando de introdução.

`20260905185744_versioned_player_evaluation_source.sql` introduz o modelo de origem versionado da
avaliação de Player: a responsabilidade EVALUATOR que concede player.evaluate, a tabela de
contribuições append-only com uma linha efetiva por avaliador, Player e Community, os escores de
dimensão normalizados e o comando record_player_evaluation.

`20260906130635_skill_rubric_contract.sql` registra a rubric experimental `v0-legacy-11`, com as
onze dimensões do cliente e proveniência explícita. Vincula cada escore à versão da contribuição,
valida dimensões permitidas/obrigatórias e oferece `skill_rubric_dimensions_for` para consulta por
versão. As dimensões dessa primeira versão são opcionais; ausência continua diferente de zero.
A migration exige que `player_evaluation_contributions` e `player_evaluation_dimension_scores`
estejam vazias e recusa dados existentes explicitamente. Aplicá-la a uma base com avaliações exige
uma estratégia de migração histórica separada. Esta etapa não altera a interface nem o balanceador.

`20260906231744_community_skill_profile.sql` adiciona `get_community_player_skill_profile`, consulta
protegida por `player.evaluate` e vínculo vivo do atleta na comunidade. Calcula a média filtrada do
legado por fundamento, sob demanda, com política experimental `v0-legacy-mad-mean`, versão da rubric,
revisão da origem e contagens de cobertura. Ausência retorna null, sem inventar nota. No editor de
atleta vinculado à nuvem, selecione uma comunidade vinculada e use **Consultar perfil**. Nesta etapa
W5-03 o painel consultava somente a nova origem; a etapa seguinte adiciona o editor versionado, mas
o sorteio ainda não consome esse perfil. Não há migração automática de avaliações nem perfil
materializado nesta etapa.

`20260907010305_community_evaluation_editor.sql` adiciona a ativação explícita do modelo por
comunidade, a concessão separada da responsabilidade `EVALUATOR` e o editor online versionado.
Depois da ativação, gravações legadas são recusadas pelo banco; avaliações antigas permanecem apenas
como histórico. O editor não funciona offline nem concede permissão por cargo administrativo. O
cadastro cloud salva apenas o perfil do atleta; a avaliação é uma ação explícita no editor da
comunidade e usa a origem versionada. O fluxo local-only continua compatível com o formulário legado.
O sincronizador em nuvem filtra coortes target por consulta RPC em lote antes de enviar avaliações
legadas; falhas inesperadas interrompem a escrita para evitar misturas de autoridade.

`20260908031027_global_skill_profile.sql` acrescenta o cálculo interno do perfil global por
Player/rubric. Cada comunidade contribui uma vez por fundamento disponível, com média de peso igual
sob a política experimental `v0-equal-community-mean`. Reutiliza a média filtrada das comunidades,
preserva dados ausentes e registra as revisões de origem. A função é privada, sem acesso pelo
navegador; o RPC de perfil da comunidade mantém suas permissões. A integração ao sorteio depende
da etapa posterior de snapshots autorizados. Não há tabela de perfil nem job de atualização.

`20260908170000_balance_input_snapshots.sql` congela as entradas do balanceador. Para uma Session
target de comunidade em `DRAFT` ou `SCHEDULED`, o organizador designado captura uma revisão exata do
elenco em um artefato privado e imutável, com `capture_balance_input_snapshot` e
`read_balance_input_snapshot`. O comando aceita apenas identificadores — o navegador nunca envia
vetor de atributo. A única origem de avaliação é o perfil global privado da W5-04; atributo legado,
autoavaliação, Overall, forma e nota de exibição ficam de fora. Dimensão que o elenco avaliado nunca
observou recebe a média do próprio elenco, e 5 quando não há observação nenhuma — política
`v0-global-roster-mean-5`. Estimativa não entra na média nem sobrescreve valor observado, e cada
dimensão estimada é listada. Comunidade que ainda não ativou o modelo novo interrompe a captura em
vez de ser descartada em silêncio. O snapshot não muda quando as origens mudam depois, não tem
concessão para papel de navegador e não altera o sorteio atual: consumir essas entradas é fatia
posterior.

`20260909090000_target_session_current_roster_revision.sql` acrescenta `current_roster_revision_id`
ao retorno de `read_target_session`: a revisao de elenco mais recente da Session, ou `null` quando
nenhuma revisao existe ainda. E a mesma revisao que `capture_balance_input_snapshot` aceita -- sem
essa coluna o navegador nao tinha como descobrir o identificador que o comando exige, e a captura
ficava impossivel de chamar a partir do app. Nao altera autorizacao, o filtro de Session target nem
o "nao encontrado"; so acrescenta a coluna.

`20260908160000_security_audit_remediation.sql` atende os dez achados da auditoria de 2026-09-08
(`docs/security-audit/relatorio-auditoria-seguranca.pdf`). Revoga das três RPCs de carreira o
`execute` a `authenticated` — eram `security definer` sem verificação alguma; o cadastro continua
recalculando a carreira porque o trigger de signup resolve a chamada com os privilégios da dona.
Escopa `reset_product_data` na conta alvo, que a assinatura já prometia mas os DELETE ignoravam.
Restaura `log_table_changes` a `security definer` e remove a policy `with check (true)` que abria a
trilha de auditoria para qualquer conta forjar linha. `find_player_by_username` deixa de revelar o
nome real a quem não compartilha comunidade com o atleta, sem quebrar a checagem de username livre;
`community_capabilities` deixa de ser sondável para usuário arbitrário. As policies de UPDATE/DELETE
de `community_rules`, `whatsapp_list_templates` e `community_players` passam a exigir papel atual
**e** posse, alinhando-se ao INSERT — quem foi rebaixado perde a escrita sobre linhas que criou,
inclusive pelo caminho de sync. No bucket de avatares, o prefixo `proposals/` sai da leitura
anônima na API autenticada e fica visível apenas a quem administra aquele atleta.
O décimo achado é atendido fora do banco, pelo Content-Security-Policy adicionado ao `nginx.conf`.

> ⚠️ **A9 não está fechado.** A review independente mostrou que o bucket `avatars` é criado
> com `public = true`, e bucket público é servido sem avaliar policy de `storage.objects` —
> então quem souber o caminho continua lendo uma proposta não aprovada. As policies acima
> fecham a API autenticada, não esse caminho. Fechar exige bucket privado com URL assinada
> ou cópia para um prefixo realmente público na aprovação; está registrado no HANDOFF.
> O `schema.sql` recebeu as versões corrigidas de `reset_product_data` e `log_table_changes`, mas
> **mantém de propósito** a `find_player_by_username` antiga: a endurecida consulta uma tabela que o
> snapshot não cria, e como a função é `language sql` o arquivo deixaria de subir. Aplique
> `schema.sql` e depois as migrations, na ordem que o comando de ordenação acima lista — é a
> migration que manda no resultado.

`20260910100000_set_community_organizer.sql` adiciona `set_community_organizer`, o comando que
concede e revoga a responsabilidade `ORGANIZER` em `community_responsibilities`. Até aqui essas
linhas só existiam por um backfill único da `20260827150000`, a partir do `community_members.role`
legado; `set_community_member_role` nunca escreve essa tabela, então `create_target_session` ficava
utilizável só por quem já era organizador quando o backfill rodou, e inacessível a qualquer promoção
posterior. Exige `community.members.manage` de quem concede, membro ativo como alvo e `p_enabled`
não nulo; revogar não exige que uma concessão anterior exista. Diferente de `set_community_evaluator`,
não exige a ativação do modelo de avaliação da comunidade — organizar uma Session e avaliar atletas
são responsabilidades independentes, e acoplá-las tornaria a virada de avaliação um pré-requisito
para simplesmente marcar uma partida.

`20260914120000_mirror_community_members_to_target.sql` espelha `community_members` em
`community_memberships` e `community_responsibilities` por trigger, para Comunidades legadas. Todo
RPC do painel de membros continuava escrevendo só na tabela antiga, então membro novo não tinha
membership, membro removido mantinha a sua e promover a Organizador nunca concedia `ORGANIZER`.
O cargo `organizador` agora concede e revoga `ORGANIZER`, e perder a membership revoga todas as
responsabilidades. A migration reconcilia a divergência acumulada desde `20260827140000`, registra
em `app_private.migration_anomalies` as Comunidades legadas sem exatamente um dono (que ficam de
fora) e guarda em `migration_runs.notes` a divergência medida antes e depois;
`app_private.community_membership_drift()` a mede a qualquer momento. Comunidades target não são
espelhadas. A mesma migration corrige `prevent_last_community_owner_change`, que cancelava em
silêncio o DELETE de quem não era dono: `remove_community_member` e `leave_community` nunca tinham
removido ninguém além de donos.

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

## Documentation

- [Auth Production Checklist](docs/operations/auth-production-checklist.md) — repeatable operator checklist for production deployment.
- [Scalable Product Restructure Design Spec](docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md) — approved architecture and requirements.
