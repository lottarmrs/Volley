import { useEffect, useMemo, useRef, useState } from 'react';
import type { SetStateAction } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import { paths } from '@app/appRoutes';
import { resolveDrawGate } from '@app/drawGateUseCases';
import { buildSessionWizardContract } from '@app/screens/sessionWizard/sessionWizardContract';
import { resolveRegistrationTarget } from '@app/registrationLinkUseCases';
import { getCommunityPlayers } from '@logic/community';
import { loadPeladaDrawDraft, peladaDrawDraftStore } from '@logic/sessionDraft';
import { DRAW_FIRST_STEP, initialDrawState } from '@app/drawDraftUseCases';
import type { Game, Session, Team } from '@shared/types';
import { useSessionWizard } from '../../hooks/useSessionWizard';
import { useRegistrationBoard } from '../../hooks/useRegistrationBoard';
import { SessionWizard } from '../../components/session/SessionWizard';
import { useCommunityShell } from '../shellContext';
import { useCommunityPermissions } from '../../hooks/useCommunityPermissions';

interface Gravacao {
  sessions: Session[];
  teams: Team[];
  games: Game[];
}

function Aviso({ titulo, mensagem, voltar }: { titulo: string; mensagem: string; voltar: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 py-10">
      <div className="space-y-3 rounded-box border border-warning/40 bg-warning/10 p-5">
        <AlertTriangle className="h-5 w-5 text-warning" />
        <h2 className="text-lg font-black text-base-content">{titulo}</h2>
        <p className="text-sm leading-relaxed text-base-content/75">{mensagem}</p>
      </div>
      <Link to={voltar} className="btn btn-primary w-full">
        Voltar para a lista
      </Link>
    </div>
  );
}

export function CommunityDrawRoute() {
  const shell = useCommunityShell();
  const { community, sess, play, comm } = shell;
  const permissions = useCommunityPermissions(community);
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const session = sess.sessions.find((item) => item.id === sessionId) ?? null;
  const alvo = resolveRegistrationTarget({ routeSessionId: sessionId, session });
  const communityCloudId =
    comm.communities.find((item) => item.id === community.id)?.cloudId ?? null;

  const api = useRegistrationBoard({
    session,
    communityCloudId,
    defaultCapacity: session?.registrationCapacity ?? 12,
    sessionCloudId: alvo?.sessionCloudId ?? null,
  });

  const portao = resolveDrawGate({ board: api.board, loading: api.loading });
  const preparado = useRef(false);
  const [rascunho, setRascunho] = useState<Session | null>(null);
  const pendente = useRef<Gravacao | null>(null);
  const [vista, setVista] = useState<Gravacao | null>(null);
  const draftStore = useMemo(
    () => (sessionId ? peladaDrawDraftStore(sessionId) : undefined),
    [sessionId],
  );

  const elenco = getCommunityPlayers(community.id, play.players);
  const voltar = sessionId ? paths.inscricao(community.id, sessionId) : paths.sessoes(community.id);

  const doBanco: Gravacao = { sessions: sess.sessions, teams: sess.teams, games: sess.games };
  const exibido = vista ?? doBanco;

  function guardar<K extends keyof Gravacao>(campo: K, valor: SetStateAction<Gravacao[K]>) {
    const base = pendente.current ?? doBanco;
    const proximo =
      typeof valor === 'function'
        ? (valor as (prev: Gravacao[K]) => Gravacao[K])(base[campo])
        : valor;
    const seguinte = { ...base, [campo]: proximo };
    pendente.current = seguinte;
    setVista(seguinte);
  }

  const comecar = () => {
    const gravar = pendente.current;
    pendente.current = null;
    setVista(null);
    if (gravar) {
      sess.setTeams(gravar.teams);
      sess.setGames(gravar.games);
      sess.setSessions(gravar.sessions);
      const iniciada = gravar.sessions.find((item) => item.id === sessionId);
      if (iniciada) sess.setActiveSession(iniciada);
    }
    navigate(paths.sessaoAtiva(community.id));
  };

  const wizard = useSessionWizard({
    players: play.players,
    activeSession: rascunho,
    setActiveSession: setRascunho,
    sessions: exibido.sessions,
    teams: exibido.teams,
    games: exibido.games,
    setSessions: (valor) => guardar('sessions', valor),
    setTeams: (valor) => guardar('teams', valor),
    setGames: (valor) => guardar('games', valor),
    setPage: (page) => {
      if (page === 'session-active') comecar();
      else navigate(voltar);
    },
    communities: comm.communities,
    draftStore,
  });

  useEffect(() => {
    if (preparado.current || portao.kind !== 'ready' || !session) return;
    preparado.current = true;

    const locais = portao.confirmedPlayerCloudIds
      .map((cloudId) => elenco.find((player) => player.cloudId === cloudId)?.id)
      .filter((id): id is string => !!id);

    const inicio = initialDrawState({
      session,
      confirmedPlayerIds: locais,
      draft: loadPeladaDrawDraft(session.id),
    });
    wizard.resumeDraft(inicio);
  }, [portao, session, elenco, wizard]);

  if (!sessionId) return <Navigate to={paths.sessoes(community.id)} replace />;

  if (portao.kind === 'loading') {
    return (
      <p role="status" className="py-10 text-center text-sm text-base-content/60">
        Conferindo a lista…
      </p>
    );
  }

  if (portao.kind === 'semLista') {
    // Pelada sem inscrição segue o caminho manual, que nunca deixou de existir.
    return <Navigate to={paths.sessaoNova(community.id)} replace />;
  }

  if (portao.kind !== 'ready') {
    const titulos: Record<string, string> = {
      listaAberta: 'A lista ainda está aberta',
      listaVazia: 'Ninguém na lista',
      semPermissao: 'Só quem organiza sorteia',
      jaComecou: 'A pelada já começou',
    };
    return (
      <Aviso
        titulo={titulos[portao.kind] ?? 'Não dá para sortear'}
        mensagem={portao.message}
        voltar={voltar}
      />
    );
  }

  if (!rascunho) {
    return (
      <p role="status" className="py-10 text-center text-sm text-base-content/60">
        Montando o sorteio…
      </p>
    );
  }

  const contrato = buildSessionWizardContract({
    activeSession: rascunho,
    players: play.players,
    communities: comm.communities,
    hookApi: wizard,
    applyGuestPlayer: (player, editDetails) =>
      shell.applyGuestPlayer(player, editDetails, community.id),
    reactivateGuestPlayer: (playerId, editDetails) =>
      shell.reactivateGuestPlayerForSession(
        playerId,
        editDetails,
        community.id,
        permissions.canEditPlayerProfile,
      ),
    canEditGuestDetails: permissions.canEditPlayerProfile,
  });

  return (
    <SessionWizard
      firstStep={DRAW_FIRST_STEP}
      title={`Sortear · ${rascunho.name}`}
      exitLabel="Voltar para a pelada"
      contract={{
        model: contrato.model,
        dispatch: async (intent) => {
          if (
            intent.kind === 'cancel' ||
            (intent.kind === 'prev' && wizard.wizardStep <= DRAW_FIRST_STEP)
          ) {
            navigate(voltar);
            return;
          }
          await contrato.dispatch(intent);
        },
      }}
    />
  );
}

export default CommunityDrawRoute;
