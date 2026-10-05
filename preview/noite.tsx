import { StrictMode, useState, type FC } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '../src/index.css';
import { AthleteNightReveal } from '../src/components/player/AthleteNightReveal';
import type { AthleteNight } from '../src/application/athleteNight';
import {
  NOITE_MVP,
  NOITE_SEM_AVALIACAO,
  NOITE_SO_NUMEROS,
  NOITE_TRES_CONQUISTAS,
} from './noiteFixtures';

interface Exemplo {
  id: string;
  nome: string;
  comunidade: string;
  noite: AthleteNight;
}

const EXEMPLOS: Exemplo[] = [
  { id: 'mvp', nome: 'Edição especial (MVP)', comunidade: 'Vôlei de Terça', noite: NOITE_MVP },
  {
    id: 'numeros',
    nome: 'Só números',
    comunidade: 'Panelinha do Parque Barigui — quadra 2, turma das terças e quintas',
    noite: NOITE_SO_NUMEROS,
  },
  {
    id: 'conquistas',
    nome: 'Três conquistas novas',
    comunidade: 'Vôlei de Terça',
    noite: NOITE_TRES_CONQUISTAS,
  },
  {
    id: 'sem-avaliacao',
    nome: 'Sem avaliação',
    comunidade: 'Vôlei de Terça',
    noite: NOITE_SEM_AVALIACAO,
  },
];

export const Bancada: FC = () => {
  const [exemploId, setExemploId] = useState(EXEMPLOS[0].id);
  const [reduzir, setReduzir] = useState(false);
  const [rodada, setRodada] = useState(0);
  const [registro, setRegistro] = useState<string[]>([]);
  const exemplo = EXEMPLOS.find((e) => e.id === exemploId) ?? EXEMPLOS[0];

  const anotar = (evento: string) =>
    setRegistro((atual) =>
      [`${new Date().toLocaleTimeString('pt-BR')} · ${evento}`, ...atual].slice(0, 8),
    );

  const escolher = (id: string) => {
    setExemploId(id);
    setRodada((r) => r + 1);
  };

  return (
    <div className="min-h-screen bg-base-100 pb-8 text-base-content lg:px-4 lg:py-6">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 lg:flex-row lg:items-start lg:justify-center">
        <aside className="w-full max-w-sm space-y-6 px-4 lg:sticky lg:top-6 lg:px-0">
          <header className="space-y-1 border-b border-base-300 pb-4">
            <h1 className="text-2xl font-black uppercase tracking-tight">Sua noite · bancada</h1>
            <p className="text-sm text-white/65">
              Componente real, noites montadas por buildAthleteNight sobre dados de mentira.
            </p>
          </header>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-white/65">
              Noite de exemplo
            </legend>
            {EXEMPLOS.map((e) => (
              <button
                key={e.id}
                type="button"
                aria-pressed={e.id === exemploId}
                onClick={() => escolher(e.id)}
                className={`flex h-11 w-full items-center rounded-[10px] border px-4 text-left text-sm font-bold transition-colors duration-150 ${
                  e.id === exemploId
                    ? 'border-primary bg-primary/15 text-white'
                    : 'border-white/10 bg-base-200 text-white/80 hover:bg-base-300'
                }`}
              >
                {e.nome}
              </button>
            ))}
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <label className="flex h-11 items-center gap-2 rounded-[10px] border border-white/10 bg-base-200 px-4 text-sm font-bold">
              <input
                type="checkbox"
                className="checkbox checkbox-sm checkbox-primary"
                checked={reduzir}
                onChange={(e) => {
                  setReduzir(e.target.checked);
                  setRodada((r) => r + 1);
                }}
              />
              Reduzir movimento
            </label>
            <button
              type="button"
              onClick={() => setRodada((r) => r + 1)}
              className="h-11 rounded-[10px] border border-white/10 bg-base-200 px-4 text-sm font-bold hover:bg-base-300"
            >
              Recomeçar
            </button>
          </div>

          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-white/65">
              Chamadas
            </h2>
            <ol className="space-y-1 font-mono text-xs text-white/75">
              {registro.length === 0 ? <li>nenhuma ainda</li> : null}
              {registro.map((linha, i) => (
                <li key={i}>{linha}</li>
              ))}
            </ol>
          </section>
        </aside>

        <div
          className="relative order-first h-[min(812px,100svh)] w-[375px] max-w-full shrink-0 overflow-hidden lg:order-none lg:rounded-[2.25rem] lg:border lg:border-white/15 shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
          style={{ transform: 'translateZ(0)' }}
        >
          <MotionConfig reducedMotion={reduzir ? 'always' : 'user'}>
            <AthleteNightReveal
              key={`${exemplo.id}-${rodada}`}
              night={exemplo.noite}
              communityName={exemplo.comunidade}
              sessionDate="2026-10-04"
              onOpened={() => anotar('onOpened')}
              onClose={() => {
                anotar('onClose');
                setRodada((r) => r + 1);
              }}
              onViewCard={() => anotar('onViewCard')}
            />
          </MotionConfig>
        </div>
      </div>
    </div>
  );
};

createRoot(document.getElementById('bancada') as HTMLElement).render(
  <StrictMode>
    <Bancada />
  </StrictMode>,
);
