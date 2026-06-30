# VUT — Volley Ultimate Team (Cartas de Jogador) · Plano v1

> Sistema de cartas colecionáveis estilo FIFA Ultimate Team, adaptado ao vôlei e
> **fundido com os motores de gamificação já existentes** (overall, nota de
> partida, forma, reconhecimento). Este documento é a especificação de
> implementação: o que fazer, por que, em que ordem e — principalmente — onde
> está o perigo.

---

## 1. Objetivo e princípio central

Transformar o perfil do atleta numa **carta viva e conquistável**. A graça do FUT
não é o número na carta — é que a carta é:

1. **Conquistada** — edições especiais saem do desempenho real, não de compra.
2. **Viva** — OVR e brilho mudam conforme o atleta joga.
3. **Profunda** — frente colecionável, verso analítico (verso fica no v2).

**Regra de ouro (não violar):** a carta é uma _representação visual_ de dados que
já existem. Ela **não** cria nem grava atributos novos. Tudo é **derivado** em
tempo de leitura. Nenhuma migração de banco no v1.

### Separação de camadas (o erro a evitar)

| Camada         | O que é              | Origem                        | Eixo da carta                    |
| -------------- | -------------------- | ----------------------------- | -------------------------------- |
| Habilidade     | `atributos` 0–10     | progressão                    | **OVR + 6 stats + Tier**         |
| Desempenho     | nota 0–10 da partida | motor de rating               | **Badge verde + edição In-Form** |
| Reconhecimento | Maestro/Muralha/MVP  | `calculateSessionRecognition` | **Edição especial + selos**      |
| Sinergia       | quem joga junto      | `partnershipHistory`          | **Química**                      |

> **Tier ≠ Edição especial.** Tier (bronze/prata/ouro) vem do OVR (habilidade).
> Edição especial (In-Form, MVP, Maestro, Muralha) vem do desempenho recente.
> São **dois eixos independentes** — conflatá-los é o erro clássico.

---

## 2. A matemática (corrigida)

### 2.1 Overall (OVR)

`calculatePositionOverall(player, posicaoPrincipal)` **já retorna 0–100**
(`Math.round(overall * 10) + formaAtual.valor * 0.5`, ver
[`src/logic/calculations.ts`](src/logic/calculations.ts)).

```ts
const ovr = Math.min(99, calculatePositionOverall(player, player.posicaoPrincipal));
```

