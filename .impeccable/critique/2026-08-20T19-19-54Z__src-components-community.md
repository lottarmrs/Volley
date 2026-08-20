---
target: todos os formulários da página de comunidades
total_score: 15
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-08-20T19-19-54Z
slug: src-components-community
---
Method: dual-agent (A: design review isolado · B: detector + medicao de navegador isolado)

## Design Health Score

| # | Heuristica | Nota | Problema-chave |
|---|---|---|---|
| 1 | Visibilidade do estado | 1 | Criar atleta e mudo. Nome duplicado vincula o atleta existente em silencio (localPlayerUseCases.ts:183) |
| 2 | Correspondencia com o mundo real | 2 | ~18 rotulos sem acento; "Dia" e texto livre num dominio onde dia e dia da semana |
| 3 | Controle e liberdade | 1 | Trocar de aba destroi rascunho nao salvo sem aviso (Regras 12 campos, Dados 7, WhatsApp 16) |
| 4 | Consistencia e padroes | 1 | Tres mecanismos de confirmacao; quatro campos duplicados entre Regras e Dados |
| 5 | Prevencao de erro | 1 | Nenhum campo obrigatorio sinalizado; NumberField sem min/max/step |
| 6 | Reconhecer em vez de lembrar | 1 | Placeholder-como-rotulo; 7 de 24 campos sem nome acessivel (medido) |
| 7 | Flexibilidade e eficiencia | 2 | Enter nao submete nos dois campos mais usados; Nova liga com 160 checkboxes |
| 8 | Estetico e minimalista | 2 | Lista WhatsApp com 12 campos sem cabecalho de grupo |
| 9 | Recuperacao de erro | 1 | Erros sem role=alert/aria-invalid; Membros aponta para aba inexistente |
| 10 | Ajuda e documentacao | 3 | Ponto alto: empty states ensinam affordances visiveis |
| Total | | 15/40 | Poor - revisao estrutural necessaria |

## Veredito de especificidade

Generico com dois bolsoes autorais. Composicao dominante e daisyUI de catalogo. Assinam o produto: construtor de Lista WhatsApp e formulario de Nova liga.

Varredura deterministica: 0 achados, validado com 3 controles (arquivos explicitos, --no-config, prova de que o detector acha em src/). O detector e cego para qualidade de formulario: mede cor, raio, easing, densidade; nao mede rotulo, submit por Enter, anuncio de erro.

Overlays visuais: nenhum. Nao houve injecao de script.

## Cruzamento das avaliacoes

- Campos sem rotulo: A apontou por leitura, B mediu 7 de 24 com arquivo:linha
- Alvos de toque: 40px confirmado, btn-square a 34x40
- Abas sem aria-selected: confirmado pelas duas independentemente
- Contraste: 3 falhas so em B - breadcrumb 3.48:1, badge 3.60:1, "Limpar historico" 3.19:1
- Rolagem horizontal: zero nas 10 abas

## Problemas prioritarios

P0 - "Nova" nao tem formulario, cria lixo com nome-placeholder (CommunitiesView.tsx:284). As duas avaliacoes tropecaram e criaram "Nova comunidade 2" e "Nova comunidade 3". Onboarding manda renomear na aba Regras; o campo Nome esta em Dados. Fix: modal com Nome obrigatorio, Local, Dia como chips; addCommunity so no submit. Comando: /impeccable shape

P1 - Trocar de aba destroi rascunho nao salvo. Abas renderizadas condicionalmente matam o useState local. Fix: interceptar troca ou salvar no onBlur e remover os cinco botoes Salvar. Comando: /impeccable harden

P1 - Trocar papel de membro aplica sem confirmacao nem feedback (CommunityMembersPanel.tsx:368). select-sm de 32px muda governanca no onChange. Remover tem confirm, promover nao tem nada. Comando: /impeccable harden

P1 - Criar atleta: botao anonimo (aria-label null), sem form, sem Enter, silencioso; duplicata vira vinculo oculto. Fix: aria-label, form onSubmit, rotulo real, discriminante created|linked|empty. Comando: /impeccable clarify

P2 - Regras e Dados disputam Local/Dia/Inicio/Fim com rotulos divergentes e dois botoes de salvar. Comando: /impeccable distill

P2 - Contraste abaixo do piso em 3 elementos; "Limpar historico" a 3.19:1 e o pior. Comando: /impeccable polish

## Bandeiras por persona

Organizador na quadra: inputs time a 40px (DESIGN.md exige 44); Enter nao adiciona convidado; zona de risco sem separacao em Dados.
Teclado/leitor: abas sem aria-selected/aria-controls/tabpanel; 5 secoes de Regras sao checkboxes anonimos; erro de nome duplicado e span solto.
Primeira vez: cria comunidade sem digitar nada; Regras nao tem campo Nome; Membros aponta para aba inexistente.

## Observacoes menores

JoinCommunityByCode faz uppercase so no CSS. CountInput apaga nomes ao reduzir vagas. "Duplicar com atletas" sem confirmacao nem feedback. Unico required sem indicacao visual. Correcao de B: o ERR_CONNECTION_REFUSED nao e Supabase sem .env (o .env existe e funciona) - e o live.js do Impeccable na porta 8400.

## Perguntas

1. Se criar comunidade nao precisa de formulario, por que editar precisa de dois?
2. Por que remover membro pede confirmacao e promover a admin nao?
3. Por que member sem permissao ve Regras e Dados ocupando duas fileiras de abas no mobile?
4. Se as outras abas seguissem o criterio da Lista WhatsApp, quantos dos 12 campos planos sobreviveriam?
