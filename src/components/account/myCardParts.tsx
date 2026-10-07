import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import type { MyCard } from '@app/myCards';
import type { Achievement, EditionEntry, VutCard } from '@logic/futCards';
import { DURATION, EASE_ARRIVE } from '@ui/motion';
import { FutCard } from '../player/FutCard';
import {
  CARTA_A,
  CARTA_L,
  RARIDADE,
  SILHUETAS,
  TOM_DA_EDICAO,
  faltam,
  formatarData,
  progresso,
} from './myCardTones';

export const CartaNaEscala: React.FC<{
  card: VutCard;
  escala: number;
  nodeRef?: React.Ref<HTMLDivElement>;
}> = ({ card, escala, nodeRef }) => (
  <div className="relative" style={{ width: CARTA_L * escala, height: CARTA_A * escala }}>
    <div
      ref={nodeRef}
      style={{
        width: CARTA_L,
        height: CARTA_A,
        transform: `scale(${escala})`,
        transformOrigin: 'top left',
      }}
    >
      <FutCard card={card} />
    </div>
  </div>
);

export const Selo: React.FC<{
  conquista: Achievement;
  estado: 'desbloqueada' | 'perto' | 'bloqueada';
  ordem: number;
  aberto: boolean;
  onAbrir: () => void;
}> = ({ conquista, estado, ordem, aberto, onAbrir }) => {
  const cor = RARIDADE[conquista.rarity].cor;
  const situacao =
    estado === 'desbloqueada'
      ? 'desbloqueada'
      : estado === 'perto'
        ? faltam(conquista)
        : 'bloqueada';
  return (
    <motion.button
      type="button"
      aria-expanded={aberto}
      onClick={onAbrir}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: DURATION.feedback,
        ease: EASE_ARRIVE,
        delay: Math.min(ordem * 0.02, 0.15),
      }}
      className={`relative flex min-h-[7.5rem] flex-col items-center justify-center gap-2 rounded-[14px] border px-2 pb-3 pt-3 text-center outline-offset-2 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary ${
        estado === 'bloqueada'
          ? 'border-dashed border-white/12 bg-[#101216] hover:border-white/25'
          : 'border-white/10 bg-base-200 hover:border-white/25'
      } ${aberto ? 'border-white/40!' : ''}`}
      style={
        estado === 'desbloqueada'
          ? {
              borderColor: `color-mix(in srgb, ${cor} ${aberto ? 90 : 55}%, transparent)`,
              background: `radial-gradient(90% 70% at 50% 0%, color-mix(in srgb, ${cor} 24%, transparent), transparent 72%), #14171c`,
            }
          : undefined
      }
    >
      <span
        aria-hidden
        className="text-[2.25rem] leading-none"
        style={
          estado === 'bloqueada'
            ? { filter: 'grayscale(1) brightness(0) invert(1)', opacity: 0.16 }
            : estado === 'perto'
              ? { filter: 'grayscale(0.85)', opacity: 0.7 }
              : { filter: `drop-shadow(0 4px 10px color-mix(in srgb, ${cor} 45%, transparent))` }
        }
      >
        {conquista.emoji}
      </span>
      <span
        className={`line-clamp-2 text-[0.75rem] font-bold leading-tight ${
          estado === 'bloqueada' ? 'text-white/60' : 'text-white'
        }`}
      >
        {conquista.name}
      </span>
      {estado === 'perto' ? (
        <span className="mt-auto flex w-full flex-col gap-1 px-1">
          <span className="font-mono text-[0.6875rem] leading-none" style={{ color: cor }}>
            {situacao}
          </span>
          <span className="h-1 overflow-hidden rounded-full bg-white/10">
            <span
              className="block h-full rounded-full"
              style={{ width: `${progresso(conquista)}%`, background: cor }}
            />
          </span>
        </span>
      ) : (
        <span className="sr-only">{situacao}</span>
      )}
    </motion.button>
  );
};

