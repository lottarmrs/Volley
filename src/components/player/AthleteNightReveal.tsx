import '@fontsource-variable/inter/wght-italic.css';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotionConfig } from 'motion/react';
import { ChevronLeft, ChevronRight, Share2, X } from 'lucide-react';
import type { AthleteNight } from '@app/athleteNight';
import type { Achievement, AchievementRarity, VutCard, VutTier } from '@logic/futCards';
import { shareCardImage } from '@logic/shareCardImage';
import { DURATION, EASE_ARRIVE } from '@ui/motion';
import { FutCard } from './FutCard';

export interface AthleteNightRevealProps {
  night: AthleteNight;
  communityName: string;
  sessionDate: string;
  onOpened: () => void;
  onClose: () => void;
  onViewCard: () => void;
}

type Capitulo = 'pacote' | 'carta' | 'numeros' | 'conquistas' | 'quase' | 'fim';

const CARTA_L = 260;
const CARTA_A = 370;

const TOM_DO_TIER: Record<VutTier, string> = {
  bronze: '#c58a5c',
  silver: '#b4c6d3',
  gold: '#e5bf45',
  elite: '#8b5cf6',
};

const TOM_DA_EDICAO: Record<string, string> = {
  mvp: '#f5c542',
  maestro: '#2dd4bf',
  muralha: '#f97316',
  in_form: '#c084fc',
};

const NOME_DO_TIER: Record<VutTier, string> = {
  bronze: 'Bronze',
  silver: 'Prata',
  gold: 'Ouro',
  elite: 'Elite',
};

const RARIDADE: Record<AchievementRarity, { nome: string; cor: string }> = {
  common: { nome: 'Comum', cor: '#d7ccc8' },
  uncommon: { nome: 'Incomum', cor: '#81c784' },
  rare: { nome: 'Rara', cor: '#64b5f6' },
  epic: { nome: 'Épica', cor: '#ce93d8' },
  legendary: { nome: 'Lendária', cor: '#ffb300' },
};

function tomDa(card: VutCard): string {
  if (card.edition.kind !== 'base') return TOM_DA_EDICAO[card.edition.kind] ?? '#f97316';
  return card.stats.rated ? TOM_DO_TIER[card.stats.tier] : '#8a8f98';
}

function formatarData(data: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  return partes ? `${partes[3]}.${partes[2]}.${partes[1]}` : data;
}

function faltam(conquista: Achievement): string {
  const resta = Math.ceil(conquista.target - conquista.current);
  if (resta <= 0) return 'Falta pouco';
  return resta === 1 ? 'Falta 1' : `Faltam ${resta}`;
}

function progresso(conquista: Achievement): number {
  const teto = conquista.unlocked ? 100 : 95;
  return Math.round(Math.min(teto, Math.max(0, (conquista.current / conquista.target) * 100)));
}

function useEscalaQueCabe(maxima: number) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [ajuste, setAjuste] = useState(1);
  useLayoutEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const medir = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      setAjuste(Math.max(0.4, Math.min(width / CARTA_L, height / CARTA_A)));
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [el]);
  return [setEl, Math.min(maxima, ajuste), ajuste] as const;
}

const Brasao: React.FC<{ tom: string }> = ({ tom }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={tom}
    strokeWidth={1.4}
    strokeLinejoin="round"
    className="w-[30cqw]"
    style={{ filter: `drop-shadow(0 0 10px ${tom})` }}
  >
    <path d="M12 2.5 4 5.2v5.9c0 4.9 3.6 9 8 10.4 4.4-1.4 8-5.5 8-10.4V5.2l-8-2.7Z" />
    <circle cx="12" cy="11.5" r="4.2" />
    <path d="M8.2 10.2c2.2.3 4.6 1.6 6.1 3.9M12.6 7.4c-.6 2.2-.3 4.9 1.5 7.4M7.9 12.6c1.6-1.7 4-2.8 6.9-2.6" />
  </svg>
);

