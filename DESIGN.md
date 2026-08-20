---
name: Panelinha Team Balancer (Volley)
description: App local-first para balanceamento de times, acompanhamento ao vivo de partidas de vôlei e gestão de peladas.
colors:
  primary: '#2563eb'
  primary-hover: '#1d4ed8'
  secondary: '#14b8a6'
  accent: '#f97316'
  base-100: '#0b0c0e'
  base-200: '#14171c'
  base-300: '#1e222a'
  text-primary: '#ffffff'
  text-muted: 'rgba(255, 255, 255, 0.65)'
  success: '#16a34a'
  warning: '#d97706'
  error: '#dc2626'
  info: '#0284c7'
typography:
  sans:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontWeight: 400
  mono:
    fontFamily: 'JetBrains Mono, ui-monospace, monospace'
    fontWeight: 400
rounded:
  sm: '6px'
  md: '10px'
  lg: '16px'
  xl: '24px'
  full: '999px'
spacing:
  sm: '8px'
  md: '16px'
  lg: '24px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.md}'
    padding: '12px 24px'
  button-primary-hover:
    backgroundColor: '{colors.primary-hover}'
  button-accent:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.md}'
    padding: '12px 24px'
  card-surface:
    backgroundColor: '{colors.base-200}'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.lg}'
    padding: '16px'
---

# Design System: Panelinha Team Balancer

## Overview

**Creative North Star: "The Technical Volleyball Arena"**

O Panelinha Team Balancer adota a estética de uma arena técnica de alta energia: um tema escuro profundo e imersivo (`#0b0c0e`), contrastado com azul elétrico (`#2563eb`) e laranja vibrante de quadra (`#f97316`). O design é construído para alta legibilidade e operação tátil imediata, permitindo que organizadores operem o aplicativo rapidamente na beira da quadra sob iluminação intensa ou em partidas dinâmicas.

A interface equilibra um visual esportivo profissional com elementos colecionáveis marcantes (como os cards de atletas estilo Ultimate Team com bordas e efeitos holográficos) sem comprometer a clareza operacional das estatísticas, placares e escalações.

**Key Characteristics:**

- Dark mode nativo com fundos em camadas profundas (`#0b0c0e` → `#14171c` → `#1e222a`).
- Destaques de ação em Azul Elétrico (`#2563eb`) e Laranja Quadra (`#f97316`).
- Tipografia limpa e técnica (Inter para UI e JetBrains Mono para pontuações e dados numéricos).
- Componentes colecionáveis VUT (Volley Ultimate Team) com raridades visuais e efeitos metalizados.
- Alvos de toque otimizados para dispositivos móveis (`min-height: 44px` em telas sensíveis ao toque).

## Colors

A paleta é organizada em camadas escuras com cores de ação de alto contraste.

### Primary

- **Electric Court Blue** (`#2563eb`): Cor primária de marca e botões de ação principal. Transmite precisão e energia.

### Secondary

- **Cyan Tactical** (`#14b8a6`): Usado para acertos táticos, estatísticas de levantamento e destaques secundários.

### Tertiary / Accent

- **Volleyball Matchday Orange** (`#f97316`): Cor de destaque vibrante para ações de ataque, pontuações vivas e indicadores de urgência.

### Neutral

- **Deep Arena Base** (`#0b0c0e`): Fundo principal da aplicação.
- **Surface Container** (`#14171c`): Superfície de cards e painéis.
- **Surface Muted** (`#1e222a`): Superfície de contêineres secundários e linhas divididas.
- **Text Primary** (`#ffffff`): Texto de contraste máximo.
- **Text Muted** (`rgba(255, 255, 255, 0.65)`): Subtítulos e rótulos secundários.

### Named Rules

**The Court Accent Hierarchy Rule.** O azul primário (`#2563eb`) domina ações do sistema (salvar, sortear, continuar). O laranja de quadra (`#f97316`) é exclusivo para eventos esportivos ao vivo (marcar ponto, destaque de MVP e ações de partida).

## Typography

**Display & Body Font:** Inter (com fallback `ui-sans-serif, system-ui, sans-serif`)  
**Data & Mono Font:** JetBrains Mono (com fallback `ui-monospace, monospace`)

**Character:** Tipografia limpa, altamente legível e técnica. Numerais e placares usam JetBrains Mono para alinhamento tabular perfeito durante contagem de pontos.

### Hierarchy