export const Regra: React.FC<{ conquista: Achievement; estado: string }> = ({
  conquista,
  estado,
}) => {
  const { nome, cor } = RARIDADE[conquista.rarity];
  return (
    <div className="col-span-full flex gap-4 rounded-[14px] border border-white/12 bg-base-300 p-4">
      <span aria-hidden className="text-4xl leading-none">
        {conquista.emoji}
      </span>
      <div className="min-w-0">
        <p className="text-base font-black leading-tight text-white">{conquista.name}</p>
        <p className="mt-1 max-w-prose text-sm leading-snug text-white/75">
          {conquista.description}
        </p>
        <p
          className="mt-2 font-mono text-[0.6875rem] uppercase tracking-[0.12em]"
          style={{ color: cor }}
        >
          {estado === 'desbloqueada'
            ? `${nome} · moldura ${conquista.frame.name}`
            : estado === 'perto'
              ? `${Math.floor(conquista.current)}/${conquista.target} · ${faltam(conquista)}`
              : `${nome} · bloqueada`}
        </p>
      </div>
    </div>
  );
};

export const Album: React.FC<{ carta: MyCard; colunas: number }> = ({ carta, colunas }) => {
  const [aberto, setAberto] = useState<string | null>(null);
  const { unlocked, near, locked } = carta.achievements;
  const total = unlocked.length + near.length + locked.length;
  const selos = [
    ...unlocked.map((c) => ({ conquista: c, estado: 'desbloqueada' as const })),
    ...near.map((c) => ({ conquista: c, estado: 'perto' as const })),
    ...locked.map((c) => ({ conquista: c, estado: 'bloqueada' as const })),
  ];
  const posicao = selos.findIndex((s) => s.conquista.id === aberto);
  const fimDaLinha =
    posicao < 0
      ? -1
      : Math.min(selos.length - 1, Math.floor(posicao / colunas) * colunas + colunas - 1);
  const grade = { gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` };

  return (
    <section
      aria-label="Álbum de conquistas"
      aria-busy={carta.loading ? true : undefined}
      data-sem-giro
      className="mt-14"
    >
      <div className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-3">
        <h3 className="text-[1.75rem] font-black uppercase italic leading-none tracking-[-0.03em]">
          Álbum
        </h3>
        {!carta.loading && (
          <span className="font-mono text-sm text-white/70 tabular-nums">
            {unlocked.length} de {total}
          </span>
        )}
      </div>
      {carta.loading ? (
        <div className="mt-4 grid gap-2" style={grade}>
          {Array.from({ length: colunas * 2 }, (_, i) => (
            <span
              key={i}
              className="min-h-[7.5rem] rounded-[14px] bg-base-200 motion-safe:animate-pulse"
            />
          ))}
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm text-white/65">Toque num selo para ver a regra.</p>
          <div className="mt-4 grid gap-2" style={grade}>
            {selos.map(({ conquista, estado }, i) => (
              <React.Fragment key={conquista.id}>
                <Selo
                  conquista={conquista}
                  estado={estado}
                  ordem={i}
                  aberto={aberto === conquista.id}
                  onAbrir={() =>
                    setAberto((atual) => (atual === conquista.id ? null : conquista.id))
                  }
                />
                {i === fimDaLinha && posicao >= 0 && (
                  <Regra conquista={selos[posicao].conquista} estado={selos[posicao].estado} />
                )}
              </React.Fragment>
            ))}
          </div>
        </>
      )}
    </section>
  );
};

export const EdicaoAberta: React.FC<{
  carta: MyCard;
  entrada: EditionEntry;
  reduzir: boolean;
  onFechar: () => void;
}> = ({ carta, entrada, reduzir, onFechar }) => {
  const fecharRef = useRef<HTMLButtonElement>(null);
  const tom = TOM_DA_EDICAO[entrada.edition.kind] ?? '#f97316';
  const data = formatarData(entrada.date);
  const [escala, setEscala] = useState(1);

  useEffect(() => {
    const anterior = document.activeElement;
    fecharRef.current?.focus();
    const medir = () => setEscala(Math.max(0.6, Math.min(1, (window.innerHeight - 220) / CARTA_A)));
    medir();
    window.addEventListener('resize', medir);
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onFechar();
    };
    document.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('resize', medir);
      document.removeEventListener('keydown', tecla);
      if (anterior instanceof HTMLElement && document.contains(anterior)) anterior.focus();
    };
  }, [onFechar]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0c0e]/85 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: DURATION.state, ease: EASE_ARRIVE }}
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) onFechar();
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`${entrada.edition.label} de ${data}`}
        className="relative flex w-full max-w-sm flex-col items-center gap-5 rounded-3xl border border-white/10 bg-base-200 px-5 pb-6 pt-14 shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
        initial={reduzir ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: DURATION.state, ease: EASE_ARRIVE }}
      >
        <button
          ref={fecharRef}
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full text-white/80 outline-offset-2 transition-colors duration-150 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        <CartaNaEscala card={{ ...carta.card, edition: entrada.edition }} escala={escala} />
        <div className="text-center">
          <p
            className="text-[1.75rem] font-black uppercase italic leading-none tracking-[-0.03em]"
            style={{ color: tom }}
          >
            {entrada.edition.label}
          </p>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.16em] text-white/70">
            noite de {data} · {carta.community.name}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
};

export const Colecao: React.FC<{ carta: MyCard; onAbrir: (entrada: EditionEntry) => void }> = ({
  carta,
  onAbrir,
}) => {
  const { editions } = carta;
  return (
    <section
      aria-label="Coleção de edições"
      aria-busy={carta.loading ? true : undefined}
      data-sem-giro
      className="mt-14"
    >
      <div className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-3">
        <h3 className="text-[1.75rem] font-black uppercase italic leading-none tracking-[-0.03em]">
          Edições
        </h3>
        {!carta.loading && (
          <span className="font-mono text-sm text-white/70 tabular-nums">{editions.length}</span>
        )}
      </div>
      {carta.loading ? (
        <div className="mt-5 flex gap-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="vut-card-shield h-[9.7rem] w-[6.8rem] bg-base-200 motion-safe:animate-pulse"
            />
          ))}
        </div>
      ) : editions.length === 0 ? (
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
          <div aria-hidden className="flex gap-3">
            {SILHUETAS.map((s) => (
              <span
                key={s.nome}
                className="vut-card-shield block h-[6.9rem] w-[4.85rem] p-[1.5px]"
                style={{ background: `color-mix(in srgb, ${s.tom} 30%, transparent)` }}
              >
                <span className="vut-card-shield flex h-full w-full items-end justify-center bg-[#101216] pb-4">
                  <span
                    className="font-mono text-[0.625rem] uppercase tracking-[0.14em]"
                    style={{ color: `color-mix(in srgb, ${s.tom} 70%, #ffffff)` }}
                  >
                    {s.nome}
                  </span>
                </span>
              </span>
            ))}
          </div>
          <p className="max-w-[36ch] text-sm leading-relaxed text-white/75">
            <span className="block font-bold text-white">Nenhuma edição especial ainda</span>
            Sai MVP, Maestro ou Muralha numa noite — e a carta daquela noite fica aqui.
          </p>
        </div>
      ) : (
        <ul className="-mx-4 mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 [scrollbar-color:rgba(255,255,255,0.2)_transparent] [scrollbar-width:thin]">
          {editions.map((entrada) => {
            const tom = TOM_DA_EDICAO[entrada.edition.kind] ?? '#f97316';
            const data = formatarData(entrada.date);
            return (
              <li key={entrada.sessionId} className="shrink-0 snap-start">
                <button
                  type="button"
                  onClick={() => onAbrir(entrada)}
                  aria-label={`${entrada.edition.label} · noite de ${data}`}
                  className="group flex flex-col items-center gap-2 rounded-xl p-1 outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span className="block transition-transform duration-150 ease-out group-hover:-translate-y-1 motion-reduce:transform-none">
                    <CartaNaEscala
                      card={{ ...carta.card, edition: entrada.edition }}
                      escala={0.42}
                    />
                  </span>
                  <span
                    className="text-[0.75rem] font-black uppercase italic tracking-[0.02em]"
                    style={{ color: tom }}
                  >
                    {entrada.edition.label}
                  </span>
                  <span className="-mt-1.5 font-mono text-[0.6875rem] text-white/70 tabular-nums">
                    {data}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
