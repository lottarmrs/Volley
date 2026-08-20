import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** Ícone do domínio, não de "vazio": mostra o que vai morar ali. */
  icon: LucideIcon;
  title: string;
  /** O que aparece aqui e por que importa. Uma ideia, sem repetir o título. */
  description: ReactNode;
  /** Ações e observações. Fica abaixo da descrição, na ordem que o chamador montar. */
  children?: ReactNode;
  /** `compact` para painéis dentro de abas, onde o título da região já foi dado. */
  size?: 'default' | 'compact';
  className?: string;
}

/**
 * Painel de primeiro uso: a porta de entrada de uma área ainda sem conteúdo.
 *
 * Não serve para busca sem resultado nem para falha de carregamento — esses
 * estados têm outra mensagem e outra saída, e tratá-los com este painel faz o
 * app convidar a criar algo que já existe.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  size = 'default',
  className = '',
}: EmptyStateProps) {
  const compact = size === 'compact';

  return (
    <div className={`card card-border bg-base-200 border-base-300 shadow-card ${className}`}>
      <div className={`card-body ${compact ? 'gap-5 p-6' : 'gap-6 p-6 sm:p-8'}`}>
        <span
          className={`flex items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary ${
            compact ? 'h-11 w-11' : 'h-12 w-12'
          }`}
        >
          <Icon className={compact ? 'h-5 w-5' : 'h-6 w-6'} />
        </span>

        <div className="space-y-3">
          <h2
            className={`font-black uppercase tracking-tight text-white ${
              compact ? 'text-lg' : 'text-xl sm:text-2xl'
            }`}
          >
            {title}
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-base-content/70">{description}</p>
        </div>

        {children}
      </div>
    </div>
  );
}
