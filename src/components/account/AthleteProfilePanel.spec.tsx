import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AthleteProfilePanel } from './AthleteProfilePanel';
import { shareCardImage } from '@logic/shareCardImage';
import type { MyCard } from '@app/myCards';
import type { Player } from '@shared/types';
import {
  ANA,
  CARTAS_CARREGANDO,
  CARTAS_SEM_AVALIACAO,
  CARTAS_SEM_PELADA,
  CARTAS_UMA,
} from '@/preview/minhacartaFixtures';

vi.mock('@logic/shareCardImage', () => ({ shareCardImage: vi.fn(() => Promise.resolve()) }));

const TERCA = CARTAS_UMA[0];
const SEM_NOTA = CARTAS_SEM_AVALIACAO.find((c) => c.community.id === 'sem-nota') as MyCard;
const SEM_PELADA = CARTAS_SEM_PELADA.find((c) => c.community.id === 'aberta') as MyCard;
const CARREGANDO = CARTAS_CARREGANDO.find((c) => c.community.id === 'carregando') as MyCard;

function comForma(carta: MyCard, value: number | null): MyCard {
  return { ...carta, card: { ...carta.card, formBadge: { value, color: 'gray' } } };
}

function montar(card: MyCard, player: Player = ANA, onShowCard = vi.fn()) {
  render(
    <MemoryRouter>
      <AthleteProfilePanel card={card} player={player} onShowCard={onShowCard} />
    </MemoryRouter>,
  );
  return { onShowCard, painel: screen.getByRole('region', { name: 'Perfil de atleta' }) };
}

const status = (rotulo: string) =>
  (screen.getByText(rotulo, { selector: 'dt' }).parentElement as HTMLElement).textContent ?? '';

const fundamento = (nome: string) =>
  within(screen.getByRole('list', { name: 'Fundamentos na escala da carta' }))
    .getByText(nome)
    .closest('li')?.textContent ?? '';

const PROIBIDOS = ['Moral', 'Preparo', 'Potencial', 'Contrato', 'Salário', 'Valor de mercado'];

