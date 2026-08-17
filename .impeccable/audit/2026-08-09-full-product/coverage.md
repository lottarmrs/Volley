# Auditoria completa — matriz de cobertura

## Escopo

Auditoria combinada de UX, design e riscos de acessibilidade do produto inteiro antes da
Fase 3. Evidência ao vivo deve ser capturada no navegador autenticado. Inicialmente os fluxos que
alteravam dados foram limitados a navegação e confirmações canceladas. Em 2026-08-09 o usuário
autorizou explicitamente afetar as fixtures `AUDIT`, iniciar/finalizar partidas e encerrar as
sessões/torneios criados pela auditoria. Sync, papéis, importação/restauração, exclusão de dados
reais e compartilhamento externo continuam fora do escopo.

## Checkpoint da ampliação autorizada

### Passagens A/B (2026-08-09, Codex In-app Browser) — estado perdido

- 77 evidências aceitas (37 A + 40 B), com screenshots em `screenshots/` e `screenshots-b/`.
- Sessão regular interna: 19 evidências, 15/18 itens exercitados; registro em
  `session-live-tabs/report.md`.
- Torneio interno: não iniciado.
- **O estado local dessas passagens não existe mais.** Vivia só no `localStorage` do Codex, que não
  está mais em execução, e nada tinha subido para a nuvem. Os arquivos de evidência continuam
  válidos; as fixtures, não.

### Passagem C (2026-08-10, Claude Code) — seções 8 e 9 refeitas do zero

- Fixtures próprias: `AUDIT Sessao C — 09/08/2026` e `AUDIT Torneio C — 09/08/2026`, com
  `AUDIT C1`..`AUDIT C7`.
- Seção 8 (sessão regular): **18/18 itens**, 16 validados e 2 com ressalva nomeada
  (item 13 não ocorreu; item 14 com WhatsApp deliberadamente não acionado).
- Seção 9 (torneio): **20/21 itens**. Os itens 1, 14, 15 e 18 foram fechados numa rodada
  complementar com a fixture `AUDIT Torneio D — pausa`, criada só para isso. O item 8
  (`TournamentBracket`) é **não aplicável** ao formato usado — round-robin não gera chave; exercitá-lo
  exige mata-mata ou grupos + mata-mata.
- Encerramento, premiação, reveal VUT e histórico finalizado — as quatro superfícies que a crítica
  anterior listava como não validadas — foram **exercitadas nos dois fluxos**.
- Relatório: `pass-c/report.md`. Mutações: `mutations.md`.

**Desvio de formato de evidência nesta passagem:** não há arquivos `.jpg`. O navegador desta sessão
devolve screenshots para inspeção mas não os grava em disco, e o projeto não tem
Playwright/Puppeteer. Cada estado foi aberto e validado no momento da captura; a evidência
persistida é o estado do `localStorage`, o DOM consultado e as medições registradas no relatório.
Onde a afirmação depende de pixel, ela está descrita como observação visual, não como arquivo.

### Score da crítica

`15/40` (2 P0, 5 P1) → **`11/40` (3 P0, 7 P1)**. Snapshot:
`.impeccable/critique/2026-08-10T12-04-02Z__src-app-tsx.md`.

## Regras de evidência

- Cada etapa aceita precisa de screenshot próprio, DOM/estado correspondente e nota de saúde.
- Screenshots bloqueados, incorretos, cortados ou em loading são rejeitados e recapturados.
- Desktop e mobile/tablet são cobertos nos shells e nos fluxos operacionais principais.
- Estados não reproduzíveis com segurança são marcados como bloqueio e cobertos por testes/código,
  sem alegar validação visual.
- Nenhuma credencial, cookie, token ou conteúdo de storage entra nos artefatos.

## Jornada 0 — acesso público e recuperação

