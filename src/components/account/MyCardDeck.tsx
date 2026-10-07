import '@fontsource-variable/inter/wght-italic.css';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotionConfig,
  useTransform,
  type MotionValue,
  type PanInfo,
} from 'motion/react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Layers, Share2, X } from 'lucide-react';
import type { MyCard } from '@app/myCards';
import type { Achievement, AchievementRarity, EditionEntry, VutCard } from '@logic/futCards';
import { shareCardImage } from '@logic/shareCardImage';
import { EmptyState } from '@ui/EmptyState';
import { DURATION, EASE_ARRIVE } from '@ui/motion';
import { FutCard } from '../player/FutCard';

export interface MyCardDeckProps {
  cards: MyCard[];
  selectedCommunityId: string | null;
  onSelect: (communityId: string) => void;
}

const CARTA_L = 260;
const CARTA_A = 370;
const RESPIRO = 36;

const TOM_DO_TIER: Record<string, string> = {
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

const RARIDADE: Record<AchievementRarity, { nome: string; cor: string }> = {
  common: { nome: 'Comum', cor: '#d7ccc8' },
  uncommon: { nome: 'Incomum', cor: '#81c784' },
  rare: { nome: 'Rara', cor: '#64b5f6' },
  epic: { nome: 'Épica', cor: '#ce93d8' },
  legendary: { nome: 'Lendária', cor: '#ffb300' },
};

const SILHUETAS = [
  { nome: 'MVP', tom: TOM_DA_EDICAO.mvp },
  { nome: 'Maestro', tom: TOM_DA_EDICAO.maestro },
  { nome: 'Muralha', tom: TOM_DA_EDICAO.muralha },
];

function tomDa(carta: MyCard | undefined): string {
  if (!carta || carta.loading) return '#8a8f98';
  const { card } = carta;
  if (card.edition.kind !== 'base') return TOM_DA_EDICAO[card.edition.kind] ?? '#f97316';
  return card.stats.rated ? TOM_DO_TIER[card.stats.tier] : '#8a8f98';
}

function formatarData(data: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  return partes ? `${partes[3]}.${partes[2]}.${partes[1]}` : data;
}

function faltam(conquista: Achievement): string {
  const resta = Math.ceil(conquista.target - conquista.current);
  if (resta <= 0) return 'falta pouco';
  return resta === 1 ? 'falta 1' : `faltam ${resta}`;
}

function progresso(conquista: Achievement): number {
  const teto = conquista.unlocked ? 100 : 95;
  return Math.round(Math.min(teto, Math.max(0, (conquista.current / conquista.target) * 100)));
}

function useLargura(padrao: number) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [largura, setLargura] = useState(padrao);
  useLayoutEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const medir = () => {
      const { width } = el.getBoundingClientRect();
      if (width) setLargura(width);
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [el]);
  return [setEl, largura] as const;
}

const Feixes: React.FC<{ tom: string }> = ({ tom }) => (
  <div
    aria-hidden
    className="pointer-events-none absolute inset-y-0 left-1/2 w-[min(100%,640px)] -translate-x-1/2 overflow-hidden"
    style={{
      maskImage:
        'linear-gradient(90deg, transparent 0%, #0b0c0e 22%, #0b0c0e 78%, transparent 100%)',
    }}
  >
    {[
      { left: '22%', rotate: 14, opacity: 0.42 },
      { left: '50%', rotate: 0, opacity: 0.7 },
      { left: '78%', rotate: -14, opacity: 0.42 },
    ].map((feixe, i) => (
      <motion.div
        key={i}
        className="absolute top-0 h-[88%] w-[56%] origin-top blur-xl"
        style={{
          left: feixe.left,
          x: '-50%',
          rotate: feixe.rotate,
          clipPath: 'polygon(44% 0, 56% 0, 100% 100%, 0 100%)',
          background: `linear-gradient(180deg, color-mix(in srgb, ${tom} 38%, rgba(255,255,255,0.3)) 0%, transparent 80%)`,
          maskImage: 'linear-gradient(180deg, transparent 0%, #0b0c0e 16%)',
        }}
        initial={{ opacity: feixe.opacity * 0.3 }}
        animate={{ opacity: feixe.opacity }}
        transition={{ duration: DURATION.state, ease: EASE_ARRIVE }}
      />
    ))}
  </div>
);

