# Scalable Product Program

Spec: `docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md`

O programa e dividido em cinco planos. Cada plano entrega software testavel e so comeca
depois que o anterior estiver integrado e seus gates estiverem verdes.

| Ordem | Plano | Entrega verificavel | Estado |
| --- | --- | --- | --- |
| 1 | Account Identity & Auth Foundation | Toda sessao valida converge para perfil + jogador 1:1; auth possui estados tipados, onboarding, recovery, Google e MFA shell | Planejado |
| 2 | Player Claim, Communities & Evaluations | Claim transacional preserva jogador da conta; RBAC, autoavaliacao global e avaliacao oficial por comunidade ficam consolidados | A escrever apos plano 1 |
| 3 | Career Events, Global VUT & Achievements | Eventos confirmados geram VUT e conquistas globais deterministicas e recalculaveis | A escrever apos plano 2 |
| 4 | Cloud-first Operational Offline | Cache por conta/comunidade, pacote offline, outbox idempotente e owner/device da sessao | A escrever apos plano 3 |
| 5 | Screen Contracts, Reset & Cutover | UI atual usa contratos de aplicacao; reset preserva Auth; ensaio, rollback e corte fecham Produto escalavel | A escrever apos plano 4 |

## Regras do programa

- A UI visivel permanece igual ate o plano 5 estar concluido.
- Nenhum reset de producao ocorre antes do ensaio completo do plano 5.
- Cada plano usa TDD, revisao por tarefa e commits pequenos.
- Migrations sao aplicadas primeiro no Supabase local e depois no projeto real.
- RLS e RPCs precisam de testes positivos e negativos antes da aplicacao remota.
- Alteracoes remotas possuem backup, verificacao pos-aplicacao e caminho de rollback.
- A fase Experiencia / Interface com esqueumorfismo funcional comeca somente depois dos
  gates do plano 5.

## Sequencia de planos detalhados

O primeiro plano esta em
`docs/superpowers/plans/2026-07-22-account-identity-auth-foundation.md`.
Os planos seguintes serao escritos contra o codigo resultante da entrega anterior para
evitar caminhos, assinaturas e migrations ficticias.
