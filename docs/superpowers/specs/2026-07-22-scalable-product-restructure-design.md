# Reestruturacao do Produto Escalavel

Data: 2026-07-22
Projeto: Volley / Panelinha Team Balancer
Status: design aprovado em conversa, aguardando revisao do usuario antes do plano de implementacao

## 1. Contexto

O Panelinha nasceu pelo frontend e evoluiu para backend, sincronizacao e regras de
produto. As etapas anteriores melhoraram confiabilidade, membros, RBAC, vinculos,
sessoes, sincronizacao e fronteiras de aplicacao, mas quatro areas ainda concentram
acoplamento:

- Cloud Health & Sync;
- presenca e operacao local;
- views e navegacao centrais;
- `Player`, hoje o maior conceito transversal do produto.

Esta reestruturacao consolida a fase Produto escalavel. Ela usa os roadmaps de backend
e system design como referencia para o aplicativo inteiro, nao apenas para cloud.
O produto passa a ser cloud-first com cache operacional, transforma jogadores em
contas acessiveis e prepara contratos para a futura fase de Experiencia / Interface.

## 2. Objetivos

- Tornar Supabase a fonte de verdade para identidade e dados compartilhados.
- Garantir exatamente um jogador canonico para cada conta pronta.
- Permitir que pessoas consultem comunidades e solicitem participacao.
- Separar autoavaliacao global de avaliacoes oficiais por comunidade.
- Tornar vinculo com jogador historico atomico, idempotente e auditavel.
- Manter operacao esportiva disponivel offline para comunidades preparadas.
- Isolar dominio, aplicacao, infraestrutura, armazenamento e apresentacao.
- Preservar a interface visivel atual durante esta fase.
- Permitir apagar os dados de produto sem apagar contas do Supabase Auth.
- Encerrar Produto escalavel antes de iniciar redesign, UX ou esqueumorfismo.

## 3. Nao objetivos

- Redesenhar telas ou trocar a navegacao visivel agora.
- Implementar esqueumorfismo, microinteracoes ou novo design system agora.
- Trocar Supabase Auth por Auth0, Firebase, Clerk ou autenticacao propria.
- Suportar edicao livre do perfil oficial pelo proprio jogador.
- Criar uma nota oficial global na primeira versao.
- Permitir operacao administrativa geral offline.
- Introduzir microservicos, event sourcing ou uma nova state machine sem necessidade.
- Preservar jogadores, comunidades, vinculos ou historico atuais no reset aprovado.

## 4. Principios arquiteturais

1. **Cloud autoritativa:** identidade e colaboracao sao confirmadas pelo backend.
2. **Offline operacional:** cache e fila existem para executar uma sessao ja preparada.
3. **Um conceito, um dono:** regras ficam no dominio/aplicacao, nao em componentes.
4. **Seguranca no banco:** route guards melhoram UX; RLS e RPC garantem autorizacao.
5. **Contratos tipados:** telas recebem modelos de tela e emitem intencoes.
6. **Idempotencia:** retry nao duplica jogador, vinculo, evento, jogo ou conquista.
7. **Auditoria:** operacoes sensiveis registram ator, alvo, momento e correlacao.
8. **Migracao reversivel:** schema e reset sao ensaiados e possuem rollback documentado.
9. **YAGNI:** usar primeiro as bibliotecas e primitivas ja adotadas pelo projeto.

## 5. Fronteiras do sistema

### 5.1 Identidade global

Responsavel por Supabase Auth, conta, username, perfil, jogador canonico, onboarding,
metodos de login, MFA, autoavaliacao e carreira global. Nao conhece a comunidade ativa.

### 5.2 Comunidades

Responsavel por descoberta, pedidos, convites, memberships, papeis locais, avaliacoes
oficiais e acesso aos dados da comunidade. Depende da identidade pronta.

### 5.3 Operacao esportiva

Responsavel por presenca, montagem de times, sessao, jogos, placar e eventos de carreira.
Pode operar sobre um pacote offline de uma comunidade, com posterior confirmacao cloud.

### 5.4 Projecoes globais

Responsavel por VUT, conquistas e carreira consolidada. Consome apenas eventos de
operacao confirmados na nuvem e pode exibir progresso local como provisorio.

### 5.5 Apresentacao

