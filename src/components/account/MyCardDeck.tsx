import '@fontsource-variable/inter/wght-italic.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { ArrowUpRight, ChevronLeft, ChevronRight, IdCard, Layers, Share2 } from 'lucide-react';
import type { MyCard } from '@app/myCards';
import { shareCardImage } from '@logic/shareCardImage';
import { useElementWidth } from '@hooks/useElementWidth';
import { EmptyState } from '@ui/EmptyState';
import { DURATION, EASE_ARRIVE } from '@ui/motion';
import { CartaNaEscala } from './myCardParts';
import { CARTA_A, CARTA_L, formatarData, tomDa } from './myCardTones';

export interface MyCardDeckProps {
  cards: MyCard[];
  selectedCommunityId: string | null;
  onSelect: (communityId: string) => void;
  onOpenProfile: (communityId: string) => void;
}

const RESPIRO = 36;

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
      onClick={onEscolher}
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
      <motion.div
        aria-hidden={frente ? undefined : true}
        className="relative h-full w-full"
        style={{ scale: sozinha ? 1 : scale }}
      >
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

export function MyCardDeck({
  cards,
  selectedCommunityId,
  onSelect,
  onOpenProfile,
}: MyCardDeckProps) {
  const reduzir = !!useReducedMotionConfig();
  const [medirRef, largura] = useElementWidth(375);
  const cartaRef = useRef<HTMLDivElement>(null);
  const [compartilhando, setCompartilhando] = useState(false);
  const [falhouEm, setFalhouEm] = useState<string | null>(null);
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
    giro.stop();
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
    if (sozinha) return;
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
    giro.stop();
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
    else if (!reduzir) {
      giro.stop();
      animate(giro, indice, { duration: DURATION.state, ease: EASE_ARRIVE });
    }
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
              if (arrastou.current) return;
              if (i === indice) onOpenProfile(c.community.id);
              else escolher(i);
            }}
          />
        ))}
      </motion.div>

      {!sozinha && (
        <div className="relative z-10 -mt-2 flex items-center justify-center gap-4">
          <button
            type="button"
            aria-label="Carta anterior"
            aria-disabled={indice === 0}
            onClick={() => escolher(indice - 1)}
            className="grid h-11 w-11 place-items-center rounded-full border border-white/12 bg-white/5 text-white outline-offset-2 transition-colors duration-150 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-30 aria-disabled:hover:bg-white/5"
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
            aria-disabled={indice === total - 1}
            onClick={() => escolher(indice + 1)}
            className="grid h-11 w-11 place-items-center rounded-full border border-white/12 bg-white/5 text-white outline-offset-2 transition-colors duration-150 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-30 aria-disabled:hover:bg-white/5"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {carta.loading
          ? `${carta.community.name} · montando a carta`
          : `${carta.community.name} · ${conquistas.unlocked.length} de ${totalDeConquistas} conquistas`}
      </p>
      <motion.div
        key={carta.community.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATION.state, ease: EASE_ARRIVE }}
        className="mx-auto w-full max-w-5xl px-4"
      >
        <div className="mt-6 flex flex-col items-center text-center">
          <h2
            tabIndex={-1}
            className="outline-none line-clamp-2 max-w-[20ch] text-balance pt-[0.12em] text-[clamp(1.875rem,8vw,3rem)] font-black uppercase italic leading-[0.95] tracking-[-0.035em]"
          >
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
          <button
            type="button"
            onClick={() => onOpenProfile(carta.community.id)}
            className="mt-2 flex h-12 items-center justify-center gap-2 rounded-[10px] border border-white/15 bg-white/5 px-6 text-sm font-black uppercase italic tracking-[0.12em] text-white outline-offset-2 transition-colors duration-150 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <IdCard className="h-4 w-4" aria-hidden />
            Ver perfil de atleta
          </button>
          {falhouEm === carta.community.id && (
            <p role="alert" className="mt-3 text-sm text-white/80">
              Não deu para gerar a imagem. Tente de novo.
            </p>
          )}
        </div>
      </motion.div>
    </section>
  );
}