const Esqueleto: React.FC = () => (
  <div className="vut-card-shield h-full w-full bg-white/10 p-[2px]">
    <div className="vut-card-shield relative h-full w-full bg-[linear-gradient(170deg,#1e222a_0%,#14171c_55%,#0b0c0e_100%)] motion-safe:animate-pulse">
      <span className="absolute left-[7%] top-[10%] h-[11%] w-[14%] rounded-md bg-white/10" />
      <span className="absolute left-[25%] top-[12%] h-[44%] w-[50%] rounded-[40%] bg-white/[0.06]" />
      <span className="absolute left-[22%] top-[58%] h-[4%] w-[56%] rounded-full bg-white/10" />
      <span className="absolute left-[6%] top-[66%] h-[11%] w-[88%] rounded-xl bg-white/[0.07]" />
      <span className="absolute left-[6%] top-[80%] h-[6%] w-[88%] rounded-lg bg-white/[0.05]" />
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

interface Geometria {
  escala: number;
  passoGraus: number;
  passoPx: number;
  raio: number;
}

const CartaDoLeque: React.FC<{
  carta: MyCard;
  indice: number;
  frente: boolean;
  giro: MotionValue<number>;
  geo: Geometria;
  sozinha: boolean;
  cartaRef: React.Ref<HTMLDivElement>;
  onEscolher: () => void;
}> = ({ carta, indice, frente, giro, geo, sozinha, cartaRef, onEscolher }) => {
  const largura = CARTA_L * geo.escala;
  const altura = CARTA_A * geo.escala;
  const rotate = useTransform(giro, (g: number) => (indice - g) * geo.passoGraus);
  const scale = useTransform(giro, (g: number) => 1 - Math.min(Math.abs(indice - g), 2) * 0.07);
  const zIndex = useTransform(giro, (g: number) => 50 - Math.round(Math.abs(indice - g) * 10));
  const sombra = useTransform(giro, (g: number) => Math.min(Math.abs(indice - g), 1.4) * 0.46);
  const opacity = useTransform(giro, (g: number) => (Math.abs(indice - g) > 2.6 ? 0 : 1));

  return (
    <motion.div
      role="group"
      aria-roledescription="carta"
      aria-label={carta.community.name}
      aria-busy={carta.loading ? true : undefined}
      aria-current={frente ? 'true' : undefined}
      onClick={frente ? undefined : onEscolher}
      className={`absolute left-1/2 ${frente ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
      style={{
        top: RESPIRO,
        width: largura,
        height: altura,
        marginLeft: -largura / 2,
        rotate: sozinha ? 0 : rotate,
        zIndex,
        opacity,
        transformOrigin: `50% ${altura / 2 + geo.raio}px`,
      }}
    >
      <motion.div className="relative h-full w-full" style={{ scale: sozinha ? 1 : scale }}>
        {carta.loading ? (
          <Esqueleto />
        ) : (
          <CartaNaEscala
            card={carta.card}
            escala={geo.escala}
            nodeRef={frente ? cartaRef : undefined}
          />
        )}
        {!sozinha && (
          <motion.div
            aria-hidden
            className="vut-card-shield pointer-events-none absolute inset-0 bg-[#0b0c0e]"
            style={{ opacity: sombra }}
          />
        )}
      </motion.div>
    </motion.div>
  );
};

const Selo: React.FC<{
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

const Regra: React.FC<{ conquista: Achievement; estado: string }> = ({ conquista, estado }) => {
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

const Album: React.FC<{ carta: MyCard; colunas: number }> = ({ carta, colunas }) => {
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

const EdicaoAberta: React.FC<{
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

const Colecao: React.FC<{ carta: MyCard; onAbrir: (entrada: EditionEntry) => void }> = ({
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

export function MyCardDeck({ cards, selectedCommunityId, onSelect }: MyCardDeckProps) {
  const reduzir = !!useReducedMotionConfig();
  const [medirRef, largura] = useLargura(375);
  const cartaRef = useRef<HTMLDivElement>(null);
  const [compartilhando, setCompartilhando] = useState(false);
  const [falhouEm, setFalhouEm] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<EditionEntry | null>(null);
  const fecharEdicao = useCallback(() => setEdicao(null), []);
  const encontrada = cards.findIndex((c) => c.community.id === selectedCommunityId);
  const indice = encontrada < 0 ? 0 : encontrada;
  const total = cards.length;
  const sozinha = total === 1;
  const carta = cards[indice];

  const largo = largura >= 640;
  const escala = sozinha
    ? largo
      ? 1.04
      : Math.min(0.96, Math.max(0.8, (largura * 0.7) / CARTA_L))
    : largo
      ? 1
      : Math.min(0.95, Math.max(0.8, (largura * 0.64) / CARTA_L));
  const altura = CARTA_A * escala;
  const passoPx = CARTA_L * escala * (largo ? 0.8 : 0.94);
  const raio = altura * 3.2;
  const geo: Geometria = {
    escala,
    passoPx,
    raio,
    passoGraus: (Math.asin(Math.min(0.9, passoPx / raio)) * 180) / Math.PI,
  };
  const colunas = largura >= 960 ? 6 : largura >= 560 ? 4 : 3;

  const giro = useMotionValue(indice);
  const luz = useMotionValue(1);
  const primeiraVez = useRef(true);
  const base = useRef(indice);
  const arrastou = useRef(false);

  useEffect(() => {
    if (primeiraVez.current) {
      primeiraVez.current = false;
      giro.set(indice);
      return;
    }
    if (reduzir) {
      let parado = false;
      const saida = animate(luz, 0, { duration: DURATION.feedback, ease: EASE_ARRIVE });
      saida.then(() => {
        if (parado) return;
        giro.set(indice);
        animate(luz, 1, { duration: DURATION.state, ease: EASE_ARRIVE });
      });
      return () => {
        parado = true;
        saida.stop();
        giro.set(indice);
        luz.set(1);
      };
    }
    const giroAnimado = animate(giro, indice, { duration: DURATION.overlay, ease: EASE_ARRIVE });
    return () => giroAnimado.stop();
  }, [indice, reduzir, giro, luz]);

  const escolher = useCallback(
    (alvo: number) => {
      const destino = Math.max(0, Math.min(total - 1, alvo));
      if (destino !== indice) onSelect(cards[destino].community.id);
    },
    [cards, indice, onSelect, total],
  );

  const tecla = (evento: React.KeyboardEvent<HTMLElement>) => {
    if (sozinha || edicao) return;
    if ((evento.target as HTMLElement).closest('[data-sem-giro]')) return;
    if (evento.key === 'ArrowRight') {
      evento.preventDefault();
      escolher(indice + 1);
    } else if (evento.key === 'ArrowLeft') {
      evento.preventDefault();
      escolher(indice - 1);
    }
  };

  const comecarArrasto = () => {
    base.current = giro.get();
    arrastou.current = true;
  };

  const arrastar = (_: PointerEvent, info: PanInfo) => {
    if (reduzir) return;
    giro.set(Math.max(-0.35, Math.min(total - 0.65, base.current - info.offset.x / passoPx)));
  };

  const soltar = (_: PointerEvent, info: PanInfo) => {
    const fracao = -info.offset.x / passoPx;
    const impulso = -info.velocity.x / passoPx;
    let alvo = indice;
    if (fracao > 0.5 || (impulso > 1.2 && fracao > 0.08)) alvo = indice + 1;
    else if (fracao < -0.5 || (impulso < -1.2 && fracao < -0.08)) alvo = indice - 1;
    alvo = Math.max(0, Math.min(total - 1, alvo));
    if (alvo !== indice) escolher(alvo);
    else if (!reduzir) animate(giro, indice, { duration: DURATION.state, ease: EASE_ARRIVE });
    setTimeout(() => {
      arrastou.current = false;
    }, 0);
  };

  const compartilhar = async () => {
    if (!carta || carta.loading || !cartaRef.current || compartilhando) return;
    setCompartilhando(true);
    setFalhouEm(null);
    try {
      await shareCardImage(cartaRef.current, carta.card.player.nome);
    } catch (erro) {
      if (!(erro instanceof DOMException && erro.name === 'AbortError'))
        setFalhouEm(carta.community.id);
    } finally {
      setCompartilhando(false);
    }
  };

  if (total === 0) {
    return (
      <section aria-label="Minha carta" className="mx-auto w-full max-w-xl px-4 py-8">
        <EmptyState
          icon={Layers}
          title="Sua carta nasce quando você entra numa comunidade"
          description="Cada comunidade em que você joga te dá uma carta, com álbum de conquistas e as edições especiais das suas noites."
        >
          <Link
            to="/comunidades"
            className="inline-flex h-12 w-fit items-center gap-2 rounded-[10px] bg-primary px-6 text-sm font-black uppercase tracking-[0.1em] text-white outline-offset-2 transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-primary"
          >
            Ver comunidades
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </EmptyState>
      </section>
    );
  }

  const tom = tomDa(carta);
  const conquistas = carta.achievements;
  const totalDeConquistas =
    conquistas.unlocked.length + conquistas.near.length + conquistas.locked.length;
  const alturaDoPalco = RESPIRO + altura + (sozinha ? 28 : 44);

  return (
    <section
      ref={medirRef}
      aria-label="Minha carta"
      onKeyDown={tecla}
      className="relative w-full overflow-x-clip pb-10 text-white"
    >
      <motion.div
        className="relative isolate z-0 touch-pan-y select-none"
        style={{ height: alturaDoPalco, opacity: luz }}
        onPanStart={sozinha ? undefined : comecarArrasto}
        onPan={sozinha ? undefined : arrastar}
        onPanEnd={sozinha ? undefined : soltar}
      >
        <Feixes key={carta.community.id} tom={tom} />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-1/2 h-16 -translate-x-1/2 rounded-[50%] blur-2xl"
          style={{
            top: RESPIRO + altura - 28,
            width: CARTA_L * escala * 1.25,
            background: `radial-gradient(closest-side, color-mix(in srgb, ${tom} 34%, transparent), transparent)`,
          }}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: 1 }}
          key={`chao-${carta.community.id}`}
          transition={{ duration: DURATION.state, ease: EASE_ARRIVE }}
        />
        {cards.map((c, i) => (
          <CartaDoLeque
            key={c.community.id}
            carta={c}
            indice={i}
            frente={i === indice}
            giro={giro}
            geo={geo}
            sozinha={sozinha}
            cartaRef={cartaRef}
            onEscolher={() => {
              if (!arrastou.current) escolher(i);
            }}
          />
        ))}
      </motion.div>

      {!sozinha && (
        <div className="relative z-10 -mt-2 flex items-center justify-center gap-4">
          <button
            type="button"
            aria-label="Carta anterior"
            disabled={indice === 0}
            onClick={() => escolher(indice - 1)}
            className="grid h-11 w-11 place-items-center rounded-full border border-white/12 bg-white/5 text-white outline-offset-2 transition-colors duration-150 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/5"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <div aria-hidden className="flex items-center gap-1.5">
            {cards.map((c, i) => (
              <span
                key={c.community.id}
                className="h-1.5 rounded-full transition-[width,background-color] duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                style={{
                  width: i === indice ? 22 : 6,
                  background: i === indice ? tom : 'rgba(255,255,255,0.28)',
                }}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Próxima carta"
            disabled={indice === total - 1}
            onClick={() => escolher(indice + 1)}
            className="grid h-11 w-11 place-items-center rounded-full border border-white/12 bg-white/5 text-white outline-offset-2 transition-colors duration-150 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/5"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      )}

      <motion.div
        key={carta.community.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATION.state, ease: EASE_ARRIVE }}
        className="mx-auto w-full max-w-5xl px-4"
      >
        <div className="mt-6 flex flex-col items-center text-center">
          <h2 className="line-clamp-2 max-w-[20ch] text-balance pt-[0.12em] text-[clamp(1.875rem,8vw,3rem)] font-black uppercase italic leading-[0.95] tracking-[-0.035em]">
            {carta.community.name}
          </h2>
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.14em] text-white/70 tabular-nums">
            {carta.loading ? (
              'montando a carta…'
            ) : (
              <>
                <span className="block sm:inline">
                  {conquistas.unlocked.length} de {totalDeConquistas} conquistas
                </span>
                <span aria-hidden className="hidden sm:inline">
                  {' · '}
                </span>
                <span className="mt-1 block sm:mt-0 sm:inline">
                  {carta.lastPlayedAt
                    ? `última noite ${formatarData(carta.lastPlayedAt)}`
                    : 'ainda sem pelada'}
                </span>
              </>
            )}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-3">
            <button
              type="button"
              onClick={compartilhar}
              disabled={carta.loading || compartilhando}
              aria-busy={compartilhando}
              aria-label="Compartilhar"
              className="flex h-12 items-center justify-center gap-2 rounded-[10px] bg-primary px-7 text-sm font-black uppercase italic tracking-[0.12em] text-white shadow-[0_10px_30px_rgba(37,99,235,0.35)] outline-offset-2 transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              <Share2 className="h-4 w-4" aria-hidden />
              {compartilhando ? 'Gerando imagem…' : 'Compartilhar'}
            </button>
            <Link
              to={`/comunidades/${carta.community.id}`}
              className="flex h-12 items-center gap-1.5 rounded-[10px] px-4 text-sm font-bold text-white/80 underline decoration-white/30 underline-offset-4 outline-offset-2 transition-colors duration-150 hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-primary"
            >
              Abrir comunidade
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          {falhouEm === carta.community.id && (
            <p role="alert" className="mt-3 text-sm text-white/80">
              Não deu para gerar a imagem. Tente de novo.
            </p>
          )}
        </div>

        <Album carta={carta} colunas={colunas} />
        <Colecao carta={carta} onAbrir={setEdicao} />
      </motion.div>

      {edicao && (
        <EdicaoAberta carta={carta} entrada={edicao} reduzir={reduzir} onFechar={fecharEdicao} />
      )}
    </section>
  );
}
