import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SessionWizardProgress } from './SessionWizardProgress';

const steps = [
  { id: 0, label: 'Detalhes' },
  { id: 1, label: 'Atletas' },
  { id: 2, label: 'Modo de Jogo' },
];

describe('SessionWizardProgress', () => {
  it('renderiza o label de todos os passos', () => {
    render(<SessionWizardProgress currentStep={1} steps={steps} />);
    for (const step of steps) {
      expect(screen.getByText(step.label)).toBeDefined();
    }
  });

  it('destaca o passo atual e marca os anteriores como concluídos', () => {
    render(<SessionWizardProgress currentStep={1} steps={steps} />);
    expect(screen.getByText('Atletas').className).toContain('step-accent');
    expect(screen.getByText('Detalhes').className).toContain('step-primary');
    expect(screen.getByText('Modo de Jogo').className).not.toContain('step-accent');
    expect(screen.getByText('Modo de Jogo').className).not.toContain('step-primary');
  });
});
