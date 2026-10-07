import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { MyCardDeck } from './MyCardDeck';
import { shareCardImage } from '@logic/shareCardImage';
import type { MyCard } from '@app/myCards';
import {
  CARTAS_CARREGANDO,
  CARTAS_SEM_PELADA,
  CARTAS_TRES,
  CARTAS_UMA,
} from '@/preview/minhacartaFixtures';

vi.mock('@logic/shareCardImage', () => ({ shareCardImage: vi.fn(() => Promise.resolve()) }));

function montar(cards: MyCard[], selectedCommunityId: string | null, onSelect = vi.fn()) {
  const view = render(
    <MemoryRouter>
      <MyCardDeck cards={cards} selectedCommunityId={selectedCommunityId} onSelect={onSelect} />
    </MemoryRouter>,
  );
  const trocar = (id: string | null, novas = cards) =>
    view.rerender(
      <MemoryRouter>
        <MyCardDeck cards={novas} selectedCommunityId={id} onSelect={onSelect} />
      </MemoryRouter>,
    );
  return { ...view, onSelect, trocar };
}

const album = () => screen.getByRole('region', { name: 'Álbum de conquistas' });
const colecao = () => screen.getByRole('region', { name: 'Coleção de edições' });

describe('MyCardDeck', () => {
  beforeEach(() => vi.mocked(shareCardImage).mockClear());

  it('mostra a carta da comunidade escolhida, com o nome dela em destaque', () => {
    montar(CARTAS_TRES, 'quinta');
    const regiao = screen.getByRole('region', { name: 'Minha carta' });
    expect(within(regiao).getByRole('heading', { level: 2 }).textContent).toBe('Quinta na Areia');
    for (const carta of CARTAS_TRES) {
      expect(within(regiao).getByRole('group', { name: carta.community.name })).toBeTruthy();
    }
    expect(screen.getByRole('link', { name: 'Abrir comunidade' }).getAttribute('href')).toBe(
      '/comunidades/quinta',
    );
  });

  it('sem escolha, a carta da frente é a primeira', () => {
    montar(CARTAS_TRES, null);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Vôlei de Terça');
  });

  it('as setas pedem a carta vizinha e travam nas pontas', () => {
    const { onSelect, trocar } = montar(CARTAS_TRES, 'terca');
    expect(
      (screen.getByRole('button', { name: 'Carta anterior' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Próxima carta' }));
    expect(onSelect).toHaveBeenCalledWith('quinta');

    trocar('parque');
    expect(
      (screen.getByRole('button', { name: 'Próxima carta' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Carta anterior' }));
    expect(onSelect).toHaveBeenLastCalledWith('quinta');
  });

  it('as setas do teclado também giram o baralho', () => {
    const { onSelect } = montar(CARTAS_TRES, 'quinta');
    const regiao = screen.getByRole('region', { name: 'Minha carta' });
    fireEvent.keyDown(regiao, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenLastCalledWith('parque');
    fireEvent.keyDown(regiao, { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenLastCalledWith('terca');
  });

  it('álbum e coleção são os da carta em destaque', () => {
    const { trocar } = montar(CARTAS_TRES, 'terca');
    const terca = CARTAS_TRES[0];
    const total =
      terca.achievements.unlocked.length +
      terca.achievements.near.length +
      terca.achievements.locked.length;
    expect(
      within(album()).getByText(`${terca.achievements.unlocked.length} de ${total}`),
    ).toBeTruthy();
    expect(within(colecao()).getAllByRole('button')).toHaveLength(terca.editions.length);

    trocar('quinta');
    const quinta = CARTAS_TRES[1];
    expect(
      within(album()).getByText(`${quinta.achievements.unlocked.length} de ${total}`),
    ).toBeTruthy();
    expect(within(colecao()).getAllByRole('button')).toHaveLength(1);
    expect(within(colecao()).getByRole('button', { name: /Muralha/ })).toBeTruthy();
  });

  it('tocar num selo bloqueado mostra a regra dele', () => {
    montar(CARTAS_TRES, 'terca');
    const bloqueada = CARTAS_TRES[0].achievements.locked[0];
    fireEvent.click(within(album()).getByRole('button', { name: new RegExp(bloqueada.name) }));
    expect(within(album()).getByText(bloqueada.description)).toBeTruthy();
  });

  it('tocar numa edição abre a carta daquela noite', () => {
    montar(CARTAS_TRES, 'quinta');
    fireEvent.click(within(colecao()).getByRole('button', { name: /Muralha/ }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText(/17\.09\.2026/)).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sem comunidade, a carta ainda vai nascer', () => {
    montar([], null);
    expect(screen.getByText('Sua carta nasce quando você entra numa comunidade')).toBeTruthy();
    expect(screen.getByRole('link', { name: /comunidades/i }).getAttribute('href')).toBe(
      '/comunidades',
    );
  });

  it('carta carregando vira esqueleto ocupado, sem nenhum número', () => {
    montar(CARTAS_CARREGANDO, 'carregando');
    const regiao = screen.getByRole('region', { name: 'Minha carta' });
    const carta = within(regiao).getByRole('group', { name: 'Vôlei da Firma' });
    expect(carta.getAttribute('aria-busy')).toBe('true');
    expect(carta.textContent).not.toMatch(/\d/);
    expect(album().getAttribute('aria-busy')).toBe('true');
    expect(album().textContent).not.toMatch(/\d/);
    expect(
      (screen.getByRole('button', { name: 'Compartilhar' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('coleção vazia diz o que falta', () => {
    montar(CARTAS_SEM_PELADA, 'aberta');
    expect(within(colecao()).getByText(/Nenhuma edição especial ainda/)).toBeTruthy();
    expect(screen.getByText(/ainda sem pelada/i)).toBeTruthy();
  });

  it('uma comunidade só: carta sozinha, sem setas', () => {
    montar(CARTAS_UMA, 'terca');
    expect(screen.queryByRole('button', { name: 'Próxima carta' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Carta anterior' })).toBeNull();
  });

  it('Compartilhar gera a imagem da carta da frente', async () => {
    montar(CARTAS_TRES, 'terca');
    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar' }));
    expect(shareCardImage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(shareCardImage).mock.calls[0][1]).toBe('Ana Souza');
  });
});
