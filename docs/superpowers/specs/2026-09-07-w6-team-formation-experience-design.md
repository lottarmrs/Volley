# W6 — Experiência de formação, escolha e confirmação dos times

> Status: proposta de UX preparada para a W6; não implementada.
>
> Escopo acordado em 2026-09-07: preparar a experiência para a W6, seguindo a ordem do C6.
> A preparação desta proposta não fecha decisões OPEN, não conclui fatias e não antecipa seu cutover.
>
> Autoridade: os capítulos canônicos N2 definem o domínio; C6 define sequência e gates.
> Este documento detalha apresentação e interação subordinadas a essas fontes.

## 1. Fontes e posição no programa

- [HANDOFF](../../../HANDOFF.md): consultar o estado corrente antes de iniciar implementação.
- [C6 Execution Master](../../architecture/execution/C6-EXECUTION-MASTER.md): ordem das waves.
- [C6.02, W6](../../architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md): fatias e gates de formação/votação.
- [N2.01, Product Experience](../../architecture/contexts/N2.01-product-experience.md): jornadas casual e Community, feedback e autoridade.
- [N2.06, Team Formation](../../architecture/contexts/N2.06-team-formation.md): formação, diagnósticos, escolha, voto e confirmação.
- [Open Decisions, Team Formation](../../architecture/catalogs/OPEN-DECISIONS.md): políticas ainda não fechadas.
- [N2.07, Live Match](../../architecture/contexts/N2.07-live-match.md): fronteira com execução de partidas.
- [N2.08, Competitions](../../architecture/contexts/N2.08-competitions.md): identidade competitiva limitada à edição.
- [DESIGN.md](../../../DESIGN.md): identidade visual existente; preservar nesta proposta.

A implementação acompanha W5 → W6 → W7 → W8 → W9. Em particular, W5-05 deve entregar a
fonte target de avaliações para o resolver da W6. Uma entrega validada localmente não é evidência
de integração ou implantação. A prontidão deve ser verificada no início de cada fatia.

## 2. Resultado de produto

O organizador consegue comparar formações pelo que muda em quadra e confirmar uma opção válida.
Na modalidade de votação, o participante entende suas opções, registra o próprio voto e reconhece
quando os times foram efetivamente confirmados.

O modo desta superfície é **Operate**: a apresentação esportiva facilita uma decisão concreta.
A sensação de jogo vem de reconhecer os atletas, comparar equipes, participar da escolha e ver a
formação confirmada. Nenhuma dessas ações cria XP, moedas, missões ou recompensas novas.

Vocabulário de interface: **Times**, **Formações**, **Opção**, **Votação** e **Times confirmados**.
SQUAD não se torna uma entidade, clube permanente ou nova área de navegação nesta entrega.

## 3. Evidência atual e fronteira de reaproveitamento

| Evidência no código | Uso na preparação da W6 |
| --- | --- |
| `src/components/session/SessionWizard.tsx`, passo de resultados | Referência do fluxo de opções, troca de atletas, regeneração e compartilhamento. O estado legado não é o contrato target. |
| `src/components/session/SessionSetupSummary.tsx` | Referência de resumo; indicadores e composição só aparecem quando sustentados por dados e políticas target. |
| `src/components/championship/VolleyballCourtLineup.tsx` | Referência visual de quadra e atletas. Não importar o tipo competitivo nem a escolha dos seis primeiros como titulares. |
| `src/components/player/FutCard.tsx` | Referência de identidade do atleta. Não usar OVR, raridade ou conquistas para recomendar uma formação. |

Antes da implementação, mapear o host de rota/shell vigente. Esta proposta não fixa uma rota nova
nem exige ampliar o `SessionWizard` monolítico. Componentes de apresentação e um view model de
formação devem consumir os contratos target das fatias, mantendo o adaptador legado na fronteira.

## 4. Sequência de experiência

```text
Participantes e regras prontos
  → Gerar formações
  → Comparar opções válidas
      → Escolha do organizador
      OU
      → Votação dos participantes elegíveis
  → Confirmar times conforme o fluxo autoritativo
  → Exibir times confirmados
  → Prosseguir pela prontidão da sessão/partida
```

