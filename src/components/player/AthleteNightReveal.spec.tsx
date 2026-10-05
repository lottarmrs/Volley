import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AthleteNightReveal } from './AthleteNightReveal';
import type { AthleteNight } from '@app/athleteNight';
import { buildVutCard } from '@logic/futCards';
import type { Player } from '@shared/types';

const atleta = {
  id: 'ana',
  nome: 'Ana Souza',
  apelido: 'Ana',
  posicaoPrincipal: 'ponteiro',
  maoDominante: 'direita',
  atributos: {},
  formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
  status: { lesionado: false, limitacaoFisica: null },
} as unknown as Player;

const card = buildVutCard(atleta, {
  sessions: [],
  teams: [],
  games: [],
  pointEvents: [],
  players: [atleta],
  sessionReports: [],
});

const conquista = { ...card.achievements[0], unlocked: true, name: 'Primeira Vitória' };
const perto = {
  ...card.achievements[1],
  unlocked: false,
  name: 'Cria da Quadra',
  current: 46,
  target: 50,
};

const night: AthleteNight = {
  sessionId: 's1',
  card,
  specialEdition: false,
  newAchievements: [conquista],
  nearAchievements: [perto],
  tierUp: false,
  games: 4,
  wins: 3,
  points: 12,
  rating: 7.4,
};

function abrir(overrides: Partial<Parameters<typeof AthleteNightReveal>[0]> = {}) {
  const props = {
    night,
    communityName: 'Vôlei de Terça',
    sessionDate: '2026-10-04',
    onOpened: vi.fn(),
    onClose: vi.fn(),
    onViewCard: vi.fn(),
    ...overrides,
  };
  const view = render(<AthleteNightReveal {...props} />);
  return { ...props, ...view };
}

const clicar = (nome: RegExp) => fireEvent.click(screen.getByRole('button', { name: nome }));

describe('AthleteNightReveal', () => {
  it('comeca com o pacote fechado e o nome da comunidade', () => {
    abrir();
    expect(screen.getByRole('dialog', { name: 'Sua noite' })).toBeDefined();
    expect(screen.getByText(/Sua noite/)).toBeDefined();
    expect(screen.getByText(/Vôlei de Terça/)).toBeDefined();
    expect(screen.getByRole('button', { name: /abrir/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /próximo/i })).toBeNull();
  });

  it('abrir o pacote avisa uma vez e mostra a noite capitulo a capitulo', () => {
    const props = abrir();
    clicar(/abrir/i);
    expect(props.onOpened).toHaveBeenCalledTimes(1);
    clicar(/próximo/i);
    expect(screen.getByText('12')).toBeDefined();
    expect(screen.getByText('7.4')).toBeDefined();
    clicar(/próximo/i);
    expect(screen.getByText('Primeira Vitória')).toBeDefined();
    clicar(/próximo/i);
    expect(screen.getByText('Cria da Quadra')).toBeDefined();
    expect(screen.getByText(/faltam 4/i)).toBeDefined();
    clicar(/voltar/i);
    expect(screen.getByText('Primeira Vitória')).toBeDefined();
    expect(props.onOpened).toHaveBeenCalledTimes(1);
  });

  it('fechar sem abrir nao conta como vista', () => {
    const props = abrir();
    clicar(/fechar/i);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onOpened).not.toHaveBeenCalled();
  });

  it('esc fecha', () => {
    const props = abrir();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onOpened).not.toHaveBeenCalled();
  });

  it('ver minha carta chama a acao', () => {
    const props = abrir();
    clicar(/abrir/i);
    clicar(/pular/i);
    clicar(/ver minha carta/i);
    expect(props.onViewCard).toHaveBeenCalledTimes(1);
  });

  it('tem compartilhar', () => {
    abrir();
    clicar(/abrir/i);
    clicar(/pular/i);
    expect(screen.getByRole('button', { name: /compartilhar/i })).toBeDefined();
  });

  it('pular leva ao fechamento', () => {
    abrir();
    clicar(/abrir/i);
    clicar(/pular/i);
    expect(screen.getByRole('button', { name: /ver minha carta/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /próximo/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /pular/i })).toBeNull();
  });

  it('noite so de numeros pula conquistas e quase la', () => {
    abrir({ night: { ...night, newAchievements: [], nearAchievements: [] } });
    clicar(/abrir/i);
    clicar(/próximo/i);
    expect(screen.getByText('12')).toBeDefined();
    clicar(/próximo/i);
    expect(screen.getByRole('button', { name: /compartilhar/i })).toBeDefined();
    expect(screen.queryByText('Primeira Vitória')).toBeNull();
  });

  it('nota sem valor vira traco e edicao especial aparece na carta', () => {
    abrir({
      night: {
        ...night,
        rating: null,
        specialEdition: true,
        card: { ...card, edition: { kind: 'mvp', label: 'MVP da Noite', emoji: '🏆' } },
      },
    });
    clicar(/abrir/i);
    expect(screen.getByText(/MVP da Noite/)).toBeDefined();
    clicar(/próximo/i);
    expect(screen.getByText('—')).toBeDefined();
  });

  it('guarda a noite recebida mesmo se a prop mudar depois de abrir', () => {
    const { rerender, onOpened, onClose, onViewCard } = abrir();
    clicar(/abrir/i);
    rerender(
      <AthleteNightReveal
        night={{ ...night, points: 99, newAchievements: [] }}
        communityName="Vôlei de Terça"
        sessionDate="2026-10-04"
        onOpened={onOpened}
        onClose={onClose}
        onViewCard={onViewCard}
      />,
    );
    clicar(/próximo/i);
    expect(screen.getByText('12')).toBeDefined();
    clicar(/próximo/i);
    expect(screen.getByText('Primeira Vitória')).toBeDefined();
  });
});
