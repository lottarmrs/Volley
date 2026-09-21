import React from 'react';
import {
  BarChart3,
  FileText,
  Calendar,
  CheckCircle2,
  Circle,
  Lock,
  MessageCircle,
  Plus,
  Trophy,
  Users,
  Volleyball,
} from 'lucide-react';
import type { Community, Game, Player, PointEvent, Session, SessionReport } from '../../../types';
import { paths } from '@app/appRoutes';
import { getCommunitySummary } from '../../../logic/community';
import { formatCommunitySummaryText } from '../../../logic/shareFormatters';
import { ShareActions } from '../../share/ShareActions';
import { EmptyState } from '../../../ui/EmptyState';
import { GuardedLink } from '../../common/GuardedLink';

function formatDate(date?: string) {
  if (!date) return '-';
  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}

function formatFormat(type?: string) {
  return type === 'tournament' ? 'Campeonato' : 'Jogo Livre';
}

export function CommunityOverviewArea({
  community,
  players,
  sessions,
  games,
  pointEvents,
  sessionReports,
  onCreateSession,
  canCreateSession = true,
  canManageRoster = true,
}: {
  community: Community;
  players: Player[];
  sessions: Session[];
  games: Game[];
  pointEvents: PointEvent[];
  sessionReports: SessionReport[];
  onCreateSession: () => void;
  canCreateSession?: boolean;
  canManageRoster?: boolean;
}) {
  const summary = getCommunitySummary({
    community,
    players,
    sessions,
    games,
    pointEvents,
    sessionReports,
  });
  const text = formatCommunitySummaryText(community, summary);

  // Comunidade recém-criada: um painel de zeros e quatro "Sem dados" não contam
  // o que fazer. A ordem aqui é real — sem elenco não há sorteio.
  if (summary.totalAthletes === 0) {
    return <CommunityFirstRun community={community} canManageRoster={canManageRoster} />;
  }

  return (
    <div className="space-y-4">
      <div className="stats stats-vertical sm:stats-horizontal w-full bg-base-200">
        <div className="stat">
          <div className="stat-title">Atletas</div>
          <div className="stat-value">{summary.totalAthletes}</div>
          <div className="stat-desc">{summary.activeAthletes} ativos</div>
        </div>
        <div className="stat">
          <div className="stat-title">Sessões</div>
          <div className="stat-value">{summary.totalSessions}</div>
          <div className="stat-desc">{summary.totalMatches} partidas</div>
        </div>
        <div className="stat">
          <div className="stat-title">Pontos</div>
          <div className="stat-value">{summary.totalPoints}</div>
          <div className="stat-desc">registrados</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <InfoCard
          title="Última sessão"
          value={
            summary.lastSession
              ? `${summary.lastSession.name} - ${formatDate(summary.lastSession.date)}`
              : 'Sem sessões'
          }
          icon={<Calendar className="w-4 h-4" />}
        />
        <InfoCard
          title="Último MVP"
          value={summary.lastMvpName || 'Sem MVP'}
          icon={<Trophy className="w-4 h-4" />}
        />
        <InfoCard
          title="Atleta frequente"
          value={summary.mostFrequentPlayerName || 'Sem dados'}
          icon={<Users className="w-4 h-4" />}
        />
        <InfoCard
          title="Formato mais usado"
          value={
            summary.mostUsedFormat
              ? formatFormat(summary.mostUsedFormat)
              : formatFormat(community.defaultFormat)
          }
          icon={<BarChart3 className="w-4 h-4" />}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onCreateSession}
          disabled={!canCreateSession}
          className="btn btn-primary btn-block"
        >
          <Plus className="w-4 h-4" /> Criar sessão
        </button>
        <GuardedLink to={paths.listaWhatsapp(community.id)} className="btn btn-outline btn-block">
          <FileText className="w-4 h-4" /> Lista WhatsApp
        </GuardedLink>
        <ShareActions
          title={community.name}
          text={text}
          variant="buttons"
          copyLabel="Copiar resumo"
          shareLabel="Compartilhar"
        />
      </div>
    </div>
  );
}

function CommunityFirstRun({
  community,
  canManageRoster,
}: {
  community: Community;
  canManageRoster: boolean;
}) {
  const passos = [
    {
      estado: 'feito' as const,
      titulo: `"${community.name}" criada`,
      detalhe: 'Nome e regras você ajusta a qualquer momento na aba Regras.',
    },
    {
      estado: 'agora' as const,
      titulo: 'Chamar o elenco',
      detalhe:
        'Cadastre quem joga com você. Os fundamentos de cada atleta alimentam o sorteio equilibrado.',
    },
    {
      estado: 'depois' as const,
      titulo: 'Marcar a primeira pelada',
      detalhe: 'Com elenco na mão, o sorteio monta os times e o placar entra no ar.',
    },
  ];

  return (
    <EmptyState
      icon={Volleyball}
      title="Sua comunidade está de pé"
      description="Falta o que faz ela existir: gente. Assim que o elenco entrar, o sorteio equilibrado, o placar ao vivo e o ranking passam a funcionar sozinhos."
    >
      <ol className="flex flex-col gap-3">
        {passos.map((passo) => (
          <li
            key={passo.titulo}
            className={`flex gap-3 rounded-xl border p-4 ${
              passo.estado === 'agora'
                ? 'border-primary/30 bg-primary/5'
                : 'border-base-300 bg-base-300/25'
            }`}
          >
            <span className="mt-0.5 shrink-0">
              {passo.estado === 'feito' ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : passo.estado === 'agora' ? (
                <Circle className="h-5 w-5 text-primary" />
              ) : (
                <Lock className="h-5 w-5 text-base-content/30" />
              )}
            </span>
            <div className="min-w-0 space-y-1">
              <p
                className={`text-sm font-bold uppercase tracking-wide ${
                  passo.estado === 'depois' ? 'text-base-content/45' : 'text-white'
                }`}
              >
                {passo.titulo}
              </p>
              <p className="text-xs leading-relaxed text-base-content/60">{passo.detalhe}</p>
            </div>
          </li>
        ))}
      </ol>

      <GuardedLink
        to={paths.pessoas(community.id)}
        className={`btn btn-primary min-h-[48px] w-fit gap-2 px-6 font-black uppercase tracking-wider ${
          canManageRoster ? '' : 'btn-disabled'
        }`}
      >
        <Users className="h-5 w-5" /> Cadastrar atletas
      </GuardedLink>
      {!canManageRoster && (
        <p className="text-xs leading-relaxed text-base-content/60">
          Seu papel nesta comunidade ainda não permite montar o elenco. Peça a quem administra.
        </p>
      )}
    </EmptyState>
  );
}

function InfoCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="card card-border bg-base-200">
      <div className="card-body p-4">
        <div className="flex items-center gap-2 text-base-content/60 text-xs uppercase font-bold">
          {icon}
          {title}
        </div>
        <p className="font-black uppercase">{value}</p>
      </div>
    </div>
  );
}
