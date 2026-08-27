import React, { useState, useCallback } from 'react';
import { Star } from 'lucide-react';

export interface StarRatingProps {
  value: number; // 0 to 5
  onChange?: (val: number) => void;
  precision?: 0.5 | 1;
  readOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  id?: string;
}

const RATING_LABELS: Record<number, string> = {
  0.5: 'Iniciante -',
  1: 'Iniciante / Recreativo',
  1.5: 'Em Evolução',
  2: 'Abaixo da Média',
  2.5: 'Regular -',
  3: 'Regular / Mediano',
  3.5: 'Bom / Competitivo',
  4: 'Avançado',
  4.5: 'Muito Bom +',
  5: 'Destaque / Nível Seleção',
};

export function getStarLabelText(value: number): string {
  if (value <= 0) return 'Não Avaliado';
  const rounded = Math.round(value * 2) / 2;
  return RATING_LABELS[rounded] ?? `${rounded} Estrelas`;
}

export function StarRating({
  value,
  onChange,
  precision = 0.5,
  readOnly = false,
  size = 'md',
  showLabel = true,
  id,
}: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  const activeValue = hoverValue ?? value;

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  // Fixed widths for the label container to guarantee ZERO layout shifts / reflows on hover
  const labelWidths = {
    sm: 'w-[190px] sm:w-[205px]',
    md: 'w-[210px] sm:w-[235px]',
    lg: 'w-[240px] sm:w-[270px]',
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>, starIndex: number) => {
    if (readOnly || !onChange) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const isLeftHalf = event.clientX - rect.left < rect.width / 2;
    const nextVal = precision === 0.5 && isLeftHalf ? starIndex - 0.5 : starIndex;

    setHoverValue((prev) => (prev === nextVal ? prev : nextVal));
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>, starIndex: number) => {
    if (readOnly || !onChange) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const isLeftHalf = event.clientX - rect.left < rect.width / 2;
    const selected = precision === 0.5 && isLeftHalf ? starIndex - 0.5 : starIndex;
    onChange(selected);
  };

  const handleMouseLeaveContainer = useCallback(() => {
    if (!readOnly) {
      setHoverValue(null);
    }
  }, [readOnly]);

  return (
    <div id={id} className="inline-flex items-center gap-3 select-none shrink-0">
      {/* Stars Container - fixed dimensions, zero layout shift */}
      <div
        className="flex items-center gap-1 shrink-0"
        onMouseLeave={handleMouseLeaveContainer}
      >
        {[1, 2, 3, 4, 5].map((starIndex) => {
          const fillAmount = Math.max(0, Math.min(1, activeValue - (starIndex - 1)));
          const isFull = fillAmount >= 1;
          const isHalf = fillAmount > 0 && fillAmount < 1;

          return (
            <div
              key={starIndex}
              className={`relative ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
              onMouseMove={(e) => handleMouseMove(e, starIndex)}
              onClick={(e) => handleClick(e, starIndex)}
              role={readOnly ? undefined : 'button'}
              tabIndex={readOnly ? undefined : 0}
              aria-label={`${starIndex} estrelas`}
            >
              {/* Background empty star */}
              <Star className={`${iconSizes[size]} text-base-content/20 stroke-1 fill-transparent pointer-events-none`} />

              {/* Foreground filled/half star */}
              {(isFull || isHalf) && (
                <div
                  className="absolute top-0 left-0 overflow-hidden pointer-events-none"
                  style={{ width: isFull ? '100%' : '50%' }}
                >
                  <Star
                    className={`${iconSizes[size]} text-warning fill-warning stroke-warning pointer-events-none`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showLabel && (
        <span
          className={`text-xs font-bold uppercase tracking-wider text-warning/90 ${labelWidths[size]} truncate shrink-0`}
        >
          {getStarLabelText(activeValue)}
        </span>
      )}
    </div>
  );
}