- **Display** (Bold/Extrabold, clamp(1.75rem, 5vw, 2.5rem), 1.1): Títulos de seções principais e telas de partida.
- **Headline** (SemiBold/Bold, 1.25rem, 1.25): Títulos de cards e cabeçalhos de tabelas.
- **Body** (Regular/Medium, 1rem, 1.5): Textos explicativos, formulários e listas.
- **Label** (Medium/SemiBold, 0.75rem - 0.875rem, 1.2, uppercase/normal): Rótulos de fundamentos, badges e estatísticas.
- **Score Mono** (Bold, 2rem - 3.5rem, 1.0): Placar ao vivo em JetBrains Mono.

### Named Rules

**The Monospace Score Rule.** Todos os números de placar ao vivo, tempos, pontuações e estatísticas de fundamentos devem ser renderizados em `JetBrains Mono` para evitar deslocamento horizontal de layout durante a atualização dos pontos.

## Layout

A espacialidade segue um grid flexível responsivo com ritmo baseado em múltiplos de 8px (sm: 8px, md: 16px, lg: 24px). Em telas móveis, os contêineres expandem em largura total com padding lateral de 16px, priorizando barras de navegação fixas ou botões de ação flutuantes de fácil acesso com o polegar.

## Elevation & Depth

O sistema utiliza estratificação tonal profunda complementada por sombras difusas em dark mode. Superfícies mais elevadas recebem tons ligeiramente mais claros de cinza azulado (`#1e222a`) e bordas translúcidas de 1px com color-mix.

### Shadow Vocabulary

- **Card Shadow** (`box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4)`): Usado em cards de partidas, times e atletas.
- **Floating Surface** (`box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6)`): Usado em modais, menus suspensos e modais de placar.
- **Focus Ring** (`box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.35)`): Anel de foco acessível para botões e campos de entrada.

### Named Rules

**The Tonal Layering Rule.** A profundidade é criada primariamente por variação de tom de fundo (`#0b0c0e` → `#14171c` → `#1e222a`) e bordas translúcidas, reservando sombras intensas apenas para elementos flutuantes e modais.

## Shapes

- **Corner Radius**: `6px` para elementos pequenos (badges, chips), `10px` para botões e campos de formulário, `16px` para cards e painéis principais, `24px` para modais e `999px` para pílulas/avatares.
- **Form Language**: Formas geométricas limpas com bordas de 1px translúcidas. Os cards VUT utilizam recorte especial em escudo (`clip-path: polygon(...)`).

## Components

### Buttons

- **Shape:** Borda suave (`rounded-md` / 10px).
- **Primary:** Fundo `#2563eb`, texto `#ffffff`, padding `12px 24px`. Em hover: tom mais escuro `#1d4ed8`.
- **Accent:** Fundo `#f97316`, texto `#ffffff`, padding `12px 24px`.
- **Ghost / Muted:** Fundo transparente ou `rgba(255,255,255,0.05)`, texto `#ffffff`, borda `1px solid rgba(255,255,255,0.12)`.
- **Mobile Touch Target:** Em telas sensíveis ao toque, altura mínima garantida de `44px`.

### Cards / Containers

- **Corner Style:** `rounded-lg` (16px).
- **Background:** `#14171c` com borda `1px solid color-mix(in srgb, #ffffff 12%, transparent)`.
- **Internal Padding:** 16px (md) a 24px (lg).

### Inputs / Fields

- **Style:** Fundo `#1e222a`, texto `#ffffff`, borda `1px solid rgba(255,255,255,0.15)`, `rounded-md` (10px).
- **Focus:** Anel de foco azul elétrico (`0 0 0 3px rgba(37, 99, 235, 0.35)`).

### VUT Cards (Volley Ultimate Team)

- **Style:** Formato de escudo (`vut-card-shield`), fundos metálicos por tier (Bronze, Prata, Ouro, Elite), bordas com animações de brilho para raridades Lendárias/Épicas e efeitos holográficos para edições especiais (MVP, Maestro, Muralha).

A composição das classes é derivada em `FutCard.tsx`: `vut-bg-${tier}` (ou `vut-bg-${edition}` quando a edição não é base), `vut-border-${rarity}` e `vut-style-${styleKey}`. Os tipos `VutTier` e `AchievementRarity` vivem em `src/logic/futCards.ts` — acrescentar um valor lá exige a classe correspondente aqui.

#### Rampas de material por tier