Components e views consomem `ScreenModel` e disparam `Intent`. Nao acessam Supabase,
`localStorage`, outbox, RLS ou regras de permissao diretamente.

## 6. Organizacao-alvo do codigo

A migracao deve ser incremental e compatibilizada com a estrutura atual:

```text
src/
  app/                 composicao, providers, router e bootstrap
  domain/              entidades, invariantes, calculos e permissoes puras
  application/         use cases, ports, results e screen models
  infrastructure/
    supabase/           adapters, RPCs e mapeadores cloud
    offline/            cache, outbox e isolamento por conta/comunidade
  ui/                   views e components sem regra de persistencia
  shared/               tipos/utilitarios realmente transversais
supabase/
  migrations/          schema, constraints, RPCs, triggers, grants e RLS
  tests/                testes SQL e matriz de autorizacao
```

Pastas atuais nao serao movidas em massa. Cada fatia move apenas o que toca, mantendo
facades temporarias quando necessario. Arquivos defasados so serao removidos depois de
`rg`, grafo de dependencias, build e testes provarem que nao possuem consumidores.

## 7. Identidade, conta e jogador

### 7.1 Invariantes

- Toda conta pronta possui exatamente um jogador canonico.
- `player.id` e UUID interno imutavel e nunca e substituido por username.
- `username` e identidade publica unica, mutavel apenas pelo fluxo permitido.
- O usuario escolhe o username no onboarding.
- Um jogador historico sem conta pode possuir `legacy_code` temporario.
- Um jogador historico nao pode ser reivindicado por duas contas.
- `auth.users.id`, perfil e jogador possuem relacao explicita e unica.

### 7.2 Bootstrap de conta

Depois de uma sessao valida, o `Account Service` executa `ensure_account_ready` de forma
atomica e idempotente. Ele restaura um username valido do snapshot minimo quando
disponivel; caso contrario, direciona para escolha de username. Ao concluir, cria ou
repara perfil e jogador canonico 1:1.

Falha de rede ou indisponibilidade do perfil nao transforma sessao valida em logout.
O estado fica recuperavel e permite nova tentativa.

### 7.3 Claim de jogador historico

O claim e um fluxo de dominio separado de vincular Google ou senha no Supabase Auth:

1. Conta pronta solicita um jogador historico por `legacy_code` ou descoberta permitida.
2. A solicitacao aguarda aprovacao da comunidade responsavel.
3. Uma RPC valida solicitante, aprovador, estado e ausencia de claim concorrente.
4. O jogador da conta continua canonico, preservando `player.id` e `username`.
5. Memberships, avaliacoes, eventos, sessoes e referencias historicas sao repontados.
6. O codigo antigo vira alias/auditoria, nao identidade ativa.
7. O registro historico redundante e arquivado ou removido dentro da mesma transacao.
8. VUT e conquistas sao recalculados a partir dos eventos importados.

Uma chave de idempotencia e constraints unicas tornam retries seguros. Conflitos nao sao
resolvidos por ultimo escritor; produzem erro de produto auditavel.

## 8. Avaliacoes e perfil

### 8.1 Autoavaliacao

- Existe no maximo uma autoavaliacao global por jogador/conta.
- O jogador pode editar somente sua autoavaliacao.
- Ela serve como referencia para administradores e nao altera a nota oficial.
- O perfil oficial continua protegido de edicao livre pelo proprio jogador.

### 8.2 Avaliacao oficial

- E contextual a uma comunidade.
- Somente owner/admin autorizado avalia conforme a policy aprovada.
- Ha no maximo uma avaliacao por `(community_id, player_id, evaluator_user_id)`.
- A media oficial e calculada por comunidade, sem misturar autoavaliacao.
- Nao existe media oficial global na primeira versao.

As dimensoes avaliadas devem usar contrato versionado. Uma mudanca futura na escala ou
nos atributos cria uma nova versao, sem reinterpretar silenciosamente avaliacoes antigas.

## 9. VUT e conquistas

O VUT e global e representa carreira confirmada em todas as comunidades. Ele deriva de
eventos confirmados, como sessoes, jogos, pontos, erros, destaques, presenca,
reconhecimentos, forma e parcerias.

