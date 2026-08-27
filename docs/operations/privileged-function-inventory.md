# Privileged PostgreSQL Function Inventory

> Status: `CURRENT-OPERATIONAL / W0-INVENTORY-SEED`
>
> Owner: `Security + Data + Platform Operations`
>
> Last reviewed: `2026-08-26 / C7-R3`
>
> Governing target: [`N2.16-security-privacy-lgpd.md`](../architecture/security/N2.16-security-privacy-lgpd.md), [`N2.21-operations-deploy.md`](../architecture/operations/N2.21-operations-deploy.md), C6 W0.

---

# 0. Purpose

Every reachable privileged database function is an application/security endpoint, not a harmless SQL helper.

The target review record for each function is:

```text
function identity
owner
purpose
reachable by which roles
authenticated actor derivation
SECURITY INVOKER / DEFINER
search_path posture
fully-qualified references
authorization predicate
AAL/step-up policy
RLS interaction
idempotency/concurrency behavior
audit/telemetry expectation
test evidence
migration/removal state
```

The target hardening default for `SECURITY DEFINER` is:

```text
SET search_path = ''
+
fully-qualified object references
+
explicit grants/revokes
+
server-derived actor/capability checks
```

A legacy function may temporarily differ, but the difference must be visible in this inventory and mapped to W0/W14.

---

# 1. Inventory completeness rule

This file is a **seed created by C7 remediation**, not a claim that every function has already been mechanically enumerated.

Before any high-risk authority cutover, W0 must generate/verify the complete list from PostgreSQL catalogs and migration sources.

Required catalog sources include at least:

```text
pg_proc
pg_namespace
prosecdef / SECURITY DEFINER flag
proconfig / search_path
function ACLs / EXECUTE grants
pg_policies / RLS context where relevant
```

Exit gate:

```text
reachable privileged functions discovered
=
inventory rows
```

with zero unexplained omissions.

---

# 2. Known privileged / security-sensitive functions

The following entries are directly evidenced by current repository code, tests, migrations or historical operational records.

| Function / family | Current evidence | Current posture | Target status | Required W0 action |
|---|---|---|---|---|
| `reset_product_data(...)` | historical production reset runbook/migrations | privileged destructive function; historical runbook records `SECURITY DEFINER`, `search_path = public`, capability + AAL2 | `LEGACY / EXCEPTIONAL`; not normal migration mechanism | determine whether function remains reachable; if retained, harden to target pattern and classify BREAK-GLASS; otherwise revoke/remove through versioned migration |
| `require_aal2()` | historical runbook + security migrations | authentication-strength helper | `REVIEW/RETAIN IF USED` | verify invoker/definer status, search_path, caller semantics and test evidence |
| `has_capability(...)` / capability helpers | historical runbook + RBAC migrations | server-side capability helper | `REVIEW/RETAIN` | verify context, actor derivation, search_path, grants and no client-asserted privilege |
| `prevent_last_community_owner_change()` | historical reset runbook | trigger guard with historical reset bypass | `TRANSITIONAL GUARD` | review bypass necessity; ensure normal owner invariant cannot be bypassed by ordinary callers; qualify references/search_path |
| `log_table_changes()` | historical reset runbook | audit trigger with historical reset bypass | `TRANSITIONAL AUDIT` | review audit model vs target semantic audit; restrict bypass; qualify references/search_path |
| `guard_player_user_id()` | `src/infra/supabase/schema.test.ts` | security-sensitive trigger function; current tests expect legacy `search_path = public` | `TRANSITIONAL` because `Player.user_id` is replaced by explicit link model | do not spend migration effort preserving obsolete identity model unless needed for safe strangler; harden while reachable, then remove with identity cutover |
| `handle_player_soft_delete_user_unlink()` | `src/infra/supabase/schema.test.ts` | security-sensitive trigger helper; current tests expect legacy `search_path = public` | `TRANSITIONAL` | same as above; review against target account-link/deletion semantics |
| `claim_session_ownership(...)` | `sessionOwnershipCloudService.ts` RPC call | mutation endpoint for current Session-level control | `TRANSITIONAL` | keep only until Match-level lease/epoch cutover; authorization/search_path/grants must remain safe while reachable |
| `transfer_session_ownership(...)` | `sessionOwnershipCloudService.ts` RPC call | mutation endpoint for current Session-level control | `TRANSITIONAL` | same as above; remove after W7 MatchControlLease target replaces Session-level authority |
| Community membership role/remove RPC family | current Application/legacy domain docs + migrations | privileged governance mutations | `TRANSITIONAL → TARGET SEMANTIC COMMANDS` | verify capability context, actor derivation, RLS interaction and search_path; preserve semantics only where aligned with target Membership model |
| Player link proposal/approval RPC family | Identity current-state evidence/migrations | privileged identity-link mutations | `TRANSITIONAL` | migrate to explicit PlayerAccountLink semantics; anti-hijack, step-up and provenance checks required |
| Competition/Championship administration RPCs, if any reachable | migration chain/current adapters | unknown completeness in this seed | `DISCOVER` | enumerate mechanically; classify as legacy CRUD vs target semantic operation |

---

# 3. Current tests are evidence, not target policy

`src/infra/supabase/schema.test.ts` currently contains assertions that some legacy trigger functions use:

```text
SET search_path = public
```

Those assertions describe the current contract and protect current behavior.

After C7:

```text
current test expectation
≠
target security policy
```

W0 must split/label such tests as transitional and add target hardening evidence before changing/removing the old assertions.

Do not make a target regression merely to keep a legacy fitness test green.

---

# 4. Required status vocabulary

Each mechanically discovered function must receive one of:

```text
TARGET-RETAIN
TARGET-HARDEN
TRANSITIONAL
BREAK-GLASS
DEPRECATE
REMOVE
PROVIDER-MANAGED / OUT-OF-SCOPE
```

`TRANSITIONAL` requires a C6 removal/cutover trigger.

`BREAK-GLASS` requires:

```text
explicit purpose
restricted executor
step-up if appropriate
audit/change record
runbook
review trigger
```

---

# 5. Required security checks

For every `SECURITY DEFINER` function retained:

```text
[ ] owner is intentional
[ ] PUBLIC/anon/authenticated EXECUTE grants are explicit
[ ] search_path posture matches target or has documented temporary exception
[ ] all object references are schema-qualified where target requires
[ ] actor comes from trusted server/session context
[ ] client-supplied role/user/capability is never authority
[ ] same-context/resource authorization is enforced
[ ] mass-assignment surface is bounded
[ ] error behavior does not leak sensitive internals
[ ] concurrency/idempotency semantics are tested where mutation is critical
[ ] RLS interaction is understood, not assumed
```

---

# 6. W0 mechanical extraction deliverable

W0 must produce a machine-readable or reproducible export such as:

```text
function_name
schema
security_definer
owner
search_path
execute_acl
source migration/current definition
classification
```

and compare it to this inventory.

Any newly discovered privileged function becomes a security review item before cutover.

---

# 7. C7 resolution scope

C7-R3 closes the **documentation contradiction** that previously presented `search_path = public` as the operationally accepted target pattern.

It does **not** claim all legacy functions have already been migrated.

Runtime hardening/removal is owned by C6 W0/W2/W7/W14 according to function semantics.
