import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { MyCardDeck } from './MyCardDeck';
import { shareCardImage } from '@logic/shareCardImage';
import type { MyCard } from '@app/myCards';
import { CARTAS_CARREGANDO, CARTAS_TRES, CARTAS_UMA } from '@/preview/minhacartaFixtures';

vi.mock('@logic/shareCardImage', () => ({ shareCardImage: vi.fn(() => Promise.resolve()) }));

function montar(
  cards: MyCard[],
  selectedCommunityId: string | null,
  onSelect = vi.fn(),
  onOpenProfile = vi.fn(),
) {
  const view = render(
    <MemoryRouter>
      <MyCardDeck
        cards={cards}
        selectedCommunityId={selectedCommunityId}
        onSelect={onSelect}
        onOpenProfile={onOpenProfile}
      />
    </MemoryRouter>,
  );
  const trocar = (id: string | null, novas = cards) =>
    view.rerender(
      <MemoryRouter>
        <MyCardDeck
          cards={novas}
          selectedCommunityId={id}
          onSelect={onSelect}
          onOpenProfile={onOpenProfile}
        />
      </MemoryRouter>,
    );
  return { ...view, onSelect, onOpenProfile, trocar };
}

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
      screen.getByRole('button', { name: 'Carta anterior' }).getAttribute('aria-disabled'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Carta anterior' }));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima carta' }));
    expect(onSelect).toHaveBeenCalledWith('quinta');

    trocar('parque');
    expect(
      screen.getByRole('button', { name: 'Próxima carta' }).getAttribute('aria-disabled'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Próxima carta' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
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
    expect(
      (screen.getByRole('button', { name: 'Compartilhar' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('cartas de lado ficam fora da leitura, a troca é anunciada', () => {
    const { trocar } = montar(CARTAS_TRES, 'terca');
    const regiao = screen.getByRole('region', { name: 'Minha carta' });
    const lado = within(regiao).getByRole('group', { name: 'Quinta na Areia' });
    expect(lado.querySelector('[aria-hidden="true"]')).toBeTruthy();
    trocar('quinta');
    const aviso = regiao.querySelector('[aria-live="polite"]');
    expect(aviso?.textContent).toContain('Quinta na Areia');
    expect(aviso?.textContent).toContain('de 22 conquistas');
  });

  it('a página do leque não traz álbum nem coleção', () => {
    montar(CARTAS_TRES, 'quinta');
    expect(screen.queryByRole('region', { name: 'Álbum de conquistas' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Coleção de edições' })).toBeNull();
  });

  it('Ver perfil de atleta abre o perfil da carta da frente', () => {
    const { onOpenProfile } = montar(CARTAS_TRES, 'quinta');
    fireEvent.click(screen.getByRole('button', { name: 'Ver perfil de atleta' }));
    expect(onOpenProfile).toHaveBeenCalledWith('quinta');
  });

  it('tocar na carta da frente também abre o perfil', () => {
    const { onOpenProfile } = montar(CARTAS_TRES, 'quinta');
    const regiao = screen.getByRole('region', { name: 'Minha carta' });
    fireEvent.click(within(regiao).getByRole('group', { name: 'Quinta na Areia' }));
    expect(onOpenProfile).toHaveBeenCalledWith('quinta');
  });

  it('tocar numa carta de lado só a traz para a frente', () => {
    const { onOpenProfile, onSelect } = montar(CARTAS_TRES, 'quinta');
    const regiao = screen.getByRole('region', { name: 'Minha carta' });
    fireEvent.click(within(regiao).getByRole('group', { name: 'Vôlei de Terça' }));
    expect(onOpenProfile).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('terca');
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

  it('numeros que nao chegaram: a carta diz que nao deu e tenta de novo, sem "?" e sem numero', () => {
    const comErro = CARTAS_CARREGANDO.map((c) =>
      c.community.id === 'carregando' ? { ...c, loading: false, erro: true } : c,
    );
    const onRetry = vi.fn();
    render(
      <MemoryRouter>
        <MyCardDeck
          cards={comErro}
          selectedCommunityId="carregando"
          onSelect={vi.fn()}
          onOpenProfile={vi.fn()}
          onRetry={onRetry}
        />
      </MemoryRouter>,
    );
    const regiao = screen.getByRole('region', { name: 'Minha carta' });
    const carta = within(regiao).getByRole('group', { name: 'Vôlei da Firma' });
    expect(carta.getAttribute('aria-busy')).toBeNull();
    expect(carta.textContent).not.toMatch(/\d|\?/);
    expect(screen.getByText('Não deu para carregar os números')).toBeTruthy();
    expect(screen.queryByText('montando a carta…')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Compartilhar' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalledWith('carregando');
  });

  it('carregando o baralho: esqueleto do tamanho da carta, ocupado, sem texto de vazio nem numero', () => {
    render(
      <MemoryRouter>
        <MyCardDeck
          cards={[]}
          selectedCommunityId={null}
          onSelect={vi.fn()}
          onOpenProfile={vi.fn()}
          carregando
        />
      </MemoryRouter>,
    );
    const regiao = screen.getByRole('region', { name: 'Minha carta' });
    expect(regiao.getAttribute('aria-busy')).toBe('true');
    expect(regiao.textContent).not.toMatch(/\d/);
    expect(screen.queryByText(/Sua carta nasce/)).toBeNull();
  });

  it('membro sem ficha no elenco: a carta nasce quando a ficha estiver no elenco', () => {
    render(
      <MemoryRouter>
        <MyCardDeck
          cards={[]}
          selectedCommunityId={null}
          onSelect={vi.fn()}
          onOpenProfile={vi.fn()}
          naComunidade
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByText('Sua carta nasce quando sua ficha estiver no elenco de uma comunidade'),
    ).toBeTruthy();
    expect(screen.queryByText('Sua carta nasce quando você entra numa comunidade')).toBeNull();
    expect(screen.getByRole('link', { name: /comunidades/i }).getAttribute('href')).toBe(
      '/comunidades',
    );
  });
});