| ID | Superfície/estado | Evidência alvo | Segurança |
|---|---|---|---|
| 0.1 | Entrar | default + validação vazia | não submeter credenciais |
| 0.2 | Cadastro | campos, claim code, captcha quando configurado | não criar conta |
| 0.3 | Recuperar senha | pedido de e-mail + definição de nova senha | não enviar/alterar |
| 0.4 | Verificação de e-mail | orientação e reenvio | não reenviar |
| 0.5 | Escolha de username | default + validação local | não concluir |
| 0.6 | Configurar MFA | introdução/QR se já acessível | não enrolar/verificar fator |
| 0.7 | Confirmar MFA | default + erro local seguro | não confirmar fator |
| 0.8 | Sessão recuperável/loading/callback | estados reproduzíveis | marcar bloqueio se depender de token |

## Jornada 1 — shell e início

| ID | Superfície/estado | Evidência alvo | Segurança |
|---|---|---|---|
| 1.1 | Dashboard autenticado | desktop e mobile/tablet | leitura |
| 1.2 | Sidebar fechada/aberta | 8 destinos, estado ativo, conta | leitura |
| 1.3 | Rascunho pendente | alerta, Continuar, Descartar | não continuar/descartar sem snapshot de estado |
| 1.4 | Sessão ativa | badge/header/retorno | marcar bloqueio se não existir |
| 1.5 | Pendência/offline/sync | aviso de risco | marcar bloqueio se não existir |
| 1.6 | Cards/atalhos | Nova Sessão, Atletas, Comunidades, Histórico | navegar apenas |

## Jornada 2 — comunidades

| ID | Superfície/estado | Evidência alvo | Segurança |
|---|---|---|---|
| 2.1 | Lista de comunidades | preenchida ou empty state | leitura |
| 2.2 | Criar comunidade | formulário + validação local | não salvar |
| 2.3 | Descobrir/entrar por código | busca, pedido e feedback | não enviar pedido |
| 2.4 | Card/menu de comunidade | abrir, duplicar, arquivar, exportar, excluir | não executar ações |
| 2.5 | Resumo | métricas e próximos passos | leitura |
| 2.6 | Atletas | lista, filtros, vínculo e criação | não salvar/vincular |
| 2.7 | Presença | estados e controles | não alterar presença |
| 2.8 | Lista WhatsApp | templates/preview/cópia | não abrir WhatsApp nem persistir template |
| 2.9 | Sessões | lista, criar, abrir histórico | leitura |
| 2.10 | Ligas | lista, criação, rodada, classificação, chave | não materializar/reagendar |
| 2.11 | Ranking | ranking e compartilhamento | não compartilhar |
| 2.12 | Membros | RBAC, convites, pedidos e remoção | não alterar papéis/remover |
| 2.13 | Regras | edição e permissões | não salvar |
| 2.14 | Dados | exportar/limpar histórico | não exportar/limpar |

## Jornada 3 — atletas

| ID | Superfície/estado | Evidência alvo | Segurança |
|---|---|---|---|
| 3.1 | Lista de atletas | busca/lista/empty state/CTAs | leitura |
| 3.2 | Criar atleta | formulário completo e validação | não salvar |
| 3.3 | Editar perfil | identidade, posições, atributos, forma, lesão | não salvar |
| 3.4 | Avaliação | gate por comunidade e autoavaliação | não submeter |
| 3.5 | Avatar | upload, aprovação e estados | não enviar/aprovar |
| 3.6 | FUT/VUT/carreira | card, modal, timeline e empty state | leitura |
| 3.7 | Exclusão | confirmação e copy de impacto | abrir e cancelar |
| 3.8 | Jogador convidado | modal e opção de editar detalhes | não confirmar |

## Jornada 4 — criação e configuração de sessão