A votação é opcional e depende da política da sessão. Quick Session mantém o caminho simples de
gerar, ajustar e confirmar localmente; não exige Community, conta ou uma etapa de votação.
Sua migração completa e infraestrutura local pertencem à W12. A W6 preserva essa fronteira sem
anunciar a jornada Quick legada como já migrada.

### 4.1 Gerar formações

Mostrar quantidade de participantes e times, regras aplicáveis e eventuais lacunas de avaliação.
Durante a busca, apresentar “Montando opções de times…” e impedir acionamentos duplicados.
Não inventar porcentagem de progresso ou número de iterações na interface do organizador.

Se não houver solução válida, explicar a restrição reportada e oferecer revisão das configurações
permitidas. Nunca afrouxar uma regra obrigatória em silêncio ou prometer solução ótima.

### 4.2 Comparar opções

Cada opção representa uma divisão completa de todos os participantes entre os times. Selecionar
“Opção 2” troca o conjunto inteiro; não significa escolher apenas um time dentro da divisão.

No celular, opções em controles acessíveis acima de uma formação por vez; dentro dela, os times
seguem em blocos verticais. No desktop, mostrar os times da opção selecionada lado a lado quando
houver espaço. A quantidade de opções vem do resultado; três é hipótese de UX, não limite fixo.

Cada time mostra nome/cor disponíveis, participantes e perfil de posição quando conhecido.
A composição usa uma apresentação inspirada em quadra, sem afirmar posições de rotação,
titularidade, banco ou função tática que o TeamDraw não fornece. Para elencos acima de seis,
mostrar todos os integrantes em lista complementar; os excedentes não viram reservas automaticamente.

Junto à formação, um resumo explica diferenças por fundamentos, cobertura de posições e repetição,
somente quando esses diagnósticos existirem na política executada. Exemplos de rótulos do N2.06:

- “Mais equilibrado nos fundamentos”.
- “Melhor cobertura de posições”.
- “Menor repetição de duplas”.

Rótulos comparativos dependem de diagnóstico confiável do conjunto; não são nomes decorativos
atribuídos sempre às opções 1, 2 e 3. Dados ausentes aparecem como indisponíveis, nunca como zero.
Avaliação provisória é informação separada, sem penalidade visual de habilidade inventada.

Não apresentar OVR de equipe, raridade de carta, porcentagem de vitória ou medidor de química como
explicação da escolha. O perfil completo do atleta, se acessível, mantém sua própria finalidade.

### 4.3 Escolha e ajuste pelo organizador

A ação principal é “Escolher esta formação”, seguida da confirmação quando houver etapa útil.
O fluxo pode ser compacto, mas seleção visual não equivale a confirmação autoritativa.

Na edição permitida, usar seleção por toque/clique e escolha do destino; arrastar é opcional e
nunca o único meio. Explicar o impacto usando diagnósticos por fundamentos, sem classificar uma
troca manual válida como proibida apenas porque piora a nota do otimizador.

Toda edição target cria a revisão prevista no domínio. Não alterar um conjunto publicado durante
votação nem reescrever times confirmados anteriores. Regras obrigatórias continuam sendo validadas
pelo caminho autoritativo, inclusive quando a interface não detectou a incompatibilidade.

### 4.4 Votação

O participante consulta as mesmas opções publicadas e escolhe uma. “Registrar meu voto” é a ação;
“Voto registrado” só aparece após confirmação do servidor. Falha ou resposta incerta mantém a
seleção visível, informa que o registro não foi confirmado e permite reconciliação/retry idempotente
pelo contrato da fatia. Não enfileirar voto offline como se fosse válido.

Durante a votação aberta, não mostrar placar parcial, percentuais, preferência de outros usuários
ou identidade dos votantes por opção. Não criar exposição de contagem de participação sem contrato
de leitura que a autorize. Resultados seguem a política canônica de visibilidade após encerramento.

Quem não tem elegibilidade recebe a razão retornada pelo domínio. Guest sem conta continua no
elenco, mas não ganha voto digital por procuração do organizador. Community Admin ou capitão não
recebe comandos de organização automaticamente.

### 4.5 Confirmação e próximo passo

