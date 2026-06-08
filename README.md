# Panelinha Team Balancer

## O que é
App para balancear times de vôlei misto e registrar partidas semanais com uma temática inspirada em RPGs clássicos.

## Funcionalidades
- **Recrutamento**: Cadastro de jogadores com atributos detalhados (Saque, Ataque, Defesa, etc.).
- **Atributos de Elite**: Cálculos de Overall baseados em pesos de posição (Ponteiro, Levantador, etc.).
- **Balanceamento Inteligente**: Algoritmo que busca igualar Overall médio, distribuição de gêneros e fundamentos específicos.
- **Modo Jogo Livre**:
  - Sistema de rotação "Ganhou Fica".
  - Regra de "3 partidas e sai" (limite de permanência em quadra).
  - Placar ao vivo com registro de proezas individuais.
- **Crônicas do Confronto**: Histórico de pontos detalhado e ranking de pontuadores (MVP).
- **Persistência**: Dados salvos localmente para não perder o progresso entre recarregamentos.

## Regras de Jogo (Configuráveis)
- **Pontuação**: 12, 15, 21 ou 25 pontos.
- **Desempate**: "3 Direto" (cap +2) ou "Vai a 2".
- **Rotação**: Limite de partidas consecutivas para garantir que todos joguem.

## Como rodar
1. `npm install`
2. `npm run dev`

## Estrutura Técnica
- **React + Vite + TypeScript**
- **Tailwind CSS**: Estilização temática dark/RPG.
- **Motion (Framer Motion)**: Animações e transições fluidas.
- **Lucide React**: Iconografia.
