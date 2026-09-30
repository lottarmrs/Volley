import { StrictMode, type FC, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import '../src/index.css';
import { OnlineLoading, OnlineReadError } from '../src/ui/common/OnlineDataState';
import { CommunityRulesArea } from '../src/components/community/areas/CommunityRulesArea';
import { createDefaultLocalCommunityRules } from '../src/application/localCommunityRulesUseCases';
import { offlineError, unexpectedError } from '../src/application/appResult';
import { OFFLINE_MESSAGE } from '../src/application/onlineErrors';
import type { Community } from '../src/types';

const comunidade = {
  id: 'c1',
  name: 'Terça do Vôlei',
  defaultFormat: 'free_play',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as Community;

const regras = createDefaultLocalCommunityRules({ community: comunidade, now: '2026-09-30' });
const semSinal = offlineError(OFFLINE_MESSAGE).error;
const falhou = unexpectedError('x').error;

const Bloco: FC<{ nome: string; children: ReactNode }> = ({ nome, children }) => (
  <section className="space-y-3">
    <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">{nome}</h2>
    {children}
  </section>
);

export function Bancada() {
  return (
    <MemoryRouter>
      <div className="min-h-screen bg-base-100 px-4 py-8">
        <div className="mx-auto max-w-xl space-y-12">
          <header className="space-y-1 border-b border-base-300 pb-5">
            <h1 className="text-2xl font-black uppercase tracking-tight text-base-content">
              Dados online · estados
            </h1>
            <p className="text-sm text-base-content/60">
              Componentes reais, dados de mentira. Só o servidor de desenvolvimento serve esta
              página.
            </p>
          </header>

          <Bloco nome="Carregando">
            <OnlineLoading label="Carregando comunidades…" />
            <OnlineLoading label="Carregando atletas…" />
            <OnlineLoading label="Carregando convidados…" />
            <OnlineLoading label="Carregando regras…" />
            <OnlineLoading label="Carregando seu painel…" />
          </Bloco>

          <Bloco nome="Sem conexão — sem nada para mostrar">
            <OnlineReadError error={semSinal} onRetry={() => undefined} />
          </Bloco>

          <Bloco nome="Sem conexão — por cima do que já estava na tela">
            <OnlineReadError error={semSinal} onRetry={() => undefined} />
            <CommunityRulesArea rules={regras} canEditRules onSave={() => undefined} />
          </Bloco>

          <Bloco nome="Erro que não é de rede">
            <OnlineReadError error={falhou} onRetry={() => undefined} />
          </Bloco>
        </div>
      </div>
    </MemoryRouter>
  );
}

createRoot(document.getElementById('bancada') as HTMLElement).render(
  <StrictMode>
    <Bancada />
  </StrictMode>,
);