const Pacote: React.FC<{
  tom: string;
  apelido: string;
  data: string;
  brilho?: boolean;
}> = ({ tom, apelido, data, brilho = true }) => (
  <div className="relative h-full w-full">
    {brilho && (
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-[12%] opacity-45 blur-3xl"
        style={{ background: `radial-gradient(closest-side, ${tom}, transparent)` }}
      />
    )}
    <div
      className="vut-card-shield relative h-full w-full p-[2px]"
      style={{
        background: `linear-gradient(180deg, ${tom} 0%, #1e222a 30%, #1e222a 72%, ${tom} 100%)`,
      }}
    >
      <div
        className="vut-card-shield relative flex h-full w-full flex-col items-center [container-type:inline-size]"
        style={{
          background: `repeating-linear-gradient(135deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 9px), radial-gradient(120% 55% at 50% 105%, color-mix(in srgb, ${tom} 32%, transparent), transparent 70%), linear-gradient(170deg, #1e222a 0%, #14171c 50%, #0b0c0e 100%)`,
        }}
      >
        <span className="mt-[12cqw] font-mono text-[3.4cqw] uppercase tracking-[0.32em] text-white/60">
          Volley Ultimate Team
        </span>
        <span className="absolute inset-x-[10%] top-[22%] border-t-2 border-dashed border-white/20" />
        <div className="absolute inset-x-0 top-[33%] flex flex-col items-center">
          <Brasao tom={tom} />
          <span className="mt-[7cqw] max-w-[80%] truncate text-[9cqw] font-black uppercase italic leading-none tracking-[-0.03em] text-white">
            {apelido}
          </span>
          <span className="mt-[3cqw] font-mono text-[3.6cqw] tracking-[0.2em] text-white/60">
            {data}
          </span>
        </div>
      </div>
    </div>
  </div>
);