- Avaliacoes oficiais e autoavaliacao nao alteram diretamente o VUT.
- O calculo e puro, deterministico e versionado.
- A mesma entrada sempre produz a mesma projecao.
- Eventos offline podem mostrar progresso provisorio.
- Conquista e VUT oficiais mudam somente apos confirmacao cloud.
- Claim importa eventos e recalcula; nao copia um cartao congelado.

O perfil global apresenta VUT, conquistas, carreira filtravel por comunidade,
autoavaliacao e avaliacoes oficiais em secoes separadas.

## 10. Autenticacao e autorizacao

### 10.1 Provedor e metodos

Supabase Auth permanece como autoridade de identidade. A primeira entrega suporta:

- email e senha;
- confirmacao de email;
- recuperacao de senha;
- Google OAuth;
- linking de identidades do mesmo usuario;
- CAPTCHA e rate limiting;
- SMTP proprio em producao;
- MFA TOTP para gestao sensivel.

Auth0, Firebase, Clerk, SMS, SSO empresarial e passkeys ficam fora do escopo inicial.

### 10.2 Shell React

`AuthSessionProvider` expoe estado tipado:

```text
initializing -> anonymous -> email_verification -> onboarding -> mfa_required -> ready
```

Rotas publicas:

- `/entrar`
- `/cadastro`
- `/recuperar-senha`
- `/auth/callback`

Rotas de transicao:

- `/verificar-email`
- `/escolher-username`
- `/configurar-mfa`
- `/confirmar-mfa`

As demais rotas exigem conta pronta. O destino solicitado e preservado durante login,
onboarding e MFA. Supabase gerencia tokens, refresh e logout; o app nao implementa token
proprio nem persistencia manual de token.

### 10.3 Autorizacao

- Papeis globais e memberships locais continuam separados.
- Metadata editavel pelo usuario nunca concede autorizacao.
- RLS usa `auth.uid()`, membership, papel e nivel AAL.
- Operacoes administrativas sensiveis exigem `aal2` no banco.
- RPCs `SECURITY DEFINER` fixam `search_path`, validam ator e recebem grants minimos.
- Service role nunca e exposta no navegador.

## 11. Cloud-first com offline operacional

### 11.1 Dados sempre cloud

Identidade, jogadores, usernames, comunidades, memberships/RBAC, pedidos, claims,
autoavaliacao e avaliacoes oficiais dependem da nuvem.

### 11.2 Dados operaveis offline

Somente comunidades previamente baixadas podem operar offline, incluindo:

- presenca;
- composicao de times;
- sessao;
- jogos e placar;
- eventos necessarios para posterior carreira/VUT.

A comunidade ativa e atualizada automaticamente. Outras comunidades exigem a acao
explicita `Disponibilizar offline`.

### 11.3 Cache e isolamento

O cache e particionado por `auth_user_id` e `community_id`, inclui versao de schema e
nunca e aberto antes do estado `ready`. Logout tenta sincronizar; sem rede, a fila fica
isolada no dispositivo e so retoma quando a mesma conta voltar. Outra conta nao pode
ler nem enviar esse conteudo.

### 11.4 Outbox

Cada operacao possui ID, idempotency key, conta, comunidade, sessao, versao, timestamp e
payload validado. Estados:

```text
completed_local -> pending_upload -> syncing -> cloud_confirmed
                                      |-> recoverable_error
```

Retry usa backoff limitado. Duplicacao e reordenacao nao alteram o resultado final.
Conflitos de dominio ficam visiveis e recuperaveis, sem descarte silencioso.

### 11.5 Propriedade da sessao

Uma sessao operacional possui um owner/device ativo. Transferencia de controle e
explicita e confirmada. Isso evita dois dispositivos produzirem placares concorrentes.

## 12. Interfaces e navegacao futura

A arquitetura de informacao aprovada e centrada na comunidade:

Areas globais:

- Inicio;
- Comunidades;
- Agenda;
- Meu perfil.

Dentro de uma comunidade:

- Visao geral;
- Sessoes;
- Pessoas;
- Desempenho;
- Gestao.

`Pessoas` diferencia jogadores esportivos, contas/membros autenticados, convites e
pedidos. Perfil e autoavaliacao sao globais. A UI atual permanece durante Produto
escalavel; a navegacao aprovada e implementada somente em Experiencia / Interface.

Cada pagina futura depende de um contrato de aplicacao. Exemplo:

