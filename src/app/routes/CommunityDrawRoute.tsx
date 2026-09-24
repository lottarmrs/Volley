import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import { paths } from '@app/appRoutes';
import { resolveDrawGate } from '@app/drawGateUseCases';
import { buildSessionWizardContract } from '@app/screens/sessionWizard/sessionWizardContract';
import { resolveRegistrationTarget } from '@app/registrationLinkUseCases';
import { getCommunityPlayers } from '@logic/community';
import { useRegistrationBoard } from '../../hooks/useRegistrationBoard';
import { SessionWizard } from '../../components/session/SessionWizard';
import { useCommunityShell } from '../shellContext';

/** O passo do wizard que fala de formato, depois de Sessão e Atletas. */
const PASSO_DO_FORMATO = 2;

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
  const { community, sess, play, comm, wizard } = shell;
  const { sessionId } = useParams();

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
  const [pronto, setPronto] = useState(false);

  const elenco = getCommunityPlayers(community.id, play.players);

  useEffect(() => {
    if (preparado.current || portao.kind !== 'ready' || !session) return;
    preparado.current = true;

    // Os confirmados chegam por id de nuvem; o wizard trabalha com id local.
    const locais = portao.confirmedPlayerCloudIds
      .map((cloudId) => elenco.find((player) => player.cloudId === cloudId)?.id)
      .filter((id): id is string => !!id);

    sess.setActiveSession({ ...session, selectedPlayerIds: locais });
    wizard.setWizardStep(PASSO_DO_FORMATO);
    setPronto(true);
  }, [portao, session, elenco, sess, wizard]);

  if (!sessionId) return <Navigate to={paths.sessoes(community.id)} replace />;
  const voltar = paths.inscricao(community.id, sessionId);

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

  if (!pronto || !sess.activeSession) {
    return (
      <p role="status" className="py-10 text-center text-sm text-base-content/60">
        Montando o sorteio…
      </p>
    );
  }

  return (
    <SessionWizard
      contract={buildSessionWizardContract({
        activeSession: sess.activeSession,
        players: play.players,
        communities: comm.communities,
        hookApi: wizard,
        applyGuestPlayer: (player, editDetails) =>
          shell.applyGuestPlayer(player, editDetails, community.id),
      })}
    />
  );
}

export default CommunityDrawRoute;