Ao receber o estado autoritativo, apresentar “Times confirmados”, com os mesmos atletas e cores
da opção efetivada. Usar a transição de estado existente e uma confirmação textual persistente.
Não introduzir uma segunda animação cinematográfica de cartas: o momento focal VUT permanece no
fluxo existente de fim de pelada conforme DESIGN.md.

Resultado da votação e TeamDraw confirmado são estados distintos. Não deduzir confirmação a
partir de maioria visual, votação encerrada ou clique local. Se a finalização já produzir a
confirmação segundo o contrato entregue, não inventar um segundo comando obrigatório na UI.

“Continuar” leva ao próximo passo permitido pela prontidão real. A preparação de MatchRoster,
escalação/rotação da partida e execução pertencem à W7; confirmar times não inicia partida.

## 5. Estados e recuperação

| Situação | Resposta visível e ação |
| --- | --- |
| Participantes ainda não finalizados | Explicar a pendência e encaminhar o organizador à etapa do elenco. |
| Restrições incompatíveis | Mostrar o motivo disponível e permitir revisar as regras autorizadas. |
| Avaliação ausente ou provisória | Exibir a condição separadamente; resolução segue a política versionada. |
| Busca em andamento | Feedback de processamento, sem sucesso antecipado ou progresso fictício. |
| Geração/publicação falhou | Preservar o contexto e oferecer nova tentativa; não chamar resultado local de publicado. |
| Sem permissão operacional | Oferecer apenas consulta quando permitida e explicar quem pode agir. |
| Voto selecionado, ainda não confirmado | Manter a seleção; não exibir “Voto registrado”. |
| Votação encerrou durante o envio | Reconciliar a resposta do servidor e mostrar se aquele voto foi aceito. |
| Elenco mudou | Informar “O elenco mudou. É preciso gerar novas opções.”; opções anteriores deixam de ser acionáveis. |
| Votação invalidada | Explicar a mudança; preservar histórico e não transportar votos para novas opções. |
| Outra pessoa confirmou antes | Atualizar para a confirmação vigente e explicar a alteração. |
| Empate ou ausência de votos | Apresentar somente o desfecho/ação da política resolvida; não escolher um vencedor na UI. |
| Sem conexão em sessão compartilhada | Explicar a necessidade de reconexão para o comando; leitura em cache, quando permitida, indica desatualização. |
| Quick local | Usar linguagem de confirmação local, sem alegar publicação ou confirmação coletiva. |

As frases são modelos de copy. As condições e permissões vêm dos contratos de aplicação e do
servidor; o cliente não reimplementa autorização a partir de cargos ou de arrays legados.

## 6. Apresentação e acessibilidade

Preservar a identidade existente: superfícies escuras, azul nas ações do sistema e números
tabulares. Laranja mantém seu uso esportivo previsto; não recolorir todos os controles para criar
uma aparência de jogo. Nome do time e estado textual acompanham a cor.

- Atletas sem foto recebem fallback textual; nomes longos não escondem ações.
- Quantidades de times e atletas seguem a configuração válida, sem limitar a tela a dois times.
- Seleção de opção, troca manual e voto funcionam por teclado e toque, com foco visível.
- Alvos de toque têm pelo menos 44 px; barra de ação não cobre o conteúdo no celular.
- A confirmação continua perceptível com movimento reduzido e sem depender de som.
- Mudanças assíncronas relevantes são anunciadas de forma acessível, sem expor escolhas privadas.
- Vocabulário técnico como fingerprint, revision e server ACK fica fora do fluxo do usuário.

## 7. Encaixe nas fatias existentes

| Fatia | Entrega de experiência associada | Condição para disponibilizar |
| --- | --- | --- |
| XS-W6-01 | Resumo de participantes, origem/qualidade dos dados e pendências compreensíveis | Resolver target apoiado na W5; sem OVR no input e sem missing convertido em zero. |
| XS-W6-02 | Geração com processamento e diagnóstico de inviabilidade | Contrato do solver e equivalência determinística entre execução direta e Worker. |
| XS-W6-03 | Comparação de opções completas, com explicações confiáveis | Publicação imutável validada pelo servidor para sessões compartilhadas. |
| XS-W6-04 | Escolha e edição manual permitida | Comandos target, validação obrigatória e preservação de revisões/proveniência. |
| XS-W6-05 | Superfície de voto e estados de elegibilidade/envio | Lifecycle, privacidade, identidade do votante e política de alteração de voto definidos. |
| XS-W6-06 | Encerramento, resultado e recuperação por invalidação | Apuração autoritativa e política explícita para empate/ausência de votos. |
| XS-W6-07 | Times confirmados e continuidade para preparação da partida | Transferência de autoridade ao TeamDraw e bloqueio de mutação legada para o conjunto migrado. |