- **NUNCA** multiplicar o overall por 9.9 (ver §7, Armadilha #1).
- Usar a versão **por posição** (não `calculateGeneralOverall`, que é média chapada
  sem peso de posição) para: (a) bater com o número que o app já exibe na lista e
  no perfil; (b) premiar o facilitador (levantador com `ataque` baixo mas
  `levantamento` alto ainda é Ouro).

### 2.2 Os 6 atributos macro (escala 0–99, com curva)

Mapeamento dos `atributos` (0–10) para os 6 stats da carta:

| Macro   | Fórmula                            |
| ------- | ---------------------------------- |
| **ATQ** | `ataque`                           |
| **BLO** | `bloqueio`                         |
| **SAQ** | `saque`                            |
| **LEV** | `levantamento`                     |
| **DEF** | média(`defesa`, `recepcao`)        |
| **FÍS** | média(`velocidade`, `resistencia`) |

Conversão 0–10 → 0–99 com **curva de calibração** (não linear):

```ts
// 1→28, 5→60, 8→84, 10→99. Tunável em ratingConstants/futConstants.
const toFut = (v: number) => Math.max(1, Math.min(99, Math.round(20 + v * 8)));
```

Motivo da curva: atributos são travados em 1–10 e a média de pelada gira em ~5.
Com ×9.9 linear, "5" vira 50 e quase ninguém alcança Ouro (≥75 = média 7.6),
deixando a comunidade inteira com carta bronze/prata (desmotiva). A curva faz um
"bom de quadra" já sentir prata/ouro, reservando 90+ para os de elite.

> Os atributos `leituraDeJogo`, `regularidade`, `controleEmocional` ficam **fora**
> dos 6 macro no v1. Estão refletidos no OVR (via pesos de posição) e na
> versatilidade. Considerar dobrá-los em DEF/LEV no v2.

### 2.3 Tier (pelo OVR)

```ts
function tierFromOvr(ovr: number): 'bronze' | 'silver' | 'gold' | 'elite' {
  if (ovr >= 85) return 'elite';
  if (ovr >= 75) return 'gold';
  if (ovr >= 60) return 'silver';
  return 'bronze';
}
```

### 2.4 Extras da frente

- **Versatilidade ⭐ (1–5):** de `getPlayerRecommendation(player)` —
  quantas posições têm rating alto. Ex.: nº de posições com rating ≥ (melhor − 5),
  travado em 1–5.
- **Mão R/L:** `player.maoDominante` (`direita`→R, `esquerda`→L).
- **Badge verde (nota):** `autoFormFromHistory(player)` (média das últimas notas)
  ou a última nota; cor por faixa (≥8 verde, ≥6 amarelo, senão vermelho).

---

## 3. Edições especiais (o eixo de desempenho)

Resolvidas a partir do **contexto recente** (última sessão finalizada do atleta).
Prioridade quando mais de uma se aplica:

| Prioridade | Edição                   | Gatilho                                         | Fonte                         |
| ---------- | ------------------------ | ----------------------------------------------- | ----------------------------- |
| 1          | 🏆 **MVP da Noite**      | maior nota da última sessão                     | rating por sessão             |
| 2          | 🎯 **Maestro**           | top assists da sessão                           | `calculateSessionRecognition` |
| 2          | 🧱 **Muralha**           | top defesas/🌟 da sessão                        | `calculateSessionRecognition` |
| 3          | 🟣 **Em Alta (In-Form)** | sequência de notas altas (ex.: últimas 3 ≥ 7.0) | `ultimasPartidas`             |
| —          | ⚪ **Base**              | nenhuma acima                                   | —                             |

- Maestro e Muralha são **a glória do levantador/líbero** — fecham a tese do projeto.
- A edição é **efêmera/viva**: recalculada a cada leitura; some quando o desempenho
  esfria (a não ser que, no v2, a gente persista "edições conquistadas").

---

## 4. Química de quadra

`buildPartnershipMatrix(sessions, teams, { lookback: 6, decay: 0.8 })`
([`src/logic/partnershipHistory.ts`](src/logic/partnershipHistory.ts)) devolve um
índice ponderado por recência de "jogou junto". Química do atleta = **top 3
parceiros** por peso.

```ts
function playerChemistry(playerId, players, sessions, teams, topN = 3) {
  const m = buildPartnershipMatrix(sessions, teams);
  // chaves no formato "idA|idB" (ordenadas); filtrar as que contêm playerId,
  // ordenar por peso desc, mapear para o parceiro, pegar topN.
}
```

> v1: química = "mais jogou com". v2 pode evoluir para "mais **venceu** com"
> (precisa cruzar com `games`/resultados).

---

## 5. Etapas de implementação

Ordem segura — cada etapa fecha com `tsc` + testes; no fim, build + validação
visual (desktop e mobile). Lógica pura primeiro; UI depois.

### Etapa 1 — Motor `src/logic/futCards.ts` (lógica + testes)

- `futConstants` (curva, limiares de tier, limiares de versatilidade/In-Form) —
  preferir um bloco em [`balancingConstants.ts`](src/logic/balancingConstants.ts)
  ou um arquivo próprio, para tudo ficar afinável.
- `generateFutStats(player): FutStats` → `{ ovr, atq, blo, saq, lev, def, fis,
tier, versatility, hand }`.
- **Arquivo de teste** `src/logic/futCards.test.ts` (registrar no `test:unit` do
  `package.json`): limites 0–99 (sem overflow), tiers por faixa, versatilidade
  1–5, curva nos pontos-chave.

### Etapa 2 — Contexto: edição especial + química

- `resolvePlayerEdition(player, ctx): VutEdition` — usa `calculateSessionRecognition`
  da última sessão + `autoFormFromHistory`/últimas notas para In-Form.
- `playerChemistry(...)` — top-N via `buildPartnershipMatrix`.
- `buildVutCard(player, ctx): VutCard` — junta `generateFutStats` + edição +
  química + badge de forma num objeto único que o componente consome.
- Testes: prioridade de edição (MVP > Maestro/Muralha > In-Form > Base) e
  química top-N com desempate.

### Etapa 3 — Componente `src/components/player/FutCard.tsx`

- **No tema do app** (tokens `base-200/300`, `accent`, `warning` etc.) — **não**
  cores cruas (`amber-700`, `gray-300`).
- Frente: OVR, sigla da posição, 6 stats, mão R/L, ⭐ versatilidade, badge verde
  (nota), selo da edição, links de química (mini-avatares/iniciais).
- Avatar via `player.avatarUrl` com fallback de silhueta (reusar padrão do
  [`AvatarUpload`](src/components/player/AvatarUpload.tsx)).
- Forma da carta: `clip-path`/máscara — validar no mobile.

### Etapa 4 — Modal "Ver carta" + exportar imagem

- Botão "Ver carta" na lista/perfil → modal com `<FutCard />`.
- Export: **`html-to-image`** (`toPng`) → `navigator.share({ files: [...] })` no
  mobile; **download** (anchor + object URL) no desktop, reaproveitando o padrão de
  [`share.ts`](src/logic/share.ts) (`navigator.share` com fallback).
- Aguardar `document.fonts.ready` e usar `pixelRatio` ≥ 2 para nitidez.

### Etapa 5 — Momento de revelação

- No `handleFinishSession` ([`App.tsx`](src/App.tsx)): após a sessão, computar quem
  ganhou edição especial **nesta** sessão e abrir um reveal ("Você desbloqueou:
  Maestro 🎯") com a carta. É o "abrir pacote".
- Idempotência: disparar **uma vez** por encerramento; não repetir em re-render.

---

## 6. Dependência nova

- **`html-to-image`** (devida no `package.json`). Pequena, fiel a cartas Tailwind
  com gradiente/foto. Decisão já tomada (alternativa SVG+canvas descartada por
  custo). Instalar e fixar versão.

---

## 7. Pontos críticos (ARMADILHAS)

1. **Overflow do OVR (×9.9).** `calculatePositionOverall`/`calculateGeneralOverall`
   **já retornam 0–100**. Multiplicar por 9.9 gera "OVR 673". → só `min(99, ovr)`.
2. **Overall errado.** Usar `calculatePositionOverall` (com peso de posição), não
   `calculateGeneralOverall` (média chapada). Senão o número diverge do app e o
   facilitador é penalizado.
3. **Escala legada de `ultimasPartidas`.** Valores antigos foram gravados noutra
   escala (−5..+5/0–5). O badge verde e o In-Form leem como nota 0–10 → podem
   exibir valor errado para quem ainda não encerrou sessão com o código novo.
   → Guardar/exibir o badge só quando houver nota "real"; aceitar como transitório
   (some conforme novas sessões preenchem o histórico). Documentar no PR.
4. **Tier × Edição.** Dois eixos. Não derivar "especial" de OVR alto.
5. **Distribuição da curva.** Monitorar: Ouro não pode ser impossível nem trivial.
   A curva é tunável; revisar com dados reais.
6. **CORS no export do avatar.** `avatarUrl` é imagem remota (Supabase Storage).
   `html-to-image` **suja o canvas** se a imagem não for CORS-safe → avatar sai em
   branco. → `crossOrigin="anonymous"`, garantir CORS no bucket, ou pré-carregar o
   avatar como dataURL (o `avatarStorageService` já tem lógica de canvas). Fallback
   de silhueta se falhar.
7. **`navigator.share({files})` nem sempre existe.** Feature-detect com
   `navigator.canShare?.({ files })`; fallback para download no desktop.
8. **Fontes/gradientes no capture.** Esperar `document.fonts.ready` antes do
   `toPng`; fundo **não** transparente; `pixelRatio` ≥ 2.
9. **Performance.** Não computar `buildVutCard` para o elenco inteiro a cada
   render. Computar **sob demanda** (ao abrir a carta) e **memoizar**. A matriz de
   química (`buildPartnershipMatrix`) percorre sessões×times — construir **uma vez**
   e reusar, nunca por carta.
10. **Reveal idempotente.** Só no evento de encerramento; evitar loop de re-render.
11. **Aditivo, não destrutivo.** A carta é uma **nova** representação (modal/coleção
    - export). **Não** substituir a lista de gestão detalhada.
12. **Sem persistência no v1.** Cartas e edições são derivadas. Persistir "edições
    conquistadas" (histórico/álbum) é escopo de v2.

---

## 8. Decisões já tomadas

- ✅ Escopo **VUT v1**: carta viva + 2 grupos de especiais (In-Form + reconhecimento)
  - reveal + export.
- ✅ **Química de quadra** entra no **v1** (via `partnershipHistory`).
- ✅ Export via **`html-to-image`**.
- ✅ **Curva** de calibração (não linear) para os 6 macro.
- ✅ Carta é **aditiva** (modal + export), no **tema do app**.

---

## 9. Fora de escopo (v2+)

- Verso analítico da carta (radar + curva de notas + vitrine de troféus).
- Química "venceu junto" (cruzando resultados).
- Evoluções/objetivos ("faça 10 aces" → upgrada a carta).
- Revelação do time gerado como **elenco** (squad) de cartas.
- Temporadas (carta-base permanente; especiais sazonais).
- Álbum/coleção e persistência de edições conquistadas.

---

## 10. Verificação por etapa

- **1–2 (lógica):** `tsc --noEmit` + `npm run test:unit` (novos testes de
  `futCards`/contexto).
- **3 (componente):** typecheck + render visual no preview (desktop e mobile).
- **4 (export):** gerar PNG, validar avatar (CORS) e o share/download.
- **5 (reveal):** encerrar uma sessão de teste e ver o reveal disparar uma vez.
- **Final:** `npm run build` + validação visual ponta a ponta.

---

## 11. Nota de organização

Dado o tamanho, recomenda-se uma **branch própria** (`feat/vut-cards`) e PR
separado — mas isso fica a critério: se preferir, segue na branch atual do PR #10.