```ts
type ScreenContract<Model, Intent> = {
  model: Model;
  dispatch(intent: Intent): Promise<void>;
};
```

O formato final pode seguir os tipos existentes, mas preserva a regra: renderizacao nao
consulta infraestrutura e eventos de UI nao carregam autorizacao.

## 13. Bibliotecas e decisoes tecnicas

Usar as dependencias atuais quando resolvem o problema:

- `@supabase/supabase-js` para Auth, banco e sessao;
- React 19 e React Router 7 para providers, rotas e guards;
- TypeScript para contratos e estados discriminados;
- Node test runner e Vitest/Testing Library para dominio e UI;
- migrations SQL para constraints, RPCs, triggers, grants e RLS.

Nao adotar agora:

- TanStack Query: primeiro consolidar ports, ownership e semantica cloud-first;
- Dexie: introduzir somente se IndexedDB nativo/repository atual nao atender volume e
  transacoes da outbox;
- XState: os estados aprovados cabem em reducers/unions tipadas;
- Zod: avaliar apenas nas fronteiras que recebam payload externo nao coberto pelos
  validadores e tipos atuais.

Uma biblioteca nova precisa remover complexidade demonstravel, nao apenas substituir
codigo existente.

## 14. Tratamento de erros e observabilidade

Erros seguem categorias tipadas:

- `validation`: entrada invalida;
- `authorization`: ator ou AAL insuficiente;
- `conflict`: username, claim, versao ou owner concorrente;
- `offline_unavailable`: acao exige cloud;
- `recoverable`: timeout, rede ou dependencia temporaria;
- `unexpected`: falha nao classificada, com correlation ID.

A UI preserva estado valido e oferece nova tentativa onde aplicavel. Logs de auditoria
cobrem claim, alteracao de papel, avaliacao oficial, transferencia de sessao, outbox e
reset. Dados sensiveis, tokens e payloads desnecessarios nao entram em logs.

## 15. Sequencia de implantacao

### Fase 0: preparar

- Inventariar schema, policies, RPCs, dados e consumidores.
- Produzir backup testado e snapshot minimo `auth_user_id -> username`.
- Ensaiar migrations, reset, bootstrap e rollback em ambiente isolado.
- Definir modo manutencao, runbook e criterios de interrupcao.

### Fase 1: identidade

- Implementar shell de auth tipado e rotas de transicao.
- Implementar Account Service e bootstrap 1:1.
- Adicionar email verification, recovery, Google e identity linking.
- Exigir MFA/AAL2 nas operacoes administrativas selecionadas.

### Fase 2: dominio social e carreira

- Implementar modelo conta-jogador e claim transacional.
- Consolidar comunidades, memberships e RBAC.
- Implementar autoavaliacao e avaliacoes oficiais separadas.
- Implementar eventos de carreira, VUT e conquistas deterministicas.

### Fase 3: operacao cloud-first

- Particionar cache por conta/comunidade.
- Implementar pacote offline, outbox e idempotencia.
- Implementar owner/device da sessao e transferencia.
- Implementar reconciliacao, erros recuperaveis e observabilidade.

### Fase 4: integrar e cortar

- Conectar a UI atual por Screen Models e Intents.
- Remover acessos diretos de views a Supabase/storage/permissoes.
- Executar ensaio final e gates.
- Fazer reset controlado dos dados de produto.
- Validar bootstrap das contas preservadas e liberar producao.

## 16. Estrategia de testes

### Unitarios de dominio

- normalizacao e unicidade de username;
- bootstrap e merge idempotentes;
- agregacao oficial por comunidade;
- separacao da autoavaliacao;
- VUT/conquistas deterministicas e versionadas;
- transicoes da outbox e resolucao de conflitos.

### Banco e RLS

Matriz obrigatoria para anonimo, usuario, membro, moderator, admin, owner, programmer e
master, incluindo AAL1/AAL2. Testar caminho permitido e negado para cada comando sensivel.

### Integracao com Supabase local

- cadastro por senha e bootstrap;
- callback/identidade OAuth onde tecnicamente simulavel;
- recovery e retomada de rota;
- claim aprovado, retry e conflito;
- memberships, avaliacoes, carreira e sincronizacao.

### Caos offline

