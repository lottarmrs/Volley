import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FutCard } from './FutCard';
import { buildVutCard } from '../../logic/futCards';
import type { Player } from '../../types';

const atleta = {
  id: 'p1',
  nome: 'Ana Souza',
  apelido: 'Ana',
  genero: 'F',
  ativo: true,
  posicaoPrincipal: 'ponteiro',
  posicoesSecundarias: [],
  maoDominante: 'direita',
  atributos: {},
  perfil: { nivel: 3, classe: '', arquetipo: '', especialidade: '', fraqueza: '' },
  formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
  status: { lesionado: false, limitacaoFisica: null },
  metadata: { criadoEm: '2026-01-01', atualizadoEm: '2026-01-01' },
} as unknown as Player;

const contexto = {
  sessions: [],
  teams: [],
  games: [],
  pointEvents: [],
  players: [atleta],
  sessionReports: [],
};

describe('FutCard', () => {
  it('sem avaliacao mostra ? no OVR, tracos nos stats e o selo', () => {
    const card = buildVutCard(atleta, { ...contexto, skillValues: new Map() });
    render(<FutCard card={card} />);
    expect(screen.getByText('?')).toBeDefined();
    expect(screen.getAllByText('—').length).toBe(6);
    expect(screen.getByText('Aguardando avaliação')).toBeDefined();
  });

  it('com avaliacao mostra os numeros', () => {
    const card = buildVutCard(atleta, {
      ...contexto,
      skillValues: new Map([['p1', { ataque: 8, saque: 8 }]]),
    });
    render(<FutCard card={card} />);
    expect(screen.queryByText('Aguardando avaliação')).toBeNull();
    expect(screen.queryByText('?')).toBeNull();
    expect(screen.getAllByText(String(card.stats.atq)).length).toBeGreaterThan(0);
  });
});
