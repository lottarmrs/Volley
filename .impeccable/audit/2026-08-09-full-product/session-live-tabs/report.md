# Auditoria complementar — superfícies internas da sessão

Data: 2026-08-09  
Fixture: `Sessão — 09/08/2026`  
Estado desta nota: **19 evidências aceitas; encerramento/histórico ainda pendentes**

## Cobertura e saúde por evidência

| # | Evidência | Superfície verificada | Saúde |
|---:|---|---|---|
| 01 | [Pré-primeira partida](01-pre-primeira-partida.jpg) | Sessão pronta antes do primeiro jogo | Crítica: estado global dizia partida em andamento antes do começo |
| 02 | [Partida ativa](02-partida-ativa-paineis.jpg) | Dois placares, jogadores e ações rápidas/detalhadas | Fraca: somente 7 dos 9 selecionados aparecem distribuídos |
| 03 | [Ponto Nosso](03-point-modal-ponto-nosso.jpg) | Primeira aba do modal detalhado | Boa, porém o CTA depende de seleção prévia |
| 04 | [Autor e fundamento](04-point-modal-autor-fundamento-assistencia.jpg) | Autor, fundamento e assistência | Regular: muitos controles competem no mesmo modal |
| 05 | [Assistência](05-point-modal-assistencia.jpg) | Levantador/assistência | Regular: seleção longa dentro de modal já denso |
| 06 | [Erro Adversário](06-point-modal-erro-adversario.jpg) | Segunda aba do modal | Boa separação conceitual |
| 07 | [Erros avançados](07-point-modal-erros-avancados.jpg) | Categorias adicionais | Regular: taxonomia extensa sem progressão clara |
| 08 | [Subtipos de erro](08-point-modal-subtipos-erro.jpg) | Drill-down da categoria Ataque | Regular: profundidade aumenta sem resumo persistente |
| 09 | [Ponto registrado](09-ponto-registrado-paineis-atualizados.jpg) | Placar/eventos após confirmação | Regular; detalhe ficou `Não informado`, mas automação não permite confirmar bug |
| 10 | [Ponto desfeito](10-desfazer-ponto-recuperado.jpg) | Reversão do último ponto | Boa; placar voltou ao estado anterior |
| 11 | [Formulário de destaque](11-highlight-form.jpg) | FAB e criação de lance | Regular: ação flutuante fica desconectada do fluxo principal |
| 12 | [Destaque registrado](12-highlight-registrado.jpg) | Cartão de destaque | Boa visibilidade do resultado |
| 13 | [Destaque removido](13-highlight-removido.jpg) | Remoção do fixture criado | Fraca: remoção imediata sem confirmação/undo |
| 14 | [Primeiro confronto finalizado](14-partida-finalizada-proxima-fila-classificacao.jpg) | Próxima batalha, fila e classificação | Regular: informação essencial exige rolagem longa |
| 15 | [Fila rotacionada](15-segunda-partida-fila-rotacionada.jpg) | Reentrada após iniciar jogo 2 | Boa lógica de rotação visível |
| 16 | [Segundo confronto](16-segunda-partida-confronto.jpg) | Time 1 × Time 3 | Regular: nomes acessíveis `Rápido`/`Detalhar` são duplicados |
| 17 | [Segundo jogo finalizado](17-segunda-partida-finalizada.jpg) | Próxima batalha Time 1 × Time 2 | Fraca: banner ainda dizia `Partida em Andamento` entre jogos |
| 18 | [Terceiro confronto](18-terceiro-jogo-rotacao-completa.jpg) | Time 1 × Time 2 e classificação parcial | Regular: feed domina a altura útil |
| 19 | [Rotação inicial completa](19-terceiro-jogo-finalizado-classificacao.jpg) | Terceiro resultado e nova próxima batalha | Regular: sessão livre segue indefinidamente sem marco de ciclo completo |

## Achados confirmados nesta passagem

1. **P0 — integridade do elenco:** 9 atletas foram selecionados, mas os três times continuam com
   3 + 2 + 2 atletas. Dois IDs desapareceram da distribuição.
2. **P0/P1 — máquina de estados:** antes do primeiro jogo e novamente entre jogos finalizados, o
   cabeçalho global apresenta `Partida em Andamento` sem existir placar ativo.
3. **P1 — acessibilidade de ação:** os dois times expõem botões com os mesmos nomes acessíveis
   `Rápido` e `Detalhar`; o leitor de tela não recebe o nome do time.
4. **P1 — remoção sem recuperação:** remover um destaque acontece imediatamente, sem confirmação
   nem undo.
5. **P1 — densidade/rolagem:** placar, feed, destaques, classificação, fila e compartilhamento
   estão numa única coluna vertical muito longa. O usuário perde contexto entre a ação no placar e
   o estado da fila/classificação.
6. **P2 — taxonomia do ponto detalhado:** a combinação autor → fundamento → assistência → erros
   avançados → subtipo é completa, mas o modal não mantém um resumo compacto da seleção.
7. **Observação não classificada:** o evento detalhado automatizado apareceu como `Não informado`.
   Como a sequência rápida pode ter usado referências de uma renderização anterior, isso exige um
   teste manual controlado antes de ser tratado como defeito do produto.

## Mutações efetuadas

- um ponto detalhado criado e desfeito;
- um destaque `Defesa` criado e removido;
- 45 pontos rápidos registrados em três jogos;
- resultados: 15×0, 15×0 e 0×15;
- `Encerrar Sessão` acionado; confirmação nativa ainda precisa ser aceita e verificada.

Ver o registro canônico em `../mutations.md`.

## Retomada exata

1. Não clicar novamente em `Encerrar Sessão` se a confirmação nativa estiver aberta.
2. Recuperar a aba e aceitar o diálogo existente com `getJsDialog().accept()`, ou receber um único
   clique manual do usuário.
3. Capturar resumo, premiação e reveal VUT, se aparecerem.
4. Abrir `Histórico`, localizar `Sessão — 09/08/2026`, percorrer todas as abas e testar apenas
   previews/copiar; não enviar externamente.
5. Só então iniciar a matriz interna do torneio.
