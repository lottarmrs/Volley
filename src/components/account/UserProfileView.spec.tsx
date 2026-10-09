import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router';
import { UserProfileView } from './UserProfileView';
import type { Player, UserProfile } from '../../types';
import { CARTAS_TRES } from '@/preview/minhacartaFixtures';

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

describe('UserProfileView', () => {
  it('mostra a mao dominante como Destro ou Canhoto, sem o valor cru', () => {
    const { rerender } = render(
      <BrowserRouter>
        <UserProfileView
          user={{ email: 'matheus@example.com' }}
          profile={mockProfile}
          player={mockPlayer}
        />
      </BrowserRouter>,
    );
    expect(screen.getByText(/destro/i)).toBeTruthy();
    expect(screen.queryByText(/Mao /)).toBeNull();
    rerender(
      <BrowserRouter>
        <UserProfileView
          user={{ email: 'matheus@example.com' }}
          profile={mockProfile}
          player={{ ...mockPlayer, maoDominante: 'esquerda' }}
        />
      </BrowserRouter>,
    );
    expect(screen.getByText(/canhoto/i)).toBeTruthy();
    rerender(
      <BrowserRouter>
        <UserProfileView
          user={{ email: 'matheus@example.com' }}
          profile={mockProfile}
          player={{ ...mockPlayer, maoDominante: 'ambos' as never }}
        />
      </BrowserRouter>,
    );
    expect(screen.queryByText(/destro|canhoto|ambos/i)).toBeNull();
  });

  it('renders hero athlete card with jersey number, position sigla, and overall rating', () => {
    render(
      <BrowserRouter>
        <UserProfileView
          user={{ email: 'matheus@example.com' }}
          profile={mockProfile}
          player={mockPlayer}
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
  });

  it('switches between Performance tab and Settings tab', () => {
    render(
      <BrowserRouter>
        <UserProfileView
          user={{ email: 'matheus@example.com' }}
          profile={mockProfile}
          player={mockPlayer}
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
  it('a aba chama Minha carta e nenhum numero inventado aparece', () => {
    render(
      <BrowserRouter>
        <UserProfileView
          user={{ email: 'matheus@example.com' }}
          profile={mockProfile}
          player={mockPlayer}
          myCards={{
            cards: [],
            selectedCommunityId: null,
            onSelect: vi.fn(),
            view: 'carta',
            onOpenProfile: vi.fn(),
            onShowCard: vi.fn(),
          }}
          onExportBackup={vi.fn()}
          onImportBackup={vi.fn()}
          onRestoreDemoPlayers={vi.fn()}
        />
      </BrowserRouter>,
    );

    expect(screen.getByRole('button', { name: /Minha carta/i })).toBeTruthy();
    expect(screen.getByRole('region', { name: /Minha carta/i })).toBeTruthy();
    for (const texto of [
      'Sacador de Elite',
      'Rei da Quadra',
      'Paredão Insuperável',
      /Minhas Comunidades/i,
      'Partidas',
      'Aproveitamento',
      'Sequência',
      'Rating OVR',
      /Atributos de Vôlei/i,
      /Conquistas & Medalhas/i,
      /OVR/,
    ]) {
      expect(screen.queryByText(texto)).toBeNull();
    }
  });

  it('com cartas reais, nada inventado aparece ao lado delas', () => {
    render(
      <BrowserRouter>
        <UserProfileView
          user={{ email: 'matheus@example.com' }}
          profile={mockProfile}
          player={mockPlayer}
          myCards={{
            cards: CARTAS_TRES,
            selectedCommunityId: 'terca',
            onSelect: vi.fn(),
            view: 'carta',
            onOpenProfile: vi.fn(),
            onShowCard: vi.fn(),
          }}
        />
      </BrowserRouter>,
    );

    expect(screen.getByRole('region', { name: 'Minha carta' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Vôlei de Terça' })).toBeTruthy();
    for (const texto of [
      'Sacador de Elite',
      'Rei da Quadra',
      'Paredão Insuperável',
      /Minhas Comunidades/i,
      'Rating OVR',
      'Aproveitamento',
      /Atributos de Vôlei/i,
      /Conquistas & Medalhas/i,
    ]) {
      expect(screen.queryByText(texto)).toBeNull();
    }
    expect(screen.queryByText('68%')).toBeNull();
    expect(screen.queryByText('4V')).toBeNull();
  });

  it('com conta, sem backup nem demonstracao: a aba de dados some', () => {
    render(
      <BrowserRouter>
        <UserProfileView
          user={{ email: 'matheus@example.com' }}
          profile={mockProfile}
          player={mockPlayer}
        />
      </BrowserRouter>,
    );

    expect(screen.queryByRole('button', { name: /Configurações & Dados/i })).toBeNull();
    expect(screen.queryByText(/Dados & Backup/i)).toBeNull();
    expect(screen.queryByText(/Último sync/i)).toBeNull();
    expect(screen.getByText('Matheus')).toBeTruthy();
  });
  describe('trocar entre o leque e o perfil de atleta', () => {
    const rolar = vi.fn();
    beforeEach(() => {
      rolar.mockClear();
      Element.prototype.scrollIntoView = rolar;
    });

    const tela = (view: 'carta' | 'atleta') => (
      <BrowserRouter>
        <UserProfileView
          user={{ email: 'matheus@example.com' }}
          profile={mockProfile}
          player={mockPlayer}
          myCards={{
            cards: CARTAS_TRES,
            selectedCommunityId: 'terca',
            onSelect: vi.fn(),
            view,
            onOpenProfile: vi.fn(),
            onShowCard: vi.fn(),
          }}
        />
      </BrowserRouter>
    );

    it('abrir a pagina nao rouba o foco nem rola', () => {
      render(tela('atleta'));
      expect(document.activeElement).toBe(document.body);
      expect(rolar).not.toHaveBeenCalled();
    });

    it('ir ao perfil de atleta rola ate o topo dele e leva o foco ao nome', () => {
      const { rerender } = render(tela('carta'));
      rerender(tela('atleta'));
      const titulo = screen.getByRole('heading', { level: 2, name: 'Matheus Silva' });
      expect(document.activeElement).toBe(titulo);
      expect(rolar).toHaveBeenCalledTimes(1);
      expect(rolar.mock.contexts[0]).toBe(
        screen.getByRole('region', { name: 'Perfil de atleta' }).parentElement,
      );
    });

    it('voltar a carta rola ate o leque e leva o foco ao titulo da carta', () => {
      const { rerender } = render(tela('atleta'));
      rerender(tela('carta'));
      const titulo = screen.getByRole('heading', { level: 2, name: 'Vôlei de Terça' });
      expect(document.activeElement).toBe(titulo);
      expect(rolar).toHaveBeenCalledTimes(1);
    });
  });
});
