import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Clock, Lock, Users, Volleyball } from 'lucide-react';
import type { CommunityInviteState } from '@app/communityInviteUseCases';
import { paths } from '@app/appRoutes';

interface CommunityInviteViewProps {
  state: CommunityInviteState;
  busy: boolean;
  onRequest: () => void;
}

function Moldura({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      {children}
    </div>
  );
}

function Cartao({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-5 rounded-box border border-base-300 bg-base-200 p-6 shadow-card">
      {children}
    </div>
  );
}

/** O nome do grupo responde a primeira pergunta de quem clicou -- "e o racha
 *  certo?" -- entao e o unico momento de destaque da tela. */
function Identidade({ nome, membros }: { nome: string; membros: number }) {
  return (
    <div className="space-y-3">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
        <Volleyball className="h-5 w-5" />
      </span>
      {/* h2, nao h1: o AppShell ja traz o h1 da pagina. */}
      <h2 className="text-2xl font-black leading-tight tracking-tight text-base-content sm:text-3xl">
        {nome}
      </h2>
      <p className="flex items-center gap-1.5 text-sm text-base-content/60">
        <Users className="h-4 w-4 shrink-0" />
        <span className="font-mono font-semibold text-base-content/80">{membros}</span>
        {membros === 1 ? 'pessoa no grupo' : 'pessoas no grupo'}
      </p>
    </div>
  );
}

function VoltarParaComunidades({ rotulo = 'Minhas comunidades' }: { rotulo?: string }) {
  return (
    <Link
      to={paths.comunidades}
      className="btn btn-ghost btn-sm w-fit gap-2 px-3 text-xs font-bold uppercase tracking-wider text-base-content/60 hover:text-base-content"
    >
      {rotulo}
    </Link>
  );
}

export function CommunityInviteView({ state, busy, onRequest }: CommunityInviteViewProps) {
  if (state.kind === 'loading') {
    return (
      <Moldura>
        <p className="sr-only" role="status">
          Carregando o convite.
        </p>
        <div className="animate-pulse space-y-5 rounded-box border border-base-300 bg-base-200 p-6">
          <div className="h-11 w-11 rounded-xl bg-base-300" />
          <div className="h-7 w-2/3 rounded bg-base-300" />
          <div className="h-4 w-1/3 rounded bg-base-300" />
          <div className="h-11 w-full rounded-box bg-base-300" />
        </div>
      </Moldura>
    );
  }

  if (state.kind === 'invalid') {
    return (
      <Moldura>
        <Cartao>
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-error/25 bg-error/10 text-error">
            <Lock className="h-5 w-5" />
          </span>
          <div className="space-y-2">
            <h2 className="text-xl font-black tracking-tight text-base-content">
              Convite fora do ar
            </h2>
            <p className="text-sm leading-relaxed text-base-content/70">{state.message}</p>
          </div>
        </Cartao>
        <VoltarParaComunidades />
      </Moldura>
    );
  }

  if (state.kind === 'alreadyMember') {
    return (
      <Moldura>
        <Cartao>
          <Identidade nome={state.community.name} membros={state.community.memberCount} />
          <p className="text-sm leading-relaxed text-base-content/70">Você já está neste grupo.</p>
          <Link to={state.to} className="btn btn-primary w-full gap-2">
            Ir para a pelada <ArrowRight className="h-4 w-4" />
          </Link>
        </Cartao>
      </Moldura>
    );
  }

  if (state.kind === 'pending') {
    return (
      <Moldura>
        <Cartao>
          <Identidade nome={state.community.name} membros={state.community.memberCount} />
          <div className="flex items-start gap-3 rounded-box border border-warning/30 bg-warning/10 p-4">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-sm leading-relaxed text-base-content/80">
              Seu pedido está com o pessoal do grupo. Quem administra a comunidade aprova, e aí você
              entra na lista da pelada.
            </p>
          </div>
        </Cartao>
        <VoltarParaComunidades />
      </Moldura>
    );
  }

  if (state.kind === 'blocked') {
    return (
      <Moldura>
        <Cartao>
          <Identidade nome={state.community.name} membros={state.community.memberCount} />
          <p className="text-sm leading-relaxed text-base-content/70">
            Sua entrada neste grupo não está liberada. Fale com quem administra a comunidade — pedir
            de novo por aqui daria no mesmo.
          </p>
        </Cartao>
        <VoltarParaComunidades />
      </Moldura>
    );
  }

  return (
    <Moldura>
      <Cartao>
        <Identidade nome={state.community.name} membros={state.community.memberCount} />
        {state.community.description && (
          <p className="text-sm leading-relaxed text-base-content/70">
            {state.community.description}
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={busy}
          onClick={onRequest}
        >
          {busy ? 'Enviando…' : 'Pedir para entrar'}
        </button>
        {/* A lista da pelada e por ordem de chegada e pode estar cheia: o
            convite nao promete vaga, so a entrada no grupo. */}
        <p className="text-xs leading-relaxed text-base-content/55">
          Quem administra o grupo precisa aprovar sua entrada. Depois disso você vê as peladas e
          entra na lista.
        </p>
      </Cartao>
      <VoltarParaComunidades />
    </Moldura>
  );
}

export default CommunityInviteView;
