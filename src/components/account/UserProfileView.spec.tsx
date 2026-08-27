import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router';
import { UserProfileView } from './UserProfileView';
import type { Player, Community, UserProfile } from '../../types';

const mockPlayer: Player = {
  id: 'p1',
  nome: 'Matheus Silva',
  apelido: 'Matheus',
  numeroCamisa: 11,
  genero: 'M',
  ativo: true,
  posicaoPrincipal: 'ponteiro',
  posicoesSecundarias: ['levantador'],
  maoDominante: 'direita',
  alturaCm: 188,
  atributos: {
    saque: 85,
    recepcao: 78,
    levantamento: 80,
    ataque: 88,
    defesa: 82,
    bloqueio: 80,
    velocidade: 75,
    resistencia: 80,
    leituraDeJogo: 82,
    regularidade: 80,
    controleEmocional: 85,
  },
  perfil: {
    nivel: 12,
    classe: 'Ouro',
    arquetipo: 'Atacante de Força',
    especialidade: 'Ataque de Ponta',
    fraqueza: 'Passe Curto',
  },
  formaAtual: {
    valor: 90,
    observacao: 'Em ótima fase',
    ultimasPartidas: [1, 1, 1, 1],
  },
  status: {
    lesionado: false,
    limitacaoFisica: null,
    presencaFrequente: true,
  },
  metadata: {
    criadoEm: '2026-01-01T00:00:00.000Z',
    atualizadoEm: '2026-08-01T00:00:00.000Z',
  },
};

const mockProfile: UserProfile = {
  id: 'u1',
  name: 'Matheus Silva',
  email: 'matheus@example.com',
  role: 'user',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const mockCommunities: Community[] = [
  {
    id: 'c1',
    name: 'Panelinha de Sexta',
    joinCode: 'PAN123',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
];

describe('UserProfileView', () => {
  it('renders hero athlete card with jersey number, position sigla, and overall rating', () => {
    render(
      <BrowserRouter>
        <UserProfileView
          user={{ email: 'matheus@example.com' }}
          profile={mockProfile}
          player={mockPlayer}
          communities={mockCommunities}
          onExportBackup={vi.fn()}
          onImportBackup={vi.fn()}
          onRestoreDemoPlayers={vi.fn()}
        />
      </BrowserRouter>,
    );

    expect(screen.getByText('Matheus')).toBeTruthy();
    expect(screen.getByText('#11')).toBeTruthy();
    expect(screen.getByText('PON')).toBeTruthy();
    expect(screen.getByText('Atacante de Força')).toBeTruthy();
    expect(screen.getByText('Panelinha de Sexta')).toBeTruthy();
  });

  it('switches between Performance tab and Settings tab', () => {
    render(
      <BrowserRouter>
        <UserProfileView
          user={{ email: 'matheus@example.com' }}
          profile={mockProfile}
          player={mockPlayer}
          communities={mockCommunities}
          onExportBackup={vi.fn()}
          onImportBackup={vi.fn()}
          onRestoreDemoPlayers={vi.fn()}
        />
      </BrowserRouter>,
    );

    const settingsTabBtn = screen.getByRole('button', { name: /Configurações & Dados/i });
    fireEvent.click(settingsTabBtn);

    expect(screen.getByText(/Dados & Backup/i)).toBeTruthy();
  });
});