const CartaNaEscala: React.FC<{
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

const Feixes: React.FC<{ tom: string; animar: boolean }> = ({ tom, animar }) => (
  <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
    {[
      { left: '18%', rotate: 16, opacity: 0.5 },
      { left: '50%', rotate: 0, opacity: 0.75 },
      { left: '82%', rotate: -16, opacity: 0.5 },
    ].map((feixe, i) => (
      <motion.div
        key={i}
        className="absolute top-0 h-full w-[52%] origin-top blur-xl"
        style={{
          left: feixe.left,
          x: '-50%',
          rotate: feixe.rotate,
          clipPath: 'polygon(44% 0, 56% 0, 100% 100%, 0 100%)',
          background: `linear-gradient(180deg, color-mix(in srgb, ${tom} 35%, rgba(255,255,255,0.32)) 0%, transparent 82%)`,
          maskImage: 'linear-gradient(180deg, transparent 0%, #0b0c0e 18%)',
        }}
        initial={animar ? { opacity: 0, scaleY: 0.4 } : false}
        animate={{ opacity: feixe.opacity, scaleY: 1 }}
        transition={{ duration: DURATION.focal, ease: EASE_ARRIVE, delay: 0.25 + i * 0.06 }}
      />
    ))}
  </div>
);

const Casa: React.FC<{ rotulo: string; valor: string; ordem: number; reduzir: boolean }> = ({
  rotulo,
  valor,
  ordem,
  reduzir,
}) => {
  const grande = valor.replace('.', '').length <= 2;
  return (
    <div className="flex flex-col justify-between gap-4 bg-base-200 p-4">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
        {rotulo}
      </span>
      <span className="sr-only">{valor}</span>
      <span aria-hidden className="flex items-end gap-1 [perspective:420px]">
        {valor.split('').map((c, i) =>
          c === '.' ? (
            <span
              key={i}
              data-c="."
              className="noite-flap w-3 text-center font-mono text-4xl font-bold leading-none text-white/80"
            />
          ) : (
            <motion.span
              key={i}
              data-c={c}
              className={`noite-flap relative grid place-items-center rounded-md bg-base-300 font-mono font-bold ${grande ? 'h-20 w-14 text-[3.25rem]' : 'h-16 w-10 text-[2.5rem]'} leading-none text-white tabular-nums shadow-[0_6px_14px_rgba(0,0,0,0.45)] after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-black/60`}
              initial={reduzir ? { opacity: 0 } : { opacity: 0, rotateX: -90 }}
              animate={reduzir ? { opacity: 1 } : { opacity: 1, rotateX: 0 }}
              transition={{
                duration: DURATION.overlay,
                ease: EASE_ARRIVE,
                delay: 0.12 + ordem * 0.08 + i * 0.04,
              }}
            />
          ),
        )}
      </span>
    </div>
  );
};

export const AthleteNightReveal: React.FC<AthleteNightRevealProps> = ({
  night,
  communityName,
  sessionDate,
  onOpened,
  onClose,
  onViewCard,
}) => {
  const [noite] = useState(() => night);
  const reduzir = !!useReducedMotionConfig();
  const [indice, setIndice] = useState(0);
  const [direcao, setDirecao] = useState(1);
  const [acabouDeAbrir, setAcabouDeAbrir] = useState(false);
  const [compartilhando, setCompartilhando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const avisou = useRef(false);
  useEffect(() => {
    const anterior = document.activeElement;
    return () => {
      if (anterior instanceof HTMLElement && document.contains(anterior)) anterior.focus();
    };
  }, []);
  const abrirRef = useRef<HTMLButtonElement>(null);
  const proximoRef = useRef<HTMLButtonElement>(null);
  const compartilharRef = useRef<HTMLButtonElement>(null);
  const cartaRef = useRef<HTMLDivElement>(null);
  const [palcoRef, escalaPalco, ajustePalco] = useEscalaQueCabe(1);
  const escalaPacote = Math.min(1.2, ajustePalco * 0.96);
  const [fimRef, escalaFim] = useEscalaQueCabe(0.74);

  const { card } = noite;
  const tom = tomDa(card);
  const apelido = card.player.apelido || card.player.nome;
  const data = formatarData(sessionDate);

  const capitulos = useMemo<Capitulo[]>(
    () => [
      'pacote',
      'carta',
      'numeros',
      ...(noite.newAchievements.length > 0 ? (['conquistas'] as const) : []),
      ...(noite.nearAchievements.length > 0 ? (['quase'] as const) : []),
      'fim',
    ],
    [noite],
  );
  const ultimo = capitulos.length - 1;
  const capitulo = capitulos[indice];
  const aberto = indice > 0;

  const abrir = useCallback(() => {
    if (avisou.current) return;
    avisou.current = true;
    onOpened();
    setDirecao(1);
    setAcabouDeAbrir(true);
    setIndice(1);
  }, [onOpened]);

  const irPara = useCallback(
    (alvo: number) => {
      if (!avisou.current) return;
      const destino = Math.max(1, Math.min(ultimo, alvo));
      if (destino === indice) return;
      setDirecao(destino > indice ? 1 : -1);
      setAcabouDeAbrir(false);
      setIndice(destino);
    },
    [ultimo, indice],
  );

  const avancar = useCallback(() => irPara(indice + 1), [irPara, indice]);
  const voltar = useCallback(() => irPara(indice - 1), [irPara, indice]);

  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        onClose();
      } else if (evento.key === 'ArrowRight') {
        avancar();
      } else if (evento.key === 'ArrowLeft') {
        voltar();
      }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [avancar, voltar, onClose]);

  useEffect(() => {
    if (indice === 0) abrirRef.current?.focus({ preventScroll: true });
    else if (indice === ultimo) compartilharRef.current?.focus({ preventScroll: true });
    else if (indice === 1) proximoRef.current?.focus({ preventScroll: true });
  }, [indice, ultimo]);

  const tocarNoPalco = (evento: React.MouseEvent<HTMLDivElement>) => {
    if (!aberto) return;
    if ((evento.target as HTMLElement).closest('button, a')) return;
    const caixa = evento.currentTarget.getBoundingClientRect();
    if (evento.clientX - caixa.left < caixa.width / 2) voltar();
    else avancar();
  };

  const compartilhar = async () => {
    if (!cartaRef.current || compartilhando) return;
    setCompartilhando(true);
    setFalhou(false);
    try {
      await shareCardImage(cartaRef.current, card.player.nome);
    } catch (erro) {
      if (!(erro instanceof DOMException && erro.name === 'AbortError')) setFalhou(true);
    } finally {
      setCompartilhando(false);
    }
  };

  const tituloDoCapitulo: Record<Capitulo, string> = {
    pacote: 'Sua noite',
    carta: 'Sua carta',
    numeros: 'A noite em números',
    conquistas:
      noite.newAchievements.length === 1
        ? 'Conquista nova'
        : `${noite.newAchievements.length} conquistas novas`,
    quase: 'Quase lá',
    fim: 'Fim da noite',
  };

  const titulo = 'font-black uppercase italic leading-[1.08] tracking-[-0.03em] text-balance';
  const linhaDeApoio = 'mt-3 text-pretty text-sm leading-snug text-white/70';
  const entrada =
    acabouDeAbrir || indice === 0
      ? false
      : reduzir
        ? { opacity: 0 }
        : { opacity: 0, x: 28 * direcao };

  const nota = noite.rating === null ? '—' : noite.rating.toFixed(1);
  const especial = noite.specialEdition;
  const tier = NOME_DO_TIER[card.stats.tier];

  const apoioDaCarta = !card.stats.rated
    ? 'Ainda sem avaliação: o ? sai quando a comunidade te avaliar. Os números da noite contam do mesmo jeito.'
    : especial && noite.tierUp
      ? `Subiu de tier · ${tier} · geral ${card.stats.ovr}`
      : noite.tierUp
        ? `Agora ${tier} · geral ${card.stats.ovr}`
        : `${tier} · geral ${card.stats.ovr}`;

  const alturaDoTopo = 'calc(var(--noite-display) * 1.72 + 2.5rem)';

  const topo = (conteudo: React.ReactNode) => (
    <div
      className="relative flex shrink-0 flex-col justify-end px-4"
      style={{ height: alturaDoTopo }}
    >
      {conteudo}
    </div>
  );

  const renderCapitulo = () => {
    switch (capitulo) {
      case 'pacote':
        return (
          <>
            {topo(
              <>
                <h1 className="w-min text-balance text-[length:var(--noite-display)] font-black uppercase italic leading-[0.84] tracking-[-0.04em]">
                  Sua noite
                </h1>
                <p className="mt-3 truncate font-mono text-xs uppercase tracking-[0.18em] text-white/70">
                  {communityName} · {data}
                </p>
              </>,
            )}
            <div
              ref={palcoRef}
              className="relative flex min-h-0 flex-1 items-center justify-center"
            >
              <div
                aria-hidden
                onClick={abrir}
                className="cursor-pointer"
                style={{
                  width: CARTA_L * escalaPacote,
                  height: CARTA_A * escalaPacote,
                }}
              >
                <Pacote tom={tom} apelido={apelido} data={data} />
              </div>
            </div>
          </>
        );
      case 'carta': {
        return (
          <>
            <Feixes tom={tom} animar={acabouDeAbrir && !reduzir} />
            {topo(
              <motion.div
                initial={acabouDeAbrir ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: DURATION.overlay, ease: EASE_ARRIVE, delay: 0.45 }}
              >
                {especial ? (
                  <h2 className={`${titulo} text-[2.75rem] text-accent`}>
                    <span aria-hidden className="not-italic">
                      {card.edition.emoji}
                    </span>{' '}
                    {card.edition.label}
                  </h2>
                ) : (
                  <h2 className={`${titulo} text-[2.75rem]`}>
                    {noite.tierUp ? 'Subiu de tier' : 'Sua carta'}
                  </h2>
                )}
                <p className={linhaDeApoio}>{apoioDaCarta}</p>
              </motion.div>,
            )}
            <div
              ref={palcoRef}
              className="relative flex min-h-0 flex-1 items-center justify-center"
            >
              {acabouDeAbrir && !reduzir && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute"
                  style={{ width: CARTA_L * escalaPacote, height: CARTA_A * escalaPacote }}
                >
                  <motion.div
                    className="absolute inset-0"
                    style={{ clipPath: 'inset(0 0 78% 0)' }}
                    initial={{ y: 0, rotate: 0, opacity: 1 }}
                    animate={{ y: '-55%', rotate: -9, opacity: 0 }}
                    transition={{ duration: DURATION.focal, ease: EASE_ARRIVE }}
                  >
                    <Pacote tom={tom} apelido={apelido} data={data} brilho={false} />
                  </motion.div>
                  <motion.div
                    className="absolute inset-0"
                    style={{ clipPath: 'inset(22% 0 0 0)' }}
                    initial={{ y: 0, scale: 1, opacity: 1 }}
                    animate={{ y: '28%', scale: 0.94, opacity: 0 }}
                    transition={{ duration: DURATION.focal, ease: EASE_ARRIVE }}
                  >
                    <Pacote tom={tom} apelido={apelido} data={data} brilho={false} />
                  </motion.div>
                  <motion.div
                    className="absolute inset-x-[6%] top-[22%] h-[2px] rounded-full bg-white"
                    style={{ boxShadow: `0 0 24px 6px ${tom}` }}
                    initial={{ scaleX: 0, opacity: 1 }}
                    animate={{ scaleX: 1, opacity: 0 }}
                    transition={{ duration: DURATION.overlay, ease: EASE_ARRIVE }}
                  />
                </div>
              )}
              <motion.div
                className="relative [perspective:1200px]"
                initial={
                  acabouDeAbrir
                    ? reduzir
                      ? { opacity: 0 }
                      : { opacity: 0, y: 48, scale: 0.86, rotateY: -180 }
                    : false
                }
                animate={{ opacity: 1, y: 0, scale: 1, rotateY: 0 }}
                transition={{
                  duration: reduzir ? DURATION.overlay : DURATION.focal,
                  ease: EASE_ARRIVE,
                  delay: acabouDeAbrir ? 0.15 : 0,
                }}
              >
                <motion.div
                  className={
                    acabouDeAbrir && !reduzir ? 'vut-card-shield vut-reveal-landing relative' : ''
                  }
                  style={{ ['--vut-landing-delay' as string]: '700ms' }}
                  initial={acabouDeAbrir && !reduzir ? { filter: 'brightness(0.15)' } : false}
                  animate={{ filter: 'brightness(1)' }}
                  transition={{ duration: DURATION.focal, ease: EASE_ARRIVE, delay: 0.2 }}
                >
                  <CartaNaEscala card={card} escala={escalaPalco} />
                </motion.div>
              </motion.div>
            </div>
          </>
        );
      }
      case 'numeros':
        return (
          <>
            {topo(
              <>
                <h2 className={`${titulo} text-[2.75rem]`}>A noite em números</h2>
                <p className={linhaDeApoio}>Só a pelada de {data}.</p>
              </>,
            )}
            <div className="flex min-h-0 flex-1 flex-col justify-center px-4 py-4">
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
                <Casa rotulo="Jogos" valor={String(noite.games)} ordem={0} reduzir={reduzir} />
                <Casa rotulo="Vitórias" valor={String(noite.wins)} ordem={1} reduzir={reduzir} />
                <Casa rotulo="Pontos" valor={String(noite.points)} ordem={2} reduzir={reduzir} />
                <Casa rotulo="Nota" valor={nota} ordem={3} reduzir={reduzir} />
              </div>
            </div>
          </>
        );
      case 'conquistas':
        return (
          <>
            {topo(
              <>
                <h2 className={`${titulo} text-[2.75rem]`}>{tituloDoCapitulo.conquistas}</h2>
                <p className={linhaDeApoio}>
                  {noite.newAchievements.length === 1
                    ? 'Destravada nesta pelada.'
                    : 'Destravadas nesta pelada.'}
                </p>
              </>,
            )}
            <ul className="flex min-h-0 flex-1 flex-col justify-center-safe gap-3 overflow-y-auto px-4 py-4">
              {noite.newAchievements.map((conquista, i) => (
                <motion.li
                  key={conquista.id}
                  className={`vut-border-${conquista.rarity} shrink-0 rounded-2xl p-[2px]`}
                  initial={reduzir ? { opacity: 0 } : { opacity: 0, scale: 1.15 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    duration: reduzir ? DURATION.state : DURATION.feedback,
                    ease: EASE_ARRIVE,
                    delay: 0.2 + i * 0.35,
                  }}
                >
                  <div className="flex items-center gap-4 rounded-[14px] bg-base-200 px-4 py-3">
                    <span aria-hidden className="text-4xl leading-none">
                      {conquista.emoji}
                    </span>
                    <div className="min-w-0">
                      <p className="text-lg font-black leading-tight text-white">
                        {conquista.name}
                      </p>
                      {conquista.description && (
                        <p className="mt-0.5 text-sm leading-snug text-white/70">
                          {conquista.description}
                        </p>
                      )}
                      <p
                        className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]"
                        style={{ color: RARIDADE[conquista.rarity].cor }}
                      >
                        {RARIDADE[conquista.rarity].nome} · moldura {conquista.frame.name}
                      </p>
                    </div>
                  </div>
                </motion.li>
              ))}
            </ul>
          </>
        );
      case 'quase':
        return (
          <>
            {topo(
              <>
                <h2 className={`${titulo} text-[2.75rem]`}>Quase lá</h2>
                <p className={linhaDeApoio}>O que está mais perto de cair na próxima pelada.</p>
              </>,
            )}
            <ul className="flex min-h-0 flex-1 flex-col justify-center-safe gap-7 overflow-y-auto px-4 py-4">
              {noite.nearAchievements.map((conquista, i) => {
                const cor = RARIDADE[conquista.rarity].cor;
                return (
                  <li key={conquista.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="flex min-w-0 items-center gap-2 text-lg font-black leading-tight text-white">
                        <span aria-hidden className="text-2xl leading-none">
                          {conquista.emoji}
                        </span>
                        {conquista.name}
                      </p>
                      {conquista.current < conquista.target && (
                        <span className="shrink-0 font-mono text-sm text-white/70 tabular-nums">
                          {conquista.current}/{conquista.target}
                        </span>
                      )}
                    </div>
                    {conquista.description && (
                      <p className="mt-1 text-sm leading-snug text-white/70">
                        {conquista.description}
                      </p>
                    )}
                    <div
                      role="progressbar"
                      aria-label={conquista.name}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progresso(conquista)}
                      className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"
                    >
                      <motion.div
                        className="h-full origin-left rounded-full"
                        style={{ background: cor }}
                        initial={
                          reduzir
                            ? { opacity: 0, scaleX: progresso(conquista) / 100 }
                            : { scaleX: 0 }
                        }
                        animate={{ opacity: 1, scaleX: progresso(conquista) / 100 }}
                        transition={{
                          duration: DURATION.focal,
                          ease: EASE_ARRIVE,
                          delay: 0.2 + i * 0.12,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-sm font-semibold" style={{ color: cor }}>
                      {faltam(conquista)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </>
        );
      case 'fim':
        return (
          <>
            {topo(
              <>
                <h2 className={`${titulo} text-[2.75rem]`}>Fim da noite</h2>
                <p className="mt-3 truncate font-mono text-xs uppercase tracking-[0.18em] text-white/70">
                  {communityName} · {data}
                </p>
              </>,
            )}
            <div className="flex min-h-0 flex-1 flex-col items-center gap-5 px-4 py-4">
              <div ref={fimRef} className="flex min-h-0 w-full flex-1 items-center justify-center">
                <CartaNaEscala card={card} escala={escalaFim} nodeRef={cartaRef} />
              </div>
              <div className="flex w-full shrink-0 flex-col gap-3">
                <button
                  ref={compartilharRef}
                  type="button"
                  onClick={compartilhar}
                  disabled={compartilhando}
                  aria-busy={compartilhando}
                  aria-label="Compartilhar"
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-primary text-sm font-black uppercase tracking-[0.1em] text-white transition-colors duration-150 hover:bg-primary-hover disabled:opacity-60"
                >
                  <Share2 className="h-4 w-4" aria-hidden />
                  {compartilhando ? 'Gerando imagem…' : 'Compartilhar'}
                </button>
                <button
                  type="button"
                  onClick={onViewCard}
                  className="h-12 w-full rounded-[10px] border border-white/15 bg-white/5 text-sm font-bold uppercase tracking-[0.1em] text-white transition-colors duration-150 hover:bg-white/10"
                >
                  Ver minha carta
                </button>
                {falhou && (
                  <p role="alert" className="text-center text-sm text-white/80">
                    Não deu para gerar a imagem. Tente de novo.
                  </p>
                )}
              </div>
            </div>
          </>
        );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sua noite"
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden overscroll-contain bg-base-100 text-white [container-type:size] selection:bg-primary/40"
      style={{
        background: `radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, ${tom} 9%, #14171c) 0%, #0b0c0e 62%)`,
      }}
    >
      <div
        className="flex h-full flex-col"
        style={{ ['--noite-display' as string]: 'clamp(3.25rem, min(24cqw, 11.5cqh), 6rem)' }}
      >
        <header className="relative z-10 shrink-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex gap-1.5" aria-hidden>
            {capitulos.map((nome, i) => (
              <span
                key={nome}
                className={`h-[3px] flex-1 rounded-full transition-colors duration-250 ${
                  i === indice ? 'bg-white' : i < indice ? 'bg-white/55' : 'bg-white/15'
                }`}
              />
            ))}
          </div>
          <div className="flex h-12 items-center justify-end gap-1">
            {aberto && indice < ultimo && (
              <button
                type="button"
                onClick={() => irPara(ultimo)}
                className="h-11 rounded-[10px] px-3 text-xs font-bold uppercase tracking-[0.14em] text-white/75 transition-colors duration-150 hover:text-white"
              >
                Pular
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-white/75 transition-colors duration-150 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </header>

        <p className="sr-only" aria-live="polite">
          {aberto
            ? `Capítulo ${indice + 1} de ${capitulos.length}: ${tituloDoCapitulo[capitulo]}`
            : ''}
        </p>

        <motion.div
          key={capitulo}
          className="relative flex min-h-0 flex-1 flex-col"
          onClick={tocarNoPalco}
          initial={entrada}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: DURATION.state, ease: EASE_ARRIVE }}
        >
          {renderCapitulo()}
        </motion.div>

        <footer className="relative z-10 flex h-[88px] shrink-0 items-center gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          {!aberto ? (
            <button
              ref={abrirRef}
              type="button"
              onClick={abrir}
              className={`flex h-14 w-full items-center justify-center rounded-[10px] bg-primary text-base font-black uppercase italic tracking-[0.16em] text-white shadow-[0_10px_30px_rgba(37,99,235,0.35)] transition-colors duration-150 hover:bg-primary-hover ${
                reduzir ? 'ring-1 ring-white/35' : 'noite-abrir'
              }`}
            >
              Abrir
            </button>
          ) : (
            <>
              {indice > 1 ? (
                <button
                  type="button"
                  onClick={voltar}
                  className="flex h-12 shrink-0 items-center gap-1 rounded-[10px] border border-white/15 bg-white/5 pl-3 pr-4 text-sm font-bold uppercase tracking-[0.1em] text-white transition-colors duration-150 hover:bg-white/10"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  Voltar
                </button>
              ) : null}
              {indice < ultimo && (
                <button
                  ref={proximoRef}
                  type="button"
                  onClick={avancar}
                  className="flex h-12 flex-1 items-center justify-center gap-1 rounded-[10px] bg-white text-sm font-black uppercase tracking-[0.1em] text-base-100 transition-colors duration-150 hover:bg-white/90"
                >
                  Próximo
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              )}
            </>
          )}
        </footer>
      </div>
    </div>
  );
};
