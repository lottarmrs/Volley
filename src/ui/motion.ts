/**
 * Chegada confiante: desaceleração exponencial, sem mola.
 *
 * O vocabulário de movimento do app é o de uma quadra técnica — objetos param
 * onde devem parar. Mola e elástico devolvem o elemento, o que lê como brinquedo
 * e, no placar, como incerteza sobre o ponto que acabou de entrar.
 */
export const EASE_ARRIVE = [0.16, 1, 0.3, 1] as const;

/** Saída sempre mais rápida que entrada: sair não é um evento. */
export const DURATION = {
  feedback: 0.15,
  state: 0.25,
  overlay: 0.4,
  focal: 0.6,
} as const;
