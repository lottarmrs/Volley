import { Share2, Copy, Award } from 'lucide-react';
import { TournamentAwards, AwardWinner } from '../../logic/tournament';
import { formatTournamentAwardsForWhatsApp } from '../../logic/exporters';
import { openWhatsAppShare, copyToClipboard } from '../../logic/exporters';

interface AwardsPanelProps {
  awards: TournamentAwards;
  sessionName: string;
  /** Título do bloco (ex.: "Premiação" ou "Premiação Parcial"). */
  title?: string;
}

const CATEGORIES: { key: keyof TournamentAwards; emoji: string; label: string }[] = [
  { key: 'mvp', emoji: '🏆', label: 'MVP' },
  { key: 'attack', emoji: '💥', label: 'Melhor Ataque' },
  { key: 'block', emoji: '🧱', label: 'Melhor Bloqueio' },
  { key: 'serve', emoji: '🎯', label: 'Melhor Saque' },
  { key: 'setter', emoji: '🪄', label: 'Melhor Levantador' },
  { key: 'defense', emoji: '🛡️', label: 'Melhor Defesa' },
  { key: 'reception', emoji: '🤲', label: 'Melhor Passe' },
];

export const AwardsPanel = ({ awards, sessionName, title = 'Premiação' }: AwardsPanelProps) => {
  const hasAny = CATEGORIES.some((c) => awards[c.key]);

  const share = () => openWhatsAppShare(formatTournamentAwardsForWhatsApp({ sessionName, awards }));
  const copy = async () => {
    const ok = await copyToClipboard(formatTournamentAwardsForWhatsApp({ sessionName, awards }));
    if (ok) alert('Premiação copiada!');
  };

  return (
    <div className="card card-border bg-base-200 overflow-hidden">
      <div className="p-4 bg-base-300/40 border-b border-base-300 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="w-3.5 h-3.5 text-accent" />
          <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">{title}</h4>
        </div>
        {hasAny && (
          <div className="flex gap-1.5">
            <button
              onClick={share}
              title="Compartilhar premiação"
              className="btn btn-xs bg-[#25D366]/20 text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/30"
            >
              <Share2 className="w-3 h-3" />
            </button>
            <button onClick={copy} title="Copiar premiação" className="btn btn-xs btn-outline">
              <Copy className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {hasAny ? (
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CATEGORIES.map(({ key, emoji, label }) => {
            const w = awards[key] as AwardWinner | undefined;
            const isMvp = key === 'mvp';
            return (
              <div
                key={key}
                className={`flex items-center justify-between p-2.5 rounded-xl border ${
                  isMvp
                    ? 'bg-accent/10 border-accent/30 sm:col-span-2'
                    : 'bg-base-100/50 border-base-300'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base shrink-0">{emoji}</span>
                  <div className="min-w-0">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-base-content/50 leading-none">
                      {label}
                    </p>
                    <p
                      className={`text-xs font-bold truncate ${isMvp ? 'text-accent' : 'text-base-content'}`}
                    >
                      {w ? w.playerName : '—'}
                    </p>
                  </div>
                </div>
                {w && (
                  <div className="text-right shrink-0 pl-2">
                    <span className="font-mono text-sm font-bold text-accent">{w.value}</span>
                    {w.teamName && (
                      <p className="text-[7px] uppercase text-base-content/40 truncate max-w-[70px]">
                        {w.teamName}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-6 text-center text-[10px] italic uppercase text-base-content/40">
          Sem dados suficientes para a premiação ainda.
        </div>
      )}
    </div>
  );
};
