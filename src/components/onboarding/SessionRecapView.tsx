import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import { CloudUpload, Crown, HardDrive, Medal, Volleyball } from 'lucide-react';
import type { SessionRecap } from '@app/sessionRecap';
import { paths } from '@app/appRoutes';

interface SessionRecapViewProps {
  recap: SessionRecap | null;
  isGuest: boolean;
  communityId: string | null;
}

const MEDAL_TONE = ['text-warning', 'text-base-content/70', 'text-accent'];

function formatDate(date: string): string {
  const parsed = new Date(`${date.split('T')[0]}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  const formatted = parsed.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
  // Só a primeira letra: `capitalize` do CSS transformaria "quarta-feira, 19 de
  // agosto" em "Quarta-Feira, 19 De Agosto".
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function Numeral({ children }: { children: ReactNode }) {
  return <span className="font-mono font-bold text-white">{children}</span>;
}

export function SessionRecapView({ recap, isGuest, communityId }: SessionRecapViewProps) {
  const reduceMotion = useReducedMotion();

  if (!recap) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-start gap-6 py-16">
        <h2 className="text-2xl font-black uppercase tracking-tight text-white">
          Nenhuma pelada encerrada ainda
        </h2>
        <p className="text-sm leading-relaxed text-base-content/70">
          Quando você encerrar uma sessão, o resumo dela aparece aqui: quem venceu, quem pontuou e o
          que cada atleta levou para o card.
        </p>
        <Link
          to={paths.painel}
          className="btn btn-primary min-h-[48px] px-6 font-black uppercase tracking-wider"
        >
          Voltar para o painel
        </Link>
      </div>
    );
  }

  const rise = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
      };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10 py-8">
      <motion.header {...rise} className="space-y-3">
        <h2 className="text-3xl font-black uppercase leading-[1.05] tracking-tight text-white sm:text-4xl">
          {recap.sessionName}
        </h2>
        <p className="text-sm text-base-content/60">Encerrada • {formatDate(recap.date)}</p>
        <p className="max-w-prose text-base leading-relaxed text-base-content/80">
          Foram <Numeral>{recap.totalGames}</Numeral>{' '}
          {recap.totalGames === 1 ? 'partida' : 'partidas'} e <Numeral>{recap.totalPoints}</Numeral>{' '}
          {recap.totalPoints === 1 ? 'ponto' : 'pontos'} entre{' '}
          <Numeral>{recap.totalPlayers}</Numeral> {recap.totalPlayers === 1 ? 'atleta' : 'atletas'}.
        </p>
      </motion.header>

      {recap.champion && (
        <motion.section
          {...rise}
          transition={reduceMotion ? undefined : { ...rise.transition, delay: 0.08 }}
          className="flex items-center gap-4 rounded-2xl border border-accent/25 bg-accent/10 p-5 shadow-card"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-accent">
            <Crown className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-accent">Campeão do dia</p>
            <p className="truncate text-xl font-black uppercase tracking-tight text-white">
              {recap.champion.teamName}
            </p>
            <p className="text-xs text-base-content/70">
              <span className="font-mono font-bold text-white">
                {recap.champion.wins}V — {recap.champion.losses}D
              </span>{' '}
              • saldo{' '}
              <span className="font-mono font-bold text-white">
                {recap.champion.pointDifference > 0 ? '+' : ''}
                {recap.champion.pointDifference}
              </span>
            </p>
          </div>
        </motion.section>
      )}

      {recap.highlights.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-black uppercase tracking-tight text-white">
            Quem decidiu a pelada
          </h2>
          <ul className="flex flex-col gap-2">
            {recap.highlights.map((highlight, index) => (
              <li
                key={highlight.playerId}
                className="flex items-center gap-4 rounded-xl border border-base-300 bg-base-200 p-4"
              >
                <Medal
                  className={`h-5 w-5 shrink-0 ${MEDAL_TONE[index] ?? 'text-base-content/70'}`}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-extrabold uppercase tracking-wide text-white">
                  {highlight.playerName}
                </span>
                <span className="shrink-0 font-mono text-sm font-bold text-white">
                  {highlight.totalPoints}
                  <span className="ml-1 text-xs font-medium text-base-content/50">pts</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isGuest ? (
        <section className="space-y-5 rounded-2xl border border-primary/25 bg-base-200 p-6 shadow-card">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
              <CloudUpload className="h-5 w-5" />
            </span>
            <div className="space-y-2">
              <h2 className="text-lg font-black uppercase leading-tight tracking-tight text-white">
                Essa pelada existe só neste aparelho
              </h2>
              <p className="max-w-prose text-sm leading-relaxed text-base-content/70">
                Trocou de celular, limpou o navegador ou passou o app para outra pessoa da
                organização e acabou: o histórico, o ranking e os cards somem junto. Com uma conta,
                tudo isso vira da pelada, não do aparelho — e o grupo inteiro passa a ver o mesmo
                placar.
              </p>
            </div>
          </div>

          <div className="flex gap-3 rounded-xl border border-base-300 bg-base-300/40 p-4">
            <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p className="text-xs leading-relaxed text-base-content/70">
              Nada se perde na troca: os <Numeral>{recap.totalPlayers}</Numeral> atletas, esta
              sessão e o histórico que você já montou sobem junto no primeiro login.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              to="/cadastro"
              className="btn btn-primary min-h-[48px] flex-1 px-6 font-black uppercase tracking-wider"
            >
              Criar conta grátis
            </Link>
            <Link
              to="/entrar"
              className="btn btn-outline min-h-[48px] flex-1 px-6 font-bold uppercase tracking-wider"
            >
              Já tenho conta
            </Link>
          </div>

          <Link
            to={paths.painel}
            className="btn btn-ghost min-h-[44px] w-fit px-3 text-xs font-bold uppercase tracking-wider text-base-content/60 hover:text-white"
          >
            Agora não, voltar para a pelada
          </Link>
        </section>
      ) : (
        <section className="flex flex-col gap-3 sm:flex-row">
          {communityId && (
            <Link
              to={paths.desempenho(communityId, { aba: 'ranking' })}
              className="btn btn-primary min-h-[48px] flex-1 gap-2 px-6 font-black uppercase tracking-wider"
            >
              <Volleyball className="h-5 w-5" />
              Ver o ranking atualizado
            </Link>
          )}
          <Link
            to={paths.painel}
            className="btn btn-outline min-h-[48px] flex-1 px-6 font-bold uppercase tracking-wider"
          >
            Voltar para o painel
          </Link>
        </section>
      )}
    </div>
  );
}