- retry, duplicacao e reordenacao;
- queda durante envio;
- conflito de versao;
- logout com fila pendente;
- troca de conta;
- transferencia e concorrencia de owner/device.

### E2E

- cadastro, verificacao e onboarding;
- consulta de comunidade, pedido e aprovacao;
- claim de jogador historico;
- autoavaliacao e avaliacao administrativa;
- sessao offline e confirmacao cloud;
- progresso local provisorio e resultado cloud confirmado para VUT/conquista.

### Regressao

`npm run lint`, `npm run lint:eslint`, `npm run format:check`, `npm run test`,
`npm run build` e testes SQL devem passar. A interface atual deve preservar os fluxos
visiveis durante a fase.

## 17. Reset de producao

O reset preserva `auth.users`, credenciais e identidades. Remove ou recria jogadores,
comunidades, memberships, claims, avaliacoes, sessoes, jogos, eventos, VUT, conquistas e
demais dados de produto.

Sequencia:

1. Bloquear escrita e ativar manutencao.
2. Gerar e verificar backup completo e snapshot minimo de usernames.
3. Aplicar schema, constraints, RPCs, triggers, grants e RLS.
4. Executar smoke tests estruturais antes de apagar dados.
5. Resetar somente tabelas de produto na ordem referencial aprovada.
6. Validar contagens, constraints, policies e advisors do Supabase.
7. Testar login de contas preservadas e bootstrap idempotente.
8. Testar uma jornada completa e uma negacao RLS por papel/AAL.
9. Liberar escrita e monitorar erros, latencia, outbox e bootstrap.

Username valido e unico pode ser restaurado pelo snapshot. Ausente, invalido ou em
conflito direciona a conta para onboarding. Nenhum outro dado de produto e restaurado.

Se qualquer gate critico falhar antes da liberacao, o sistema permanece em manutencao,
o backup e restaurado e a causa e registrada antes de novo corte.

## 18. Gates de conclusao de Produto escalavel

- Supabase e a fonte de verdade para identidade e colaboracao.
- Toda conta pronta possui exatamente um jogador canonico.
- Username e ID interno estao separados e protegidos por constraints.
- Claim e atomico, idempotente, auditavel e coberto por testes.
- Autoavaliacao, avaliacao oficial e VUT possuem semanticas separadas.
- Gestao sensivel e protegida por RLS e AAL2.
- Operacao offline funciona apenas para comunidades preparadas.
- Cache e outbox estao isolados por conta/comunidade.
- UI atual consome contratos de aplicacao sem acesso direto a infraestrutura.
- Reset e rollback foram ensaiados antes de producao.
- Suite, build, testes SQL, matriz RLS e E2E criticos passam.
- Documentacao operacional e arquitetural corresponde ao codigo implantado.

Ao cumprir estes gates, Produto escalavel esta encerrado. O trabalho seguinte e a fase
Experiencia / Interface: nova navegacao, UX, UI, acessibilidade, responsividade e
esqueumorfismo funcional, sem reabrir as responsabilidades de backend definidas aqui.

## 19. Riscos e mitigacoes

- **Claim parcial:** uma unica transacao, idempotency key e constraints.
- **Policy excessiva:** matriz RLS automatizada, grants minimos e teste negativo.
- **Conta sem perfil apos reset:** bootstrap idempotente com estado recuperavel.
- **Vazamento entre contas:** namespace de cache e bloqueio antes de `ready`.
- **Duplicacao offline:** IDs client-side, idempotencia server-side e reconciliacao.
- **Dois placares concorrentes:** owner/device unico e transferencia explicita.
- **Migracao grande demais:** fatias pequenas, facades temporarias e gates por etapa.
- **Nova biblioteca sem retorno:** adocao condicionada a problema e ganho mensuravel.
- **Redesign antecipado:** UI visivel congelada ate os gates desta especificacao.

## 20. Referencias de decisao

As decisoes desta especificacao consolidam a auditoria e os diagramas aprovados durante
o brainstorming de 2026-07-22, os roadmaps locais de backend/system design e as
documentacoes oficiais do Supabase para Auth, sessoes, identity linking, Google OAuth,
password recovery, rate limits e MFA/AAL. Tutoriais de Auth0, Firebase e React foram
usados para comparar padroes, nao como justificativa para substituir Supabase Auth.