describe('AthleteProfilePanel', () => {
  beforeEach(() => {
    vi.mocked(shareCardImage).mockClear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('mostra OVR, posição e nome do atleta', () => {
    const { painel } = montar(TERCA);
    expect(within(painel).getByRole('heading', { level: 2 }).textContent).toBe('Ana Souza');
    expect(within(painel).getByLabelText(`Geral ${TERCA.card.stats.ovr}`)).toBeTruthy();
    expect(within(painel).getAllByText('PON').length).toBeGreaterThan(0);
  });

  it('Fase vem da forma média e Condição da ficha', () => {
    montar(comForma(TERCA, 8.4));
    expect(status('Fase')).toMatch(/em alta/i);
    expect(status('Condição')).toMatch(/saudável/i);
    expect(status('Mão dominante')).toMatch(/destro/i);
    expect(status('Edição atual')).toMatch(/mvp/i);
  });

  it('faixas de Fase e jogador lesionado e canhoto', () => {
    const lesionada = {
      ...ANA,
      maoDominante: 'left',
      status: { lesionado: true, limitacaoFisica: null },
    } as unknown as Player;
    montar(comForma(TERCA, 5.2), lesionada);
    expect(status('Fase')).toMatch(/péssima/i);
    expect(status('Condição')).toMatch(/lesionad/i);
    expect(status('Mão dominante')).toMatch(/canhoto/i);
  });

  it('sem histórico de forma, Fase diz sem jogos', () => {
    montar(comForma(TERCA, null));
    expect(status('Fase')).toMatch(/sem jogos/i);
  });

  it('a grade usa os números de jogo da comunidade', () => {
    montar({
      ...TERCA,
      jogo: { peladas: 13, jogos: 44, vitorias: 27, aproveitamento: 61, pontos: 118 },
    });
    expect(status('Comunidade')).toContain('Vôlei de Terça');
    expect(status('Peladas')).toContain('13');
    expect(status('Vitórias')).toContain('27');
    expect(status('Vitórias')).toContain('61%');
    expect(status('Pontos')).toContain('118');
    expect(status('Última noite')).toContain('04.10.2026');
    expect(status('Altura')).toContain('—');
  });

  it('altura da ficha aparece em metros', () => {
    montar(TERCA, { ...ANA, alturaCm: 178 });
    expect(status('Altura')).toContain('1,78 m');
  });

  it('fundamentos aparecem na escala da carta', () => {
    montar(TERCA);
    expect(fundamento('Saque')).toContain('84');
    expect(fundamento('Ataque')).toContain('92');
    expect(fundamento('Levantamento')).toContain('76');
    expect(screen.queryByText('Aguardando avaliação')).toBeNull();
  });

  it('fundamento sem nota mostra traço', () => {
    montar({ ...TERCA, fundamentos: { saque: 8 } });
    expect(fundamento('Saque')).toContain('84');
    expect(fundamento('Ataque')).toContain('—');
  });

  it('sem avaliação: selo Aguardando avaliação e traços', () => {
    montar(SEM_NOTA);
    expect(screen.getAllByText('Aguardando avaliação').length).toBeGreaterThan(0);
    expect(fundamento('Saque')).toContain('—');
    expect(fundamento('Defesa')).toContain('—');
    expect(fundamento('Defesa')).not.toMatch(/\d/);
  });

  it('sem pelada: frase verdadeira e grade sem última noite', () => {
    montar(SEM_PELADA);
    expect(screen.getByText('Ainda sem pelada aqui')).toBeTruthy();
    expect(status('Última noite')).toContain('—');
  });

  it('as abas trocam o conteúdo e respondem às setas', () => {
    montar(TERCA);
    const abas = screen.getByRole('tablist');
    const nomes = within(abas)
      .getAllByRole('tab')
      .map((t) => t.getAttribute('aria-label'));
    expect(nomes).toEqual(['Visão geral', 'Fundamentos', 'Conquistas', 'Edições']);

    fireEvent.click(screen.getByRole('tab', { name: 'Conquistas' }));
    const total =
      TERCA.achievements.unlocked.length +
      TERCA.achievements.near.length +
      TERCA.achievements.locked.length;
    expect(screen.getByRole('tabpanel').textContent).toContain(
      `${TERCA.achievements.unlocked.length} de ${total}`,
    );
    expect(screen.getByRole('region', { name: 'Álbum de conquistas' })).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Conquistas' }), { key: 'ArrowRight' });
    const edicoes = screen.getByRole('tab', { name: 'Edições' });
    expect(edicoes.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(edicoes);
    expect(screen.getByRole('region', { name: 'Coleção de edições' })).toBeTruthy();

    fireEvent.keyDown(edicoes, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Visão geral' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Visão geral' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Edições' }).getAttribute('aria-selected')).toBe('true');
  });

  it('a aba escolhida rola para dentro da faixa, sem rolar ao abrir', () => {
    const rolar = vi.fn();
    Element.prototype.scrollIntoView = rolar;
    montar(TERCA);
    expect(rolar).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Visão geral' }), { key: 'End' });
    const edicoes = screen.getByRole('tab', { name: 'Edições' });
    expect(rolar).toHaveBeenCalledTimes(1);
    expect(rolar.mock.contexts[0]).toBe(edicoes);
    expect(rolar.mock.calls[0][0]).toMatchObject({ block: 'nearest', inline: 'nearest' });
  });

  it('na faixa estreita a primeira aba encurta para Geral e o nome inteiro segue acessível', () => {
    montar(TERCA);
    const geral = screen.getByRole('tab', { name: 'Visão geral' });
    expect(within(geral).getByText('Geral').className).toContain('@xl:hidden');
  });

  it('aba Fundamentos lista os onze', () => {
    montar(TERCA);
    fireEvent.click(screen.getByRole('tab', { name: 'Fundamentos' }));
    const lista = screen.getByRole('list', { name: 'Fundamentos na escala da carta' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(11);
  });

  it('Mostrar minha carta chama onShowCard', () => {
    const { onShowCard } = montar(TERCA);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar minha carta' }));
    expect(onShowCard).toHaveBeenCalledTimes(1);
  });

  it('Compartilhar gera a imagem da carta', async () => {
    montar(TERCA);
    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar' }));
    await vi.waitFor(() => expect(shareCardImage).toHaveBeenCalledTimes(1));
    expect(vi.mocked(shareCardImage).mock.calls[0][1]).toBe('Ana Souza');
  });

  it('nenhum rótulo inventado aparece, em nenhuma aba', () => {
    const { painel } = montar(TERCA);
    for (const aba of ['Visão geral', 'Fundamentos', 'Conquistas', 'Edições']) {
      fireEvent.click(screen.getByRole('tab', { name: aba }));
      for (const proibido of PROIBIDOS) expect(painel.textContent).not.toContain(proibido);
    }
  });

  it('carregando: aria-busy e nenhum número', () => {
    const { painel } = montar(CARREGANDO, { ...ANA, alturaCm: 178 });
    expect(painel.getAttribute('aria-busy')).toBe('true');
    expect(painel.textContent).not.toMatch(/\d/);
    expect(screen.getByRole('button', { name: 'Compartilhar' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('numeros que nao chegaram: diz que nao deu, tenta de novo, sem "?" e sem numero', () => {
    const onRetry = vi.fn();
    render(
      <MemoryRouter>
        <AthleteProfilePanel
          card={{ ...CARREGANDO, loading: false, erro: true }}
          player={{ ...ANA, alturaCm: 178 }}
          onShowCard={vi.fn()}
          onRetry={onRetry}
        />
      </MemoryRouter>,
    );
    const painel = screen.getByRole('region', { name: 'Perfil de atleta' });
    expect(painel.getAttribute('aria-busy')).toBeNull();
    expect(painel.textContent).not.toMatch(/\d|\?/);
    expect(screen.queryByLabelText('Geral aguardando avaliação')).toBeNull();
    expect(screen.getByText('Não deu para carregar os números')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Compartilhar' }).hasAttribute('disabled')).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('sem avaliação, a linha de status mostra geral ? como o losango', () => {
    const { painel } = montar(SEM_NOTA);
    expect(painel.textContent).toMatch(/geral \?/i);
    expect(painel.textContent).not.toMatch(/geral —/i);
  });
});