A tabela associa UX às fatias; não transforma W6-04 em autorização para liberar o fluxo completo
antes do gate W6-07. Entregar primeiro contratos, validações e adaptadores, depois a UI target no
caminho de migração previsto. A retirada de leitores/escritores legados segue C6, sem duplicar
autoridade para aproveitar uma tela antiga.

## 8. Decisões preservadas como abertas

| Referência | Consequência para esta experiência |
| --- | --- |
| OPEN-BAL-004 | Quantidade/diversidade do portfólio não recebe limite ou limiar inventado pela UI. |
| OPEN-BAL-005 | Não exigir quórum implícito nem inventar contagem regressiva para atingi-lo. |
| OPEN-BAL-006 | Exibir alteração de voto apenas após a política definir quando ela é permitida. |
| OPEN-BAL-007 | Não codificar desempate ou fallback sem voto com base em hipótese. |
| OPEN-BAL-008/009 | Composição e dimensões adicionais aparecem somente conforme política explícita. |
| OPEN-BAL-010/011 | Lacunas e confiança seguem resolver/policy; não criam penalidade própria na interface. |

Pesos e objetivos seguem as decisões versionadas das fatias, incluindo OPEN-BAL-002/003.
Consultar o catálogo e ADRs vigentes antes de congelar contratos: esta lista não declara que
decisões permanecem abertas para sempre e não as encerra incidentalmente.

## 9. Critérios de aceite para a futura implementação

1. Toda opção mostra todos os participantes exatamente na composição retornada, inclusive Guests.
2. Selecionar uma opção não mistura times de opções diferentes nem afirma confirmação prematura.
3. Diagnósticos se referem à opção vigente e às fontes target; OVR não justifica a recomendação.
4. Edição válida preserva proveniência; edição incompatível não é confirmada.
5. Apenas o ator elegível registra seu voto, com confirmação online e um voto efetivo.
6. Votação aberta não expõe tally nem escolhas individuais em UI, consultas ou realtime.
7. Mudança de elenco invalida ações antigas; votos não são reaplicados em novas opções.
8. Retry, encerramento concorrente e confirmação concorrente convergem ao resultado autoritativo.
9. A confirmação não muda MatchRoster histórico nem inicia Match por efeito visual.
10. Quick continua acessível sem conta/Community e sem votação obrigatória.
11. A interface funciona com nomes longos, fotos ausentes, uma opção ou várias opções e diferentes
    tamanhos válidos de elenco; layout não transforma integrantes excedentes em reservas.
12. Teclado, toque, foco, estados assíncronos e movimento reduzido preservam entendimento e ação.

Na implementação, testar regras/view models com `.test.ts`, componentes/hooks com `.spec.tsx`
ou `.spec.ts`, e autoridade/privacidade/concorrência nos testes de banco das fatias. A verificação
visual deve cobrir celular e desktop. Executar os gates de cada fatia e a sequência de CI do
AGENTS.md antes de declarar uma entrega implementada. Este documento, sozinho, não prova esses gates.

## 10. Limite da entrega e próxima retomada

Não pertencem à W6 desta proposta: clube entre temporadas, XP coletivo, loja/desbloqueio de
uniformes, novas conquistas, ranking Glicko, mercado/transferências, escalação tática completa ou
reestruturação de competições. Times e elencos competitivos continuam na W8; estatísticas na W9.

Ao retomar: verificar HANDOFF e dependências da W5, ler esta proposta junto de N2.06 e C6.02,
revisar a composição visual antes de editar UI e anexar os requisitos correspondentes ao plano da
próxima fatia. Não iniciar toda a W6 como uma mudança única. A preparação de UX está registrada;
a execução continua dependendo dos gates e contratos do programa.
