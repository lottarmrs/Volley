import { StrictMode, useState, type FC } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { MotionConfig } from 'motion/react';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '../src/index.css';
import { MyCardDeck } from '../src/components/account/MyCardDeck';
import type { MyCard } from '../src/application/myCards';
import {
  ABERTA,
  CARREGANDO,
  CARTAS_CARREGANDO,
  CARTAS_NENHUMA,
  CARTAS_SEM_AVALIACAO,
  CARTAS_SEM_PELADA,
  CARTAS_TRES,
  CARTAS_UMA,
  SEM_NOTA,
} from './minhacartaFixtures';

interface Exemplo {
  id: string;
  nome: string;
  cartas: MyCard[];
  inicial: string | null;
}

const EXEMPLOS: Exemplo[] = [
  { id: 'tres', nome: 'Três comunidades', cartas: CARTAS_TRES, inicial: null },
  { id: 'uma', nome: 'Uma comunidade', cartas: CARTAS_UMA, inicial: null },
  { id: 'sem-pelada', nome: 'Sem pelada', cartas: CARTAS_SEM_PELADA, inicial: ABERTA.id },
  {
    id: 'sem-avaliacao',
    nome: 'Sem avaliação',
    cartas: CARTAS_SEM_AVALIACAO,
    inicial: SEM_NOTA.id,
  },
  { id: 'carregando', nome: 'Carregando', cartas: CARTAS_CARREGANDO, inicial: CARREGANDO.id },
  { id: 'nenhuma', nome: 'Nenhuma comunidade', cartas: CARTAS_NENHUMA, inicial: null },
];

const parametros = new URLSearchParams(window.location.search);

export const Bancada: FC = () => {
  const [exemploId, setExemploId] = useState(parametros.get('exemplo') ?? EXEMPLOS[0].id);
  const exemplo = EXEMPLOS.find((e) => e.id === exemploId) ?? EXEMPLOS[0];
  const [selecionada, setSelecionada] = useState<string | null>(exemplo.inicial);
  const [reduzir, setReduzir] = useState(parametros.get('reduzir') === '1');
  const [registro, setRegistro] = useState<string | null>(null);
  const limpo = parametros.get('limpo') === '1';

  const escolher = (id: string) => {
    const proximo = EXEMPLOS.find((e) => e.id === id) ?? EXEMPLOS[0];
    setExemploId(proximo.id);
    setSelecionada(proximo.inicial);
    setRegistro(null);
  };

  return (
    <div className="min-h-screen bg-base-100 pt-6 pb-28 text-base-content">
      <MemoryRouter>
        <MotionConfig reducedMotion={reduzir ? 'always' : 'user'}>
          <div key={exemplo.id}>
            <MyCardDeck
              cards={exemplo.cartas}
              selectedCommunityId={selecionada}
              onSelect={(id) => {
                setSelecionada(id);
                setRegistro(`onSelect(${id})`);
              }}
              onOpenProfile={(id) => setRegistro(`onOpenProfile(${id})`)}
            />
          </div>
        </MotionConfig>
      </MemoryRouter>

      {!limpo && (
        <aside
          aria-label="Bancada"
          className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-2xl border border-white/12 bg-base-300/95 p-2 shadow-[0_16px_40px_rgba(0,0,0,0.6)] backdrop-blur"
        >
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 px-2 text-sm font-bold">
            <span className="sr-only">Exemplo</span>
            <select
              value={exemplo.id}
              onChange={(e) => escolher(e.target.value)}
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
