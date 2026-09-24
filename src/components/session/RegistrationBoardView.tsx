import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronsUp,
  Circle,
  Clock3,
  DoorOpen,
  Lock,
  RefreshCw,
  Share2,
  ShieldCheck,
  Timer,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import type {
  Player,
  Position,
  RegistrationBoard,
  RegistrationBoardEntry,
  RegistrationPendingCut,
} from '../../types';
import type { RegistrationBoardApi } from '../../hooks/useRegistrationBoard';
import { calculateGeneralOverall } from '../../logic/calculations';
import { EmptyState } from '../../ui/EmptyState';
import { SessionOrganizerPanel, type SessionOrganizerMember } from './SessionOrganizerPanel';
import type { AppResult } from '@app/appResult';
import { buildRegistrationShareMessage } from '@app/registrationLinkUseCases';
import { openWhatsAppShare } from '@logic/exporters';

const POSITION_LABELS: Record<Position, string> = {
  levantador: 'Levantador',
  oposto: 'Oposto',
  ponteiro: 'Ponteiro',
  central: 'Central',
  libero: 'Líbero',
  'all-rounder': 'Versátil',
};

interface RegistrationBoardViewProps {
  api: RegistrationBoardApi;
  players: Player[];
  sessionName: string | null;
  sessionDate: string | null;
  canOpen?: boolean;
  /** Link absoluto da inscricao. Sem ele nao ha o que compartilhar. */
  shareUrl?: string;
  /** Link do convite, para quem recebe a mensagem e ainda nao e do grupo. */
  inviteUrl?: string | null;
  /** Ponto de injecao para o teste; por padrao abre o WhatsApp. */
  onShare?: (texto: string) => void;
  pixKey?: string;
  organizerHandover?: {
    podeTransferir: boolean;
    currentUserId: string | null;
    membros: SessionOrganizerMember[];
    onTransfer: (organizerUserId: string) => Promise<AppResult<void>>;
  };
}

interface SituacaoVisual {
  titulo: string;
  detalhe: string;
  cor: string;
  icone: typeof Check;
}

