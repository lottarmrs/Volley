/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Position, PositionWeights } from './types';
import { players as INITIAL_PLAYERS } from './data/players';

export const POSITION_WEIGHTS: Record<Position, PositionWeights> = {
  levantador: {
    levantamento: 0.35,
    leituraDeJogo: 0.20,
    regularidade: 0.15,
    controleEmocional: 0.10,
    defesa: 0.08,
    saque: 0.05,
    velocidade: 0.05,
    altura: 0.02
  },
  oposto: {
    ataque: 0.28,
    bloqueio: 0.13,
    saque: 0.14,
    altura: 0.10,
    leituraDeJogo: 0.10,
    regularidade: 0.10,
    controleEmocional: 0.10,
    defesa: 0.05
  },
  ponteiro: {
    ataque: 0.20,
    recepcao: 0.22,
    defesa: 0.15,
    saque: 0.11,
    altura: 0.06,
    velocidade: 0.09,
    leituraDeJogo: 0.09,
    regularidade: 0.08
  },
  central: {
    bloqueio: 0.27,
    ataque: 0.18,
    altura: 0.15,
    velocidade: 0.10,
    leituraDeJogo: 0.10,
    regularidade: 0.10,
    controleEmocional: 0.10
  },
  libero: {
    recepcao: 0.35,
    defesa: 0.30,
    velocidade: 0.15,
    leituraDeJogo: 0.10,
    regularidade: 0.10,
    altura: 0
  },
  'all-rounder': {
    saque: 0.10,
    recepcao: 0.15,
    levantamento: 0.10,
    ataque: 0.15,
    bloqueio: 0.10,
    defesa: 0.10,
    velocidade: 0.10,
    leituraDeJogo: 0.10,
    regularidade: 0.05,
    altura: 0.05
  }
};

export { INITIAL_PLAYERS };

export const ATTRIBUTE_TOOLTIPS: Record<string, string> = {
  saque: 'Força, precisão e regularidade do serviço.',
  recepcao: 'Qualidade do passe após o saque adversário.',
  levantamento: 'Precisão e inteligência na distribuição das jogadas.',
  ataque: 'Poder de finalização, técnica e variação de golpes.',
  bloqueio: 'Posicionamento e eficácia em interceptar ataques.',
  defesa: 'Reflexo e técnica para recuperar bolas atacadas.',
  velocidade: 'Agilidade de deslocamento e rapidez de reação.',
  resistencia: 'Capacidade de manter o nível durante partidas longas.',
  leituraDeJogo: 'Visão tática e antecipação de jogadas.',
  regularidade: 'Consistência técnica e baixo índice de erros.',
  controleEmocional: 'Estabilidade mental em pontos decisivos.'
};

