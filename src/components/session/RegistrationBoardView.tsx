import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Clock3,
  DoorOpen,
  Lock,
  RefreshCw,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import type { Player, Position, RegistrationBoard, RegistrationBoardEntry } from '../../types';
import type { RegistrationBoardApi } from '../../hooks/useRegistrationBoard';
import { calculateGeneralOverall } from '../../logic/calculations';
import { EmptyState } from '../../ui/EmptyState';

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
  sessionName: string;
  sessionDate: string;
  canOpen?: boolean;
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
}: RegistrationBoardViewProps) {
  const { board, busy, error, loading } = api;

  if (!board && loading) {
    return (
      <section className="space-y-4" aria-busy>
        <Cabecalho nome={sessionName} data={sessionDate} />
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
        <Cabecalho nome={sessionName} data={sessionDate} />
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
        <Cabecalho nome={sessionName} data={sessionDate} />
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

  const situacao = situacaoDoAtleta(board);
  const Icone = situacao.icone;
  const livres = Math.max(0, board.capacity - board.confirmedCount);
  const aberta = board.status === 'OPEN';
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
      <div className={`rounded-box border p-5 transition-colors ${situacao.cor}`}>
        <Cabecalho nome={sessionName} data={sessionDate} />
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p
              role="status"
              className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-base-content"
            >
              <Icone className="h-5 w-5 shrink-0" />
              {situacao.titulo}
            </p>
            <p className="mt-1 text-sm text-base-content/70">{situacao.detalhe}</p>
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
            className="btn btn-ghost btn-sm min-h-[44px] shrink-0 border-error/30 sm:min-h-0"
            disabled={loading || busy}
            onClick={() => void api.reload()}
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
        </div>
      )}

      {board.viewerCanManage && (
        <BarraDoOrganizador api={api} board={board} disponiveis={disponiveis} />
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

function Cabecalho({ nome, data }: { nome: string; data: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-base-content/60">
      <CalendarDays className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate font-semibold text-base-content/80">{nome}</span>
      {/* O separador pertence a data: quando ela cai para a linha de baixo, no
          celular, o ponto iria junto e ficaria pendurado no fim da linha. */}
      <span className="w-full sm:w-auto sm:before:mr-2 sm:before:content-['·']">
        {formatarData(data)}
      </span>
    </div>
  );
}

interface LinhaProps {
  entry: RegistrationBoardEntry;
  marcador: string;
  players: Player[];
  board: RegistrationBoard;
  api: RegistrationBoardApi;
  reserva?: boolean;
}

const Linha: React.FC<LinhaProps> = ({ entry, marcador, players, board, api, reserva = false }) => {
  const player = players.find((candidato) => candidato.cloudId === entry.playerId);
  const overall = player ? calculateGeneralOverall(player) : null;
  const posicao = player?.posicaoPrincipal ? POSITION_LABELS[player.posicaoPrincipal] : '--';
  const euMesmo = board.viewerPlayerId === entry.playerId;

  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 ${euMesmo ? 'bg-primary/10' : ''} ${
        reserva ? 'opacity-80' : ''
      }`}
    >
      <span
        className={`w-8 shrink-0 font-mono text-sm font-black ${
          reserva ? 'text-warning' : 'text-base-content/55'
        }`}
      >
        {marcador}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-bold text-base-content">
            {player?.nome ?? 'Atleta da comunidade'}
          </p>
          {euMesmo && (
            <span className="badge badge-primary badge-xs font-bold uppercase">Você</span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-base-content/50">
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
      {overall !== null && (
        <div className="shrink-0 text-right">
          <p className="font-mono text-lg font-black leading-none text-secondary">{overall}</p>
          <p className="text-[8px] font-bold uppercase tracking-wider text-base-content/55">Over</p>
        </div>
      )}
      {board.viewerCanManage && board.status !== 'LOCKED' && (
        <button
          type="button"
          aria-label={`Tirar da lista ${player?.nome ?? 'atleta'}`}
          className="btn btn-ghost btn-sm btn-square min-h-[44px] min-w-[44px] text-base-content/60 hover:text-error sm:min-h-0 sm:min-w-0"
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
  const [vagas, setVagas] = useState(String(board.capacity));
  const [escolhido, setEscolhido] = useState('');

  useEffect(() => {
    setVagas(String(board.capacity));
  }, [board.capacity]);

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
          className="input input-bordered input-sm w-24 font-mono min-h-[44px] sm:min-h-0"
          value={vagas}
          disabled={api.busy || board.status === 'LOCKED'}
          onChange={(event) => setVagas(event.target.value)}
          onBlur={confirmarVagas}
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
            className="select select-bordered select-sm w-full min-h-[44px] sm:min-h-0"
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
          className="btn btn-sm btn-primary min-h-[44px] shrink-0 sm:min-h-0"
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
          className="btn btn-sm btn-ghost border-base-content/20 min-h-[44px] sm:min-h-0"
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
