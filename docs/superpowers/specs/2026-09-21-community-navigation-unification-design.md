# Unificação da navegação da comunidade

Acabar com as duas navegações concorrentes dentro de uma comunidade: as dez abas de
`CommunitiesView` viram áreas com endereço próprio, servidas pela mesma barra lateral que já
existe, e cada painel passa a morar no seu próprio arquivo.

## O que a varredura encontrou

Hoje a comunidade tem duas portas para o mesmo conteúdo.

A barra lateral oferece cinco áreas com URL própria — Visão geral, Sessões, Pessoas, Desempenho e
Gestão. Dentro de Visão geral, `CommunitiesView` (3.483 linhas) abre outra navegação, com dez abas:
Resumo, Atletas, Presença, Lista WhatsApp, Sessões, Ligas, Ranking, Membros, Regras e Dados. Quatro
pares cobrem o mesmo terreno: Atletas e Pessoas, Sessões e Sessões, Ranking e Desempenho, Regras e
Gestão.

As abas guardam a seleção em estado local (`useState<CommunityTab>`), então não entram na URL: não
há link, não há voltar, não há recarregar. As áreas da lateral entram. Metade do app é endereçável e
a outra metade não.

Duas consequências práticas:

- **Gestão abre a aba de Regras.** Membros — aprovar entrada, cargos, código de convite — fica em
  outra aba, dentro de Visão geral. Quem procura gestão de pessoas não encontra onde o nome promete.
- **Dados da comunidade** (editar, duplicar, limpar histórico, excluir) também está numa aba, longe
  do lugar onde se administra a comunidade.

Fora da comunidade há uma colisão de nomes: `/admin` se chama "Administração da Plataforma" e trata
de papéis globais do sistema, enquanto "Gestão" é da comunidade. Os dois aparecem como administração
para quem lê o menu.

## Decisões (2026-09-21)

1. **Presença e Lista de WhatsApp pertencem a Sessões.** São preparação da pelada, não cadastro de
   pessoas.
2. **Ligas vira a sexta área da comunidade**, separada do hub global `/ligas`.
3. **Subáreas têm caminho próprio**, não `?aba=`. O Desempenho, que hoje usa parâmetro de consulta,
   passa a seguir a mesma regra.
4. **Gestão reúne Membros, Regras e Dados** — tudo que exige cargo de gestão num lugar só.
5. **A administração da plataforma vira `/plataforma`**, com `/admin` redirecionando.

## O mapa de endereços

```text
/comunidades/:id                        Visão geral (resumo)
/comunidades/:id/pessoas                Pessoas
/comunidades/:id/pessoas/editar-atleta/:playerId
/comunidades/:id/sessoes                Sessões — lista
/comunidades/:id/sessoes/presenca       Presença
/comunidades/:id/sessoes/lista-whatsapp Lista de WhatsApp
/comunidades/:id/sessoes/torneios       Torneios
/comunidades/:id/sessoes/nova           Wizard de sessão
/comunidades/:id/sessoes/ativa          Sessão ao vivo
/comunidades/:id/sessoes/:sessionId     Detalhe de uma sessão
/comunidades/:id/ligas                  Ligas da comunidade
/comunidades/:id/desempenho             Ranking
/comunidades/:id/desempenho/historico   Histórico
/comunidades/:id/gestao                 Gestão — Membros
/comunidades/:id/gestao/regras          Regras
/comunidades/:id/gestao/dados           Dados
/plataforma                             Administração da plataforma
```

A barra lateral passa a ter seis itens de comunidade: Visão geral, Sessões, Pessoas, Ligas,
Desempenho, Gestão — mais "Trocar comunidade", que já existe. Dentro de uma área, as subáreas
aparecem como abas, e cada aba é um link com endereço próprio.

`/comunidades/:id/sessoes/:sessionId` continua depois das rotas fixas, para que `presenca`,
`lista-whatsapp`, `torneios`, `nova` e `ativa` não sejam lidos como identificador de sessão.

## Compatibilidade

Nenhum endereço antigo quebra:

| Antigo | Novo |
| --- | --- |
| `/comunidades/:id/desempenho?aba=ranking` | `/comunidades/:id/desempenho` |
| `/comunidades/:id/desempenho?aba=historico` | `/comunidades/:id/desempenho/historico` |
| `/comunidades/:id/desempenho?sessao=<id>` | `/comunidades/:id/desempenho/historico?sessao=<id>` |
| `/comunidades/:id/gestao` (abria Regras) | `/comunidades/:id/gestao` (abre Membros) |
| `/admin` | `/plataforma` |

