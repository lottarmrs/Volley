---
timestamp: 2026-08-20T13-16-59Z
slug: localhost-perfil-sync
---
⚠️ DEGRADED: single-context (sub-agent tool not available in environment)

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Status da nuvem presente, mas falta progresso em tempo real |
| 2 | Match System / Real World | 2 | Jargões técnicos ("LWW", "Sanear duplicatas") e falta de acentuação em PT-BR |
| 3 | User Control and Freedom | 3 | Resolução de conflitos ("Manter meu" / "Manter nuvem") funcional |
| 4 | Consistency and Standards | 2 | Botões do topo aglomerados com tamanhos e pesos inconsistentes |
| 5 | Error Prevention | 3 | Alerta claro quando VITE_SUPABASE_* não está configurado |
| 6 | Recognition Rather Than Recall | 2 | 4 botões de ação diferentes acumulados no cabeçalho sem hierarquia clara |
| 7 | Flexibility and Efficiency | 2 | Sem atalhos de teclado (ex: Ctrl+S para sincronizar) |
| 8 | Aesthetic and Minimalist Design | 2 | Excesso de ruído visual (cards empilhados, bordas duplicadas e botões sem ordem) |
| 9 | Error Recovery | 3 | Mensagens de erro com suporte a nova tentativa |
| 10 | Help and Documentation | 2 | Falta tooltips explicativos para termos técnicos como "Sanear Duplicatas" |
| **Total** | | **24/40** | **Good / Acceptable threshold (60%)** |

#### Design Specificity Verdict

**LLM assessment**: A tela de sincronização funciona corretamente do ponto de vista operacional, porém visualmente parece um painel genérico do DaisyUI/Bootstrap. Faltam os elementos identitários do sistema de design do Panelinha Volley (camadas em fundo escuro `#0b0c0e`/`#14171c`, fonte `JetBrains Mono` nos horários e contadores, e a hierarquia do azul elétrico `#2563eb`).

**Deterministic scan**: O `detect.mjs` identificou 1 warning de animação antiquada na linha 74 (`animate-bounce` na mensagem de nuvem não configurada).

**Visual overlays**: N/A (Inspeção visual direta executada via leitura do componente e análise de estrutura DOM).

#### Overall Impression

A tela entrega todas as funcionalidades críticas de sync local-first e Supabase, mas falha na hierarquia de informação e no acabamento visual. Parece uma lista acumulada de recursos técnicos (MFA, Vincular Google, Sanear Duplicatas, Conflitos, Histórico) em vez de um painel fluido de conta e backup.

#### What's Working
1. **Diagnóstico da Nuvem**: O card com status visual de saúde (`cloudHealth`) comunica instantaneamente a operacionalidade do sistema.
2. **Resolução Transparente de Conflitos**: A seção `SyncConflictSection` permite escolher entre "Manter dados locais" ou "Manter dados da nuvem" com clareza.
3. **Estado Não Configurado**: A tela trata graciosamente a ausência das variáveis de ambiente com orientações passo a passo.

#### Priority Issues

- **[P1] Poluição Visual e Aglomeração de Ações no Cabeçalho**
  - **Why it matters**: No topo do card, o botão "Vincular Google", o link gigante "Configurar autenticacao em duas etapas" e o botão de logout disputam espaço com a foto/função do usuário, quebrando o layout em telas menores.
  - **Fix**: Reorganizar o cabeçalho em duas seções bem definidas: Perfil/Sessão à esquerda e Ações de Segurança/Conta agrupadas em um menu suspenso ou seção dedicada de "Segurança da Conta".
  - **Suggested command**: `/impeccable layout`

- **[P1] Jargões Técnicos e Erros de Acentuação em Português**
  - **Why it matters**: Expressões como "Estratégia: Última modificação vence (LWW)" e "Sanear Duplicatas Antigas" assustam o usuário comum. Além disso, strings como `"Configurar autenticacao em duas etapas"`, `"Diagnostico da nuvem"` e `"Historico recente"` estão sem acentos em PT-BR.
  - **Fix**: Acentuar todas as strings do componente e incluir tooltips ou descrições amigáveis explicando o que cada ação faz antes do usuário clicar.
  - **Suggested command**: `/impeccable clarify`

- **[P2] Botão de Animação com Slop (`animate-bounce`)**
  - **Why it matters**: O efeito `animate-bounce` no ícone do alerta de "Nuvem não configurada" transmite sensação de interface não profissional.
  - **Fix**: Substituir por `animate-pulse` suave ou por um indicador estático com brilho/glow.
  - **Suggested command**: `/impeccable polish`

- **[P2] Falta de Tipografia Tabular Monospaced em Timestamps**
  - **Why it matters**: A data/hora do "Último Backup" usa fonte proporcional padrão, violando a diretiva do design system de usar `JetBrains Mono` em datas, pontuações e estatísticas.
  - **Fix**: Aplicar a classe `font-mono` na exibição da data/hora do último backup.
  - **Suggested command**: `/impeccable typeset`

#### Persona Red Flags

**Jordan (First-Timer)**: Fica inseguro ao ver o botão "Sanear Duplicatas Antigas" sem saber se isso irá apagar atletas criados na pelada local. Sente falta de explicações sobre o que é "LWW".

**Alex (Power User)**: Sente falta de um atalho de teclado como `Ctrl+S` para acionar a sincronização sem precisar navegar com o mouse até o botão principal.

**Casey (Distracted Mobile User)**: No smartphone, os botões do cabeçalho ("Configurar autenticacao em duas etapas") quebram a linha e empurram as estatísticas de backup para fora do primeiro fold da tela.

#### Minor Observations
- O botão de "Limpar resolvidas" usa o estilo `btn-xs` sem altura mínima de toque de 44px exigida para mobile.
- A cor primária do botão principal de sincronização (`btn-primary`) usa classe genérica em vez das cores personalizadas do design system.

#### Questions to Consider
- O recurso "Sanear duplicatas" precisa ficar permanentemente visível como ação primária, ou poderia ficar em um menu colapsável de "Ferramentas Avançadas / Manutenção"?
- Como podemos agrupar as opções de segurança da conta (MFA, Google, Sair) para despoluir o cabeçalho principal?