function formatarData(iso: string): string {
  const data = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function formatarPrazo(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function nomeDoAtleta(players: Player[], playerId: string): string {
  return players.find((player) => player.cloudId === playerId)?.nome ?? 'Atleta da comunidade';
}

function listarNomes(players: Player[], ids: readonly string[]): string {
  const nomes = ids.map((id) => nomeDoAtleta(players, id));
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

function situacaoDoPagamento(board: RegistrationBoard): string | null {
  if (board.viewerEntryStatus === null) return null;
  const minha = board.entries.find((entry) => entry.playerId === board.viewerPlayerId);
  if (minha?.paymentLapsedAt) return 'Você perdeu o prazo e caiu para a reserva.';
  if (board.viewerPaidAt) return 'Pagamento em dia.';
  return board.paymentDueAt
    ? `Falta pagar · prazo ${formatarPrazo(board.paymentDueAt)}`
    : 'Falta pagar.';
}

function situacaoDoAtleta(board: RegistrationBoard): SituacaoVisual {
  if (board.status === 'LOCKED') {
    return {
      titulo: 'Lista travada para o sorteio',
      detalhe: 'Ninguém entra nem sai até o sorteio terminar.',
      cor: 'border-base-content/15 bg-base-200',
      icone: Lock,
    };
  }
  if (board.viewerEntryStatus === 'CONFIRMED') {
    return {
      titulo: 'Você está dentro',
      detalhe: 'Sua vaga está garantida nesta pelada.',
      cor: 'border-success/40 bg-success/10',
      icone: Check,
    };
  }
  if (board.viewerEntryStatus === 'WAITLISTED') {
    return {
      titulo: `Reserva · ${board.viewerQueuePosition ?? 1}º da fila`,
      detalhe:
        board.viewerQueuePosition === 1
          ? 'Uma desistência e a vaga é sua.'
          : `Faltam ${(board.viewerQueuePosition ?? 1) - 1} desistências para você entrar.`,
      cor: 'border-warning/40 bg-warning/10',
      icone: Clock3,
    };
  }
  if (board.status === 'CLOSED') {
    return {
      titulo: 'Inscrição fechada',
      detalhe: 'Quem organiza encerrou a lista desta pelada.',
      cor: 'border-base-content/15 bg-base-200',
      icone: Lock,
    };
  }
  return {
    titulo: 'Você ainda não está na lista',
    detalhe: 'Entre agora: a ordem de chegada decide quem joga.',
    cor: 'border-primary/40 bg-primary/10',
    icone: DoorOpen,
  };
}

export function RegistrationBoardView({
  api,
  players,
  sessionName,
  sessionDate,
  canOpen = false,
  pixKey,
  shareUrl,
  inviteUrl,
  onShare,
  organizerHandover,
}: RegistrationBoardViewProps) {
  const { board, busy, error, loading } = api;
  const [mostrarOrganizador, setMostrarOrganizador] = useState(false);

  if (!board && loading) {
    return (
      <section className="space-y-4" aria-busy>
        <Cabecalho nome={sessionName ?? 'Pelada da comunidade'} data={sessionDate} />
        <p className="sr-only" role="status">
          Carregando a inscrição.
        </p>
        <div className="animate-pulse space-y-4">
          <div className="h-32 rounded-box border border-base-300 bg-base-200" />
          <div className="overflow-hidden rounded-box border border-base-300 bg-base-200">
            {[0, 1, 2, 3].map((linha) => (
              <div
                key={linha}
                className="flex items-center gap-3 border-b border-base-300 px-4 py-3"
              >
                <div className="h-4 w-5 rounded bg-base-300" />
                <div className="h-4 flex-1 rounded bg-base-300" />
                <div className="h-5 w-8 rounded bg-base-300" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!board && error) {
    return (
      <section className="space-y-4">
        <Cabecalho nome={sessionName ?? 'Pelada da comunidade'} data={sessionDate} />
        <div
          role="alert"
          className="rounded-box border border-error/30 bg-error/10 p-6 text-center"
        >
          <AlertTriangle className="mx-auto h-8 w-8 text-error" />
          <h2 className="mt-3 text-lg font-bold text-base-content">A lista não carregou</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-base-content/70">{error}</p>
          <button
            type="button"
            className="btn btn-outline mt-4 min-h-[44px]"
            disabled={loading}
            onClick={() => void api.reload()}
          >
            <RefreshCw className="h-4 w-4" /> Tentar de novo
          </button>
        </div>
      </section>
    );
  }

  if (!board) {
    return (
      <section className="space-y-4">
        <Cabecalho nome={sessionName ?? 'Pelada da comunidade'} data={sessionDate} />
        <EmptyState
          icon={DoorOpen}
          size="compact"
          title={canOpen ? 'Ninguém foi convidado ainda' : 'A inscrição ainda não abriu'}
          description={
            canOpen
              ? 'Abra a lista e o grupo já pode garantir a vaga pelo app, na ordem de chegada.'
              : 'Quem organiza ainda não abriu a lista desta pelada. Volte mais tarde.'
          }
        >
          {canOpen && (
            <button
              type="button"
              className="btn btn-primary self-start min-h-[44px]"
              disabled={busy}
              onClick={() => void api.open()}
            >
              Abrir inscrição
            </button>
          )}
        </EmptyState>
      </section>
    );
  }

  const nome = sessionName ?? board.sessionName ?? 'Pelada da comunidade';
  const data = sessionDate ?? board.sessionDate ?? null;
  const jaComecou =
    board.sessionLifecycleStatus === 'IN_PROGRESS' || board.sessionLifecycleStatus === 'COMPLETED';

  const situacao = situacaoDoAtleta(board);
  const pagamento = situacaoDoPagamento(board);
  const corte = board.pendingDeadlineCut;
  const Icone = situacao.icone;
  const livres = Math.max(0, board.capacity - board.confirmedCount);
  // Comecada, a janela continua OPEN mas o servidor ja recusa: oferecer o
  // botao so produziria uma recusa.
  const aberta = board.status === 'OPEN' && !jaComecou;
  const dentro =
    board.viewerEntryStatus === 'CONFIRMED' || board.viewerEntryStatus === 'WAITLISTED';
  const confirmados = board.entries.filter((entry) => entry.status === 'CONFIRMED');
  const reserva = board.entries.filter((entry) => entry.status === 'WAITLISTED');
  const inscritos = new Set(board.entries.map((entry) => entry.playerId));
  const disponiveis = players.filter(
    (player) => player.cloudId && !inscritos.has(player.cloudId ?? ''),
  );

  return (
    <section className="space-y-4" aria-busy={busy || loading}>
      {/* A janela continua em OPEN depois que a pelada comeca -- o servidor ja
          recusa quem tenta entrar, mas so o status dela nao denuncia isso. */}
      {jaComecou && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-box border border-warning/40 bg-warning/10 p-4"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-sm font-semibold leading-relaxed text-base-content/85">
            A pelada já começou. A lista fica aqui para consulta, mas ninguém entra nem sai.
          </p>
        </div>
      )}

      <div className={`rounded-box border p-5 transition-colors ${situacao.cor}`}>
        <Cabecalho nome={nome} data={data} />
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div role="status" className="min-w-0">
            <p className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-base-content">
              <Icone className="h-5 w-5 shrink-0" />
              {situacao.titulo}
            </p>
            <p className="mt-1 text-sm text-base-content/70">{situacao.detalhe}</p>
            {pagamento && (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                {board.viewerPaidAt ? (
                  <Check className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <Timer className="h-4 w-4 shrink-0 text-warning" />
                )}
                <span className={board.viewerPaidAt ? 'text-success' : 'text-warning'}>
                  {pagamento}
                </span>
                {!board.viewerPaidAt && pixKey && !board.viewerCanManage && (
                  <span className="text-base-content/60">
                    PIX <span className="font-mono text-base-content/80">{pixKey}</span>
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-mono text-2xl font-black leading-none text-base-content">
                {board.confirmedCount}/{board.capacity}
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-base-content/50">
                {livres > 0 ? (
                  <span>{livres} vagas livres</span>
                ) : (
                  <span>Lotada · {board.waitlistedCount} na reserva</span>
                )}
              </p>
              {board.viewerCanManage && (
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-base-content/60">
                  <span>
                    {board.paidCount} de {board.confirmedCount} pagos
                  </span>
                </p>
              )}
            </div>
            {aberta && (
              <button
                type="button"
                className={`btn min-h-[44px] ${dentro ? 'btn-ghost border-base-content/20' : 'btn-primary'}`}
                disabled={busy}
                onClick={() => void (dentro ? api.leave() : api.join())}
              >
                {dentro ? 'Sair da lista' : 'Quero jogar'}
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="alert alert-error alert-soft flex-col items-start gap-2 text-sm font-semibold sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm shrink-0 border-error/30"
            disabled={loading || busy}
            onClick={() => void api.reload()}
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
        </div>
      )}

      {corte && (
        <div
          role="status"
          aria-label="Corte do prazo"
          className="flex flex-col gap-3 rounded-box border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-warning">
              <Timer className="h-4 w-4 shrink-0" /> Prazo vencido
            </p>
            <p className="mt-1 text-sm font-semibold text-base-content">
              {corte.demoted.length > 0 && (
                <span>
                  {listarNomes(players, corte.demoted)} {corte.demoted.length > 1 ? 'saem' : 'sai'}
                </span>
              )}
              {corte.demoted.length > 0 && corte.promoted.length > 0 && <span> · </span>}
              {corte.promoted.length > 0 && (
                <span>
                  {listarNomes(players, corte.promoted)}{' '}
                  {corte.promoted.length > 1 ? 'entram' : 'entra'}
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-base-content/70">
              A lista muda na próxima ação. Até lá, ainda dá para marcar quem pagou.
            </p>
          </div>
          {board.viewerCanManage && (
            <button
              type="button"
              className="btn btn-sm btn-warning shrink-0"
              disabled={busy}
              onClick={() => void api.applyDeadline()}
            >
              Aplicar agora
            </button>
          )}
        </div>
      )}

      {board.viewerCanManage && (
        <BarraDoOrganizador api={api} board={board} disponiveis={disponiveis} />
      )}

      {board.viewerCanManage && shareUrl && (
        <button
          type="button"
          className="btn btn-outline btn-sm w-full border-success/40 text-success"
          onClick={() => {
            const texto = buildRegistrationShareMessage({
              sessionName: nome,
              sessionDate: data ?? '',
              capacity: board.capacity,
              confirmedCount: board.confirmedCount,
              url: shareUrl,
              inviteUrl,
            });
            (onShare ?? openWhatsAppShare)(texto);
          }}
        >
          <Share2 className="h-4 w-4" /> Chamar o grupo no WhatsApp
        </button>
      )}

      {organizerHandover && (
        <div className="space-y-3">
          <button
            type="button"
            className="btn btn-ghost btn-sm border-base-content/20"
            aria-expanded={mostrarOrganizador}
            onClick={() => setMostrarOrganizador((atual) => !atual)}
          >
            <ShieldCheck className="h-4 w-4" /> Quem organiza
          </button>
          {mostrarOrganizador && (
            <SessionOrganizerPanel
              membros={organizerHandover.membros}
              currentUserId={organizerHandover.currentUserId}
              organizadorAtual={null}
              podeTransferir={organizerHandover.podeTransferir}
              onTransfer={organizerHandover.onTransfer}
              onClose={() => setMostrarOrganizador(false)}
            />
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-box border border-base-300 bg-base-200">
        <ul aria-label="Em quadra" className="divide-y divide-base-300">
          {confirmados.map((entry, indice) => (
            <Linha
              key={entry.entryId}
              entry={entry}
              marcador={`${indice + 1}`}
              players={players}
              board={board}
              api={api}
              corte={corte}
            />
          ))}
          {confirmados.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-base-content/50">
              Ninguém se inscreveu ainda. Seja o primeiro.
            </li>
          )}
        </ul>

        {reserva.length > 0 && (
          <>
            <p className="flex items-center gap-3 bg-base-300 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-warning">
              <span className="h-px flex-1 bg-warning/30" />
              Fim das {board.capacity} vagas
              <span className="h-px flex-1 bg-warning/30" />
            </p>
            <ul aria-label="Reserva" className="divide-y divide-base-300">
              {reserva.map((entry) => (
                <Linha
                  key={entry.entryId}
                  entry={entry}
                  marcador={`${entry.queuePosition ?? ''}º`}
                  players={players}
                  board={board}
                  api={api}
                  corte={corte}
                  reserva
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function Cabecalho({ nome, data }: { nome: string; data: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-base-content/60">
      <CalendarDays className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate font-semibold text-base-content/80">{nome}</span>
      {/* O separador pertence a data: quando ela cai para a linha de baixo, no
          celular, o ponto iria junto e ficaria pendurado no fim da linha. */}
      {data && (
        <span className="w-full sm:w-auto sm:before:mr-2 sm:before:content-['·']">
          {formatarData(data)}
        </span>
      )}
    </div>
  );
}

interface LinhaProps {
  entry: RegistrationBoardEntry;
  marcador: string;
  players: Player[];
  board: RegistrationBoard;
  api: RegistrationBoardApi;
  corte: RegistrationPendingCut | null;
  reserva?: boolean;
}

const Linha: React.FC<LinhaProps> = ({
  entry,
  marcador,
  players,
  board,
  api,
  corte,
  reserva = false,
}) => {
  const player = players.find((candidato) => candidato.cloudId === entry.playerId);
  const nome = player?.nome ?? 'Atleta da comunidade';
  const overall = player ? calculateGeneralOverall(player) : null;
  const posicao = player?.posicaoPrincipal ? POSITION_LABELS[player.posicaoPrincipal] : '--';
  const euMesmo = board.viewerPlayerId === entry.playerId;
  const pago = entry.paidAt !== null;
  const sai = corte?.demoted.includes(entry.playerId) ?? false;
  const entrasSaiTexto = sai
    ? 'Sai quando o corte for aplicado'
    : 'Entra quando o corte for aplicado';
  const entra = corte?.promoted.includes(entry.playerId) ?? false;

  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 ${euMesmo ? 'bg-primary/10' : ''} ${
        reserva ? 'opacity-80' : ''
      } ${sai ? 'opacity-50' : ''}`}
    >
      <span
        className={`w-8 shrink-0 font-mono text-sm font-black ${
          reserva ? 'text-warning' : 'text-base-content/55'
        }`}
      >
        {marcador}
      </span>
      <div className="min-w-0 flex-1">
        {/* O nome leva o espaco que sobrar e nunca some: com marca de corte, badge e tres botoes
            competindo na mesma linha, um flex sem piso comprime o nome ate zero no celular. */}
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-[4rem] flex-1 truncate font-bold text-base-content">{nome}</p>
          {pago && !board.viewerCanManage && (
            <Check className="h-4 w-4 shrink-0 text-success" aria-label={`${nome} pagou`} />
          )}
          {(sai || entra) && (
            <span
              title={entrasSaiTexto}
              className={`flex shrink-0 items-center gap-0.5 text-[10px] font-black uppercase ${
                sai ? 'text-warning' : 'text-success'
              }`}
            >
              {sai ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
              {sai ? 'sai' : 'entra'}
            </span>
          )}
          {euMesmo && (
            <span className="badge badge-primary badge-xs hidden shrink-0 font-bold uppercase sm:inline-flex">
              Você
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-wider text-base-content/50">
          {posicao}
          {player?.status.presencaFrequente && ' · Presença frequente'}
          {/* De onde a inscricao veio e assunto de quem organiza; para o atleta
              a linha ja carrega posicao e presenca, e um terceiro fato a quebra
              em duas no celular. */}
          {board.viewerCanManage &&
            entry.source === 'ORGANIZER_ADDED' &&
            ' · Incluído pela organização'}
        </p>
      </div>
      {/* No celular, quem organiza tem tres botoes por linha: o overall e a primeira coisa a sair,
          porque ali a pergunta e "pagou?", nao "quao bom e?". Para o atleta ele continua visivel. */}
      {overall !== null && (
        <div className={`shrink-0 text-right ${board.viewerCanManage ? 'hidden sm:block' : ''}`}>
          <p className="font-mono text-lg font-black leading-none text-secondary">{overall}</p>
          <p className="text-[8px] font-bold uppercase tracking-wider text-base-content/55">Over</p>
        </div>
      )}
      {board.viewerCanManage && (
        <button
          type="button"
          aria-label={pago ? `Desmarcar pagamento de ${nome}` : `Marcar como pago ${nome}`}
          className={`btn btn-sm btn-square ${
            pago ? 'btn-success' : 'btn-ghost text-base-content/60 hover:text-success'
          }`}
          disabled={api.busy}
          onClick={() => void api.markPaid(entry.playerId, !pago)}
        >
          {pago ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
        </button>
      )}
      {board.viewerCanManage && reserva && board.status !== 'LOCKED' && (
        <button
          type="button"
          aria-label={`Subir ao topo ${nome}`}
          className="btn btn-ghost btn-sm btn-square text-base-content/60 hover:text-primary"
          disabled={api.busy}
          onClick={() => void api.boostReserve(entry.playerId)}
        >
          <ChevronsUp className="h-4 w-4" />
        </button>
      )}
      {board.viewerCanManage && board.status !== 'LOCKED' && (
        <button
          type="button"
          aria-label={`Tirar da lista ${nome}`}
          className="btn btn-ghost btn-sm btn-square text-base-content/60 hover:text-error"
          disabled={api.busy}
          onClick={() => void api.removeAthlete(entry.playerId)}
        >
          <UserMinus className="h-4 w-4" />
        </button>
      )}
    </li>
  );
};

function BarraDoOrganizador({
  api,
  board,
  disponiveis,
}: {
  api: RegistrationBoardApi;
  board: RegistrationBoard;
  disponiveis: Player[];
}) {
  const prazoAtual = board.paymentDueAt ? board.paymentDueAt.slice(0, 16) : '';
  const [vagas, setVagas] = useState(String(board.capacity));
  const [escolhido, setEscolhido] = useState('');
  const [prazo, setPrazo] = useState(prazoAtual);

  useEffect(() => {
    setVagas(String(board.capacity));
  }, [board.capacity]);

  useEffect(() => {
    setPrazo(prazoAtual);
  }, [prazoAtual]);

  const confirmarVagas = () => {
    const numero = Number.parseInt(vagas, 10);
    if (!Number.isFinite(numero) || numero === board.capacity) {
      setVagas(String(board.capacity));
      return;
    }
    void api.changeCapacity(numero);
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-box border border-base-300 bg-base-200 p-4">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-base-content/50">
          Vagas
        </span>
        <input
          type="number"
          min={1}
          aria-label="Vagas"
          className="input input-bordered input-sm w-24 font-mono"
          value={vagas}
          disabled={api.busy || board.status === 'LOCKED'}
          onChange={(event) => setVagas(event.target.value)}
          onBlur={confirmarVagas}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-base-content/50">
          Prazo para pagar
        </span>
        <input
          type="datetime-local"
          aria-label="Prazo para pagar"
          className="input input-bordered input-sm font-mono"
          value={prazo}
          disabled={api.busy || board.status === 'LOCKED'}
          onChange={(event) => setPrazo(event.target.value)}
          onBlur={() => {
            if (prazo === prazoAtual) return;
            void api.setPaymentDue(prazo === '' ? null : prazo);
          }}
        />
      </label>

      <div className="flex min-w-[16rem] flex-1 items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-base-content/50">
            Incluir atleta
          </span>
          {/* Escolher e incluir sao dois passos: seta no select fechado dispara
              change no Chrome e no Firefox, e um passo so inscreveria quem o
              organizador apenas atravessou com o teclado. */}
          <select
            aria-label="Incluir atleta"
            className="select select-bordered select-sm w-full"
            value={escolhido}
            disabled={api.busy || disponiveis.length === 0 || board.status === 'LOCKED'}
            onChange={(event) => setEscolhido(event.target.value)}
          >
            <option value="">
              {disponiveis.length === 0 ? 'Todo mundo já está na lista' : 'Escolher atleta…'}
            </option>
            {disponiveis.map((player) => (
              <option key={player.id} value={player.cloudId}>
                {player.nome}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-sm btn-primary shrink-0"
          disabled={api.busy || !escolhido || board.status === 'LOCKED'}
          onClick={() => {
            if (!escolhido) return;
            const alvo = escolhido;
            setEscolhido('');
            void api.addAthlete(alvo);
          }}
        >
          <UserPlus className="h-4 w-4" /> Incluir
        </button>
      </div>

      {board.status !== 'LOCKED' && (
        <button
          type="button"
          className="btn btn-sm btn-ghost border-base-content/20"
          disabled={api.busy}
          onClick={() => void api.setOpen(board.status !== 'OPEN')}
        >
          {board.status === 'OPEN' ? (
            <>
              <Lock className="h-4 w-4" /> Fechar inscrição
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" /> Reabrir inscrição
            </>
          )}
        </button>
      )}
    </div>
  );
}