O parâmetro `sessao` sobrevive como parâmetro de consulta, porque identifica um registro, não uma
área. `pathForLegacyPage` passa a apontar para os endereços novos.

`/comunidades/:id/gestao` muda de conteúdo em vez de redirecionar: o endereço continua válido e
passa a abrir Membros, que é o que o nome promete.

## A dissolução do componente

Os nove painéis de aba são funções dentro de `CommunitiesView.tsx`. Cada um sai para o seu próprio
arquivo, em `src/components/community/areas/`, com as mesmas propriedades que já recebe:

| Painel hoje | Arquivo novo | Área |
| --- | --- | --- |
| `CommunitySummaryTab` | `CommunityOverviewArea.tsx` | Visão geral |
| `CommunityPlayersTab` | — removido | Pessoas já tem `PlayersView` |
| `CommunityPresenceTab` | `CommunityPresenceArea.tsx` | Sessões |
| `CommunityWhatsAppListTab` | `CommunityWhatsAppArea.tsx` | Sessões |
| `CommunitySessionsTab` | — removido | Sessões já tem `HistoryView` |
| `ChampionshipsTab` | `CommunityLeaguesArea.tsx` | Ligas |
| `CommunityRankingTab` | — removido | Desempenho já tem `RankingModule` |
| `CommunityMembersPanel` | fica onde está | Gestão |
| `CommunityRulesTab` | `CommunityRulesArea.tsx` | Gestão |
| `CommunityDataTab` | `CommunityDataArea.tsx` | Gestão |

Três painéis disputam lugar com um componente que a área de destino já renderiza:

- **Atletas** duplica `PlayersView`, que a área Pessoas já usa.
- **Ranking** duplica `RankingModule`, que o Desempenho já usa.
- **Sessões** duplica `HistoryView` com `initialTab: 'sessions'` e `hideTabs: true`, que a área
  Sessões já usa.

Em cada caso fica o componente que a área já renderiza, e o painel da aba é apagado. Antes de apagar,
o que ele tiver de diferente — uma coluna, uma ação, um estado vazio — vai para o componente que
fica. Essa comparação é um passo do plano, com a lista do que foi levado, não uma suposição.

No fim, `CommunitiesView.tsx` guarda só a lista de comunidades, a criação, a descoberta e a entrada
por código — as telas de `/comunidades`, sem comunidade selecionada. A barra de abas, o estado
`activeTab`, o filtro `visibleTabs` e o aviso de aba pendente saem junto.

O aviso de alterações não salvas (`UnsavedGuardProvider`) hoje protege a troca de aba. Como a troca
passa a ser navegação, ele passa a agir na navegação, pelo bloqueio de rota do roteador. É a única
mudança de comportamento invisível ao olho que esta fatia faz, e tem teste próprio.

## Permissões

A aba Membros só aparecia para quem tem cargo na comunidade (`permissions.role !== null`). A regra
sobrevive na área: Gestão fica visível para quem tem cargo; quem não tem e abrir o endereço direto é
mandado para a Visão geral. Regras e Dados continuam com as verificações que já têm por ação
(`canEditRules`, `canDeleteCommunity`, `canClearHistory`).

## Verificação

- **Rotas:** testes de `appRoutes.ts` para cada endereço novo, para os redirecionamentos da tabela
  acima e para a ordem entre `:sessionId` e as rotas fixas.
- **Navegação:** teste de `getShellNavigationItems` com os seis itens e a área ativa correta em cada
  endereço.
- **Áreas:** cada componente extraído leva consigo os testes que já existiam no `CommunitiesView.spec.tsx`,
  divididos por área.
- **Guarda de não salvo:** teste de que sair de Regras com alteração pendente pede confirmação.
- **Ponta a ponta:** os quatro arquivos de e2e que usam endereços de comunidade são atualizados numa
  fatia só, no fim.

## Fora do escopo

Não entram aqui: dar tela à inscrição, ler o conjunto de candidatos publicado, mover a autorização de
avaliador para Gestão, renderizar a aprovação de fotos, badge de pedidos pendentes e o destino da
autoavaliação. São os outros itens da varredura, cada um com sua própria fatia.

Também não entra redesenho visual: as áreas herdam a aparência que os painéis já têm.
