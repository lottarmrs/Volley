import type { CareerEvent } from '@shared/types/career';
import { describeMilestone } from '../../logic/careerMilestones';

/** Linha do tempo de marcos. Excecao deliberada ao congelamento de UI do programa —
 *  ver docs/superpowers/specs/2026-07-27-career-events-vut-design.md, secao 3B. */
export function CareerTimeline({ events }: { events: CareerEvent[] }) {
  const milestones = events
    .filter((event) => event.type === 'milestone')
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  if (milestones.length === 0) {
    return (
      <p className="text-xs text-base-content/60 py-6 text-center">
        Nenhum marco de carreira ainda.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {milestones.map((event) => {
        const { label, emoji } = describeMilestone(event.payload.slug ?? '');
        return (
          <li
            key={event.id}
            className="flex items-center gap-3 p-2 rounded-lg bg-base-200 border border-base-300"
          >
            <span aria-hidden="true">{emoji}</span>
            <span className="text-sm font-semibold flex-1">{label}</span>
            <span className="text-[10px] font-mono text-base-content/50">
              {new Date(event.occurredAt).toLocaleDateString('pt-BR')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
