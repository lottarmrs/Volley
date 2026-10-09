import { StrictMode, useState, type FC, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '../src/index.css';
import { AthleteProfilePanel } from '../src/components/account/AthleteProfilePanel';
import type { MyCard } from '../src/application/myCards';
import type { Player } from '../src/types';
import {
  ANA,
  CARTAS_CARREGANDO,
  CARTAS_SEM_AVALIACAO,
  CARTAS_SEM_PELADA,
  CARTAS_TRES,
} from './minhacartaFixtures';

const FOTO =
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=900&q=80&auto=format&fit=crop';

const achar = (cartas: MyCard[], id: string) => cartas.find((c) => c.community.id === id) as MyCard;

function comForma(carta: MyCard, notas: number[]): MyCard {
  const media = Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 100) / 100;
  return {
    ...carta,
    card: {
      ...carta.card,
      player: {
        ...carta.card.player,
        formaAtual: { ...carta.card.player.formaAtual, ultimasPartidas: notas },
      },
      formBadge: { value: media, color: media >= 8 ? 'green' : media >= 6 ? 'yellow' : 'red' },
    },
  };
}

const ANA_COM_FOTO: Player = { ...ANA, avatarUrl: FOTO, alturaCm: 176 };

interface Exemplo {
  id: string;
  nome: string;
  carta: MyCard;
  jogador: Player;
}

const EXEMPLOS: Exemplo[] = [
  {
    id: 'mvp-foto',
    nome: 'Edição MVP, com foto',
    carta: comForma(achar(CARTAS_TRES, 'terca'), [7.6, 8.1, 8.4, 8.8, 9.1]),
    jogador: ANA_COM_FOTO,
  },
  {
    id: 'sem-avaliacao',
    nome: 'Sem avaliação',
    carta: comForma(achar(CARTAS_SEM_AVALIACAO, 'sem-nota'), [6.4]),
    jogador: ANA_COM_FOTO,
  },
  {
    id: 'sem-pelada',
    nome: 'Sem pelada',
    carta: achar(CARTAS_SEM_PELADA, 'aberta'),
    jogador: ANA_COM_FOTO,
  },
  {
    id: 'lesionado',
    nome: 'Lesionada, canhota, Muralha',
    carta: comForma(achar(CARTAS_TRES, 'quinta'), [6.2, 5.8, 5.1, 4.9]),
    jogador: {
      ...ANA_COM_FOTO,
      maoDominante: 'left' as Player['maoDominante'],
      status: { lesionado: true, limitacaoFisica: null },
    },
  },
  {
    id: 'sem-foto',
    nome: 'Sem foto (Maestro)',
    carta: comForma(achar(CARTAS_TRES, 'parque'), [7.1, 6.9, 7.4]),
    jogador: { ...ANA, alturaCm: 168 },
  },
  {
    id: 'carregando',
    nome: 'Carregando',
    carta: achar(CARTAS_CARREGANDO, 'carregando'),
    jogador: ANA_COM_FOTO,
  },
];

const parametros = new URLSearchParams(window.location.search);

const Casca: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="flex min-h-screen">
    <aside
      aria-hidden
      className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-base-300 bg-base-200 lg:block"
    />
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-20 flex h-[72px] items-center border-b border-base-300 bg-base-200 px-4 text-lg font-black uppercase sm:px-8">
        Meu perfil
      </header>
      <main className="w-full max-w-[1440px] flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
    </div>
  </div>
);

export const Bancada: FC = () => {
  const [exemploId, setExemploId] = useState(parametros.get('exemplo') ?? EXEMPLOS[0].id);
  const exemplo = EXEMPLOS.find((e) => e.id === exemploId) ?? EXEMPLOS[0];
  const [reduzir, setReduzir] = useState(parametros.get('reduzir') === '1');
  const [registro, setRegistro] = useState<string | null>(null);
  const [casca, setCasca] = useState(parametros.get('casca') === '1');
  const limpo = parametros.get('limpo') === '1';

  return (
    <div className="min-h-screen bg-base-100 pb-28 text-base-content">
      <MotionConfig reducedMotion={reduzir ? 'always' : 'user'}>
        {(() => {
          const painel = (
            <div key={exemplo.id}>
              <AthleteProfilePanel
                card={exemplo.carta}
                player={exemplo.jogador}
                onShowCard={() => setRegistro('onShowCard()')}
              />
            </div>
          );
          return casca ? <Casca>{painel}</Casca> : painel;
        })()}
      </MotionConfig>

      {!limpo && (
        <aside
          aria-label="Bancada"
          className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-2xl border border-white/12 bg-base-300/95 p-2 shadow-[0_16px_40px_rgba(0,0,0,0.6)] backdrop-blur"
        >
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 px-2 text-sm font-bold">
            <span className="sr-only">Exemplo</span>
            <select
              value={exemplo.id}
              onChange={(e) => {
                setExemploId(e.target.value);
                setRegistro(null);
              }}
              className="select select-sm h-11 w-full rounded-[10px] border-white/15 bg-base-200"
            >
              {EXEMPLOS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex h-11 items-center gap-2 rounded-[10px] border border-white/10 bg-base-200 px-3 text-sm font-bold">
            <input
              type="checkbox"
              className="checkbox checkbox-sm checkbox-primary"
              checked={reduzir}
              onChange={(e) => setReduzir(e.target.checked)}
            />
            Reduzir movimento
          </label>
          <label className="flex h-11 items-center gap-2 rounded-[10px] border border-white/10 bg-base-200 px-3 text-sm font-bold">
            <input
              type="checkbox"
              className="checkbox checkbox-sm checkbox-primary"
              checked={casca}
              onChange={(e) => setCasca(e.target.checked)}
            />
            Dentro do app
          </label>
          <span className="w-full px-2 font-mono text-[11px] text-white/60 sm:w-auto">
            {registro ?? 'nenhuma chamada'}
          </span>
        </aside>
      )}
    </div>
  );
};

createRoot(document.getElementById('bancada') as HTMLElement).render(
  <StrictMode>
    <Bancada />
  </StrictMode>,
);
