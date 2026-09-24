import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import type { CommunityInviteState } from '../src/application/communityInviteUseCases';
import { CommunityInviteView } from '../src/components/community/CommunityInviteView';
import '../src/index.css';

const grupo = {
  id: 'c-1',
  name: 'Terça Forte',
  description: 'Vôlei misto toda terça, 20h, na Arena Pro.',
  memberCount: 18,
  myStatus: null,
};

const ESTADOS: { nome: string; state: CommunityInviteState }[] = [
  { nome: 'Carregando', state: { kind: 'loading' } },
  { nome: 'Encontrada — dá para pedir', state: { kind: 'canRequest', community: grupo } },
  {
    nome: 'Grupo sem descrição',
    state: { kind: 'canRequest', community: { ...grupo, description: null } },
  },
  {
    nome: 'Nome comprido, para conferir a quebra',
    state: {
      kind: 'canRequest',
      community: {
        ...grupo,
        name: 'Associação Recreativa de Vôlei do Bairro Jardim das Palmeiras',
        memberCount: 1,
      },
    },
  },
  {
    nome: 'Pedido pendente',
    state: { kind: 'pending', community: { ...grupo, myStatus: 'pending' } },
  },
  {
    nome: 'Já é do grupo',
    state: {
      kind: 'alreadyMember',
      community: { ...grupo, myStatus: 'active' },
      to: '/comunidades/c-1/sessoes/s-9/inscricao',
    },
  },
  {
    nome: 'Entrada bloqueada',
    state: { kind: 'blocked', community: { ...grupo, myStatus: 'rejected' } },
  },
  {
    nome: 'Convite inválido',
    state: {
      kind: 'invalid',
      message: 'Este convite não vale mais. Peça um link novo para quem te chamou.',
    },
  },
];

export function Bancada() {
  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      <div className="mx-auto max-w-2xl space-y-10 px-4 py-10">
        <header className="space-y-1">
          <h1 className="text-xl font-black uppercase tracking-tight">Convite · estados da tela</h1>
          <p className="text-sm text-base-content/60">
            Componente real, dados de mentira. Só o servidor de desenvolvimento serve esta página.
          </p>
        </header>

        {ESTADOS.map((estado) => (
          <section key={estado.nome} className="space-y-3">
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
              {estado.nome}
            </h2>
            <div className="rounded-box border border-base-300/60">
              <MemoryRouter>
                <CommunityInviteView state={estado.state} busy={false} onRequest={() => {}} />
              </MemoryRouter>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('bancada') as HTMLElement).render(
  <StrictMode>
    <Bancada />
  </StrictMode>,
);