| Tier       | Degradê de fundo                  | Texto     |
| ---------- | --------------------------------- | --------- |
| **Bronze** | `#4a2f1c` → `#2f180d` → `#170b05` | `#ecdcd6` |
| **Prata**  | `#6b828f` → `#3e4d56` → `#1e2529` | `#e3f2fd` |
| **Ouro**   | `#d4af37` → `#aa7c11` → `#543d05` | `#fff9c4` |
| **Elite**  | `#1e1b4b` → `#03001e` → `#120012` | `#e0e7ff` |

#### Edições especiais

| Edição      | Base                                                 | Significado         |
| ----------- | ---------------------------------------------------- | ------------------- |
| **MVP**     | ouro espelhado (`#d4af37` → `#fffdd0` → `#855b13`)   | melhor da pelada    |
| **Maestro** | turquesa (`#0d9488` → `#0f766e` → `#115e59`)         | levantador decisivo |
| **Muralha** | laranja queimado (`#ea580c` → `#9a3412` → `#431407`) | bloqueio dominante  |

#### Raridade da moldura

`common` `#d7ccc8`→`#5d4037` · `uncommon` `#81c784`→`#1b5e20` · `rare` `#64b5f6`→`#0d47a1` · `epic` `#ba68c8`→`#4a148c` · `legendary` degradê holográfico animado (`#ffb300`, `#ff3d00`, `#9c27b0`, `#2196f3`, `#4caf50`).

### Uniformes de time

Paleta fechada de seis degradês para identificar times em quadra (`VolleyballCourtLineup`): Vermelho, Azul, Verde, Laranja, Roxo e Preto & Ouro. Time novo escolhe da paleta; cor livre fora dela quebra o reconhecimento entre partidas.

### Empty State

Componente `src/ui/EmptyState.tsx`. Painel de **primeiro uso** de uma área ainda sem conteúdo: chip de ícone do domínio, título que nomeia o valor, uma frase de descrição e as ações como `children`.

- **Do** usar quando a área nunca teve conteúdo — a mensagem é uma porta de entrada.
- **Don't** usar para busca sem resultado, falta de permissão ou falha de carregamento. Esses estados têm outra mensagem e outra saída; tratá-los com este painel faz o app convidar a criar algo que já existe.
- `size="compact"` para painéis dentro de abas, onde o título da região já foi dado.

## Motion

O `h1` da página vive no cabeçalho do shell; o conteúdo começa no `h2`. Movimento segue a mesma disciplina: explica estado, não decora.

- **Curva de chegada** (`ease-arrive`): `cubic-bezier(0.16, 1, 0.3, 1)`. Desaceleração exponencial. Mola e elástico devolvem o objeto — leem como brinquedo e, no placar, como incerteza sobre o ponto que entrou.
- **Escala de duração** (`src/ui/motion.ts`): 150 ms feedback · 250 ms estado · 400 ms overlay · 600 ms momento focal. Saída sempre mais rápida que entrada.
- **Momento focal único:** a revelação da carta VUT no fim da pelada — meia volta em Y com varredura única de luz ao pousar (`vut-reveal-landing`). É o único lugar que ganhou autoria; o resto é confirmação.
- **Movimento reduzido:** `<MotionConfig reducedMotion="user">` em `main.tsx` desliga deslocamento e escala em toda a árvore. O bloco `@media (prefers-reduced-motion: reduce)` em `index.css` silencia os laços decorativos (brilhos VUT, `animate-ping`) e preserva o que carrega estado: `animate-spin`, pulsar de opacidade, transições de cor e foco.

### Named Rules

**The Confirmation Survives Rule.** Nenhum caminho de movimento reduzido pode apagar a confirmação de uma ação. O soco do placar vira clarão de opacidade, não desaparece: sem ele o organizador não sabe se o toque entrou.

## Do's and Don'ts

### Do:

- **Do** usar numerais em `JetBrains Mono` em placares ao vivo e estatísticas de atletas.
- **Do** garantir que botões interativos possuam `min-height: 44px` em dispositivos móveis.
- **Do** utilizar bordas translúcidas de `1px` com `color-mix` para separar camadas de superfícies escuras.
- **Do** manter mensagens de UI e rótulos obrigatoriamente em Português (pt-BR).

### Don't:

- **Don't** utilizar fundos brancos ou temas claros puro sem preservar o contraste do dark mode.
- **Don't** misturar a cor Laranja Quadra (`#f97316`) com botões genéricos de sistema; ela deve ser reservada para destaque de quadra/ao vivo/MVP.
- **Don't** usar sombras genéricas sem cor em superfícies flutuantes; prefira o vocabulário de elevação definido.