| ID | Etapa do wizard | Evidência alvo | Segurança |
|---|---|---|---|
| 4.1 | Sessão | nome, data, comunidade, detalhes | não salvar mudança |
| 4.2 | Atletas | seleção, filtros, convidado, métricas | não confirmar convidado |
| 4.3 | Formato | free play/torneio/campeonato | apenas alternar seleção reversível |
| 4.4 | Regras | formato da competição, sets e pontuação | apenas navegar |
| 4.5 | Revisão | resumo e prevenção de erro | leitura |
| 4.6 | Times | geração, progresso, alternativas, travas/restrições | não iniciar geração se alterar draft sem backup |
| 4.7 | Tabela | ordem/rodadas/compartilhamento | não iniciar competição/compartilhar |
| 4.8 | Cancelar/retomar draft | copy e recuperação | abrir confirmação e cancelar |

## Jornada 5 — sessão ativa

| ID | Superfície/estado | Evidência alvo | Segurança |
|---|---|---|---|
| 5.1 | Placar free play | times, placar, fila, header | leitura |
| 5.2 | Registrar ponto | ponto/erro, atleta, habilidade, assistência, avançado | abrir e cancelar |
| 5.3 | Desfazer ponto | affordance e confirmação | não executar |
| 5.4 | Próximo jogo/fila | ordenação, remover, compartilhar | não alterar fila |
| 5.5 | Ownership | próprio, outro usuário/dispositivo, assumir | não assumir |
| 5.6 | Destaques/prêmios | FAB, lista e remoção | não registrar/remover |
| 5.7 | Encerrar/sair | confirmação, impacto e recuperação | abrir e cancelar |
| 5.8 | Sessão de torneio | fase, standings, jogo atual, W.O., pausa | não alterar placar/estado |
| 5.9 | VUT reveal | sequência pós-sessão | bloqueio se exigir encerramento real |

## Jornada 6 — torneios, desempenho e histórico

| ID | Superfície/estado | Evidência alvo | Segurança |
|---|---|---|---|
| 6.1 | Torneios/Campeonatos | lista, status, novo, abrir | leitura |
| 6.2 | Ranking global | filtros, cards e empates/empty state | leitura |
| 6.3 | Histórico — lista | sessões e relatórios | leitura |
| 6.4 | Histórico — detalhe | placar, times, estatísticas, eventos | leitura |
| 6.5 | Exclusão de sessão | confirmação e impacto | abrir e cancelar |
| 6.6 | Exportadores/compartilhamento | opções e copy | não exportar/compartilhar |

## Jornada 7 — perfil, nuvem e segurança

| ID | Superfície/estado | Evidência alvo | Segurança |
|---|---|---|---|
| 7.1 | Conta/perfil | identidade, status e atleta vinculado | leitura |
| 7.2 | Saúde da nuvem | última sync, pendências, CTA | não sincronizar |
| 7.3 | Falha recuperável | retry/histórico/limpar resolvidos | não executar |
| 7.4 | Conflito | manter meu/deles e copy de não exclusão | não resolver |
| 7.5 | Duplicatas | reparo e impacto | não reparar |
| 7.6 | Google/MFA | vínculo e segurança | não vincular/configurar |
| 7.7 | Sair | affordance e confirmação/retorno | não sair |

## Jornada 8 — configurações e administração

| ID | Superfície/estado | Evidência alvo | Segurança |
|---|---|---|---|
| 8.1 | Configurações | backup, importar, restaurar demo | não importar/restaurar |
| 8.2 | Gestão global | lista/perfis/papéis/ações | leitura |
| 8.3 | Gestão sem permissão | item oculto/negação/fallback | cobrir por código se não reproduzível |
| 8.4 | Configuração comunitária | regras, membros, WhatsApp, dados | consolidar com Jornada 2 |

## Estados transversais

- Desktop, tablet/mobile, zoom/reflow quando suportado.
- Loading, vazio, preenchido, erro, offline e pendência quando reproduzíveis.
- Usuário comum, membro/moderador/organizador/admin/owner e staff global quando acessíveis.
- Back/Forward, refresh, deep link, foco, teclado, nomes acessíveis e anúncio de estado.
- Nomes longos, zero/muitos itens e truncamento; cobrir por código/teste quando não houver fixture segura.
