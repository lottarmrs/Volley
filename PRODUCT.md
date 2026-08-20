# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dois públicos primários, ambos com conta própria:

- **Organizador da pelada** (owner/admin/moderator/organizador da comunidade): monta o elenco, cria a sessão, sorteia os times, opera o placar na beira da quadra, aprova entrada de membros, avalia atletas e cuida da liga ao longo das semanas.
- **Atleta**: entra com conta própria para confirmar presença na agenda, ver seu card e sua posição no ranking, se auto-avaliar e pedir vínculo com o perfil de atleta (incluindo avatar, sujeito a aprovação).

Há ainda um **admin global** da instalação, com acesso ao painel administrativo (`/admin`) acima das comunidades.

## Product Purpose

Sustentar a vida inteira de um grupo amador de vôlei misto — comunidade, elenco, agenda, pelada avulsa, liga de longa duração e ranking — com times equilibrados em nível técnico e gênero, placar ao vivo sem atrito e um histórico que o grupo confere depois. Sucesso é o grupo inteiro enxergar a mesma verdade sobre quem jogou, quem venceu e quanto cada um evoluiu, sem que isso dependa de um único celular.

## Positioning

App especializado em vôlei amador brasileiro que combina três coisas que os concorrentes tratam separadamente: um algoritmo de balanceamento multidimensional por fundamentos e gênero rodando em Web Worker, uma comunidade com papéis reais governando quem pode marcar ponto e avaliar atleta, e uma camada colecionável (cards VUT) que transforma o histórico da pelada em progressão visível. O caminho pretendido é conta + comunidade na nuvem; a operação em quadra continua funcionando sem sinal.

## Operating Context

Quadras de vôlei e ambientes dinâmicos de jogo, onde o organizador opera o celular entre pontos ou sets sob sol forte ou luz de ginásio — daí os alvos de toque grandes, a resposta instantânea e o alto contraste. Fora da quadra, o mesmo grupo vive no WhatsApp: convocatórias, listas de presença e chave PIX saem do app para o grupo. A conectividade é irregular no local do jogo, então a sessão ao vivo precisa sobreviver a queda de sinal e reconciliar depois.

## Capabilities and Constraints

- **Comunidades e papéis**: A comunidade é a unidade central (elenco, presenças, regras, histórico). Papéis `owner`, `admin`, `moderator`, `organizador` e `member` governam criar sessão, aprovar membro, editar regras, avaliar atleta, limpar histórico e excluir a comunidade; um `admin` global existe acima disso. Mutações sensíveis de associação passam por RPC no Supabase, nunca por update/delete direto do navegador.
- **Ligas de longa duração**: Campeonatos que atravessam semanas, com times, rodadas, classificação, forma recente e governança de resultados (solicitação → aprovação → aceite/recusa).
- **Agenda**: Visão agregada das próximas peladas e rodadas de liga de todas as comunidades do usuário; a confirmação de presença acontece no fluxo da sessão.
- **Atletas e avaliação em duas vias**: Cadastro por fundamentos (saque, recepção, levantamento, ataque, bloqueio, defesa), com auto-avaliação do atleta separada da avaliação oficial (restrita a owner/admin, alinhada à RLS de `player_evaluations`). Vínculo de conta a perfil de atleta e avatar passam por aprovação.
- **Cards VUT (Volley Ultimate Team)**: Camada colecionável de produto — raridades, reveal e destaques (MVP e afins) derivados do histórico real de partidas.
- **Pelada ao vivo**: Balanceamento em Web Worker, sessão ao vivo com histórico de pontos/sets, torneios, substituição e rotação, ranking de atletas.
- **WhatsApp e PIX**: Geração de listas de convocatória/presença e dados de PIX para colar no grupo.
- **Acesso em dois níveis**: Sem conta (convidado), o app roda localmente para pelada avulsa e demonstração. Comunidades (`/comunidades`), ligas (`/ligas`) e agenda (`/agenda`) exigem conta, porque são histórico coletivo que precisa sobreviver a este navegador.
- **Restrições**: UI obrigatoriamente em Português (pt-BR), incluindo campos do modelo de domínio (`nome`, `apelido`, `genero`, `posicaoPrincipal`, `saque`, `recepcao`…). Stack React 19 + Vite 6 + Tailwind CSS 4 + daisyUI 5. `localStorage` continua sendo o armazenamento local e o app roda sem `.env` do Supabase, mas isso é resiliência e porta de entrada, não o modo de uso pretendido.

## Brand Commitments

- **Nome**: Panelinha Team Balancer (Volley)
- **Tom de voz**: Prático, direto, empolgante e alinhado ao vocabulário do vôlei amador brasileiro.
- **Linguagem**: Português (pt-BR) em todos os textos da interface, mensagens e erros.

## Evidence on Hand

- Algoritmo de balanceamento testado em Web Worker (`src/logic/balancer.worker.ts`).
- Modelo de permissões da comunidade com testes (`src/domain/communityPermissions.ts`).
- Fronteira convidado × conta explicitada em código, com as razões em texto de produto (`src/application/guestAccess.ts`).
- Governança de liga (`src/application/championshipGovernanceUseCases.ts`) e agenda agregada (`src/application/agendaViewModel.ts`).
- Cadeia de migrações Supabase com RLS e RPCs em `supabase/migrations/`, clientes por entidade em `src/infra/supabase/`.
- Suíte E2E Playwright cobrindo ligas de longa duração e papéis.
- Não há depoimentos, números de adoção, preço ou plano comercial: nada disso deve ser inventado.

## Product Principles

1. **Fricção Zero no Ao Vivo**: Operações de 1 toque durante o jogo — placar, substituição e rotação sem distração.
2. **Funciona Sem Sinal**: A quadra não tem internet confiável. A sessão ao vivo opera offline e reconcilia depois; o modo local sem conta é a porta de entrada e o fallback, não o destino.
3. **Uma Verdade Para o Grupo Inteiro**: Comunidade, papéis e nuvem existem para que elenco, resultados e histórico não morram no celular de uma pessoa.
4. **Balanceamento Transparente e Justo**: Distribuição multidimensional de fundamentos e gênero, explicável para quem reclama do sorteio.
5. **Progressão Visível**: Ranking, avaliação em duas vias e cards VUT transformam o histórico da pelada em evolução que o atleta reconhece.
6. **Conexão Nativa com o WhatsApp**: Convocatórias, listas de presença e chave PIX prontas para colar no grupo.

## Accessibility & Inclusion

Botões com áreas de toque ampliadas para navegação rápida em quadra, paleta de alto contraste legível em ambientes externos e suporte a leitores de tela nos fluxos essenciais.
