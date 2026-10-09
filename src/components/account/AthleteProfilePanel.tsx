import '@fontsource-variable/inter/wght-italic.css';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { motion, useReducedMotionConfig } from 'motion/react';
import {
  Activity,
  Clock3,
  Hand,
  HeartPulse,
  Layers,
  Share2,
  Sparkles,
  Star,
  type LucideIcon,
} from 'lucide-react';
import type { MyCard } from '@app/myCards';
import type { Player } from '@shared/types';
import { tierFromOvr, type EditionEntry } from '@logic/futCards';
import { shareCardImage } from '@logic/shareCardImage';
import { DURATION, EASE_ARRIVE } from '@ui/motion';
import { useElementWidth } from '@hooks/useElementWidth';
import { Album, CartaNaEscala, Colecao, EdicaoAberta } from './myCardParts';
import { CARTA_A, CARTA_L, TOM_DO_TIER, formatarData, tomDa } from './myCardTones';
import {
  ABAS,
  FUNDAMENTOS,
  alturaEmMetros,
  avaliado,
  condicaoDe,
  edicaoDa,
  faseDa,
  formaRecente,
  iniciaisDe,
  maoDe,
  notaNaCarta,
  type Aba,
  type Leitura,
} from './athleteProfileTones';

export interface AthleteProfilePanelProps {
  card: MyCard;
  player: Player;
  onShowCard: () => void;
  onRetry?: () => void;
}

const CHEGADA = { duration: DURATION.overlay, ease: EASE_ARRIVE };

const Carregando: React.FC<{ largura?: string }> = ({ largura = 'w-16' }) => (
  <span
    aria-hidden
    className={`block h-[1.1em] ${largura} rounded-md bg-white/10 motion-safe:animate-pulse`}
  />
);

const Veu: React.FC<{ tom: string }> = ({ tom }) => (
  <motion.div
    aria-hidden
    className="pointer-events-none absolute inset-0 -z-10"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={CHEGADA}
    style={{
      background: [
        `linear-gradient(118deg, transparent 34%, color-mix(in srgb, ${tom} 9%, transparent) 44%, transparent 58%)`,
        `radial-gradient(70% 60% at 12% 18%, color-mix(in srgb, ${tom} 30%, transparent), transparent 70%)`,
        `linear-gradient(118deg, color-mix(in srgb, ${tom} 22%, transparent) 0%, transparent 46%)`,
      ].join(', '),
    }}
  />
);

const Losango: React.FC<{ carta: MyCard; tom: string }> = ({ carta, tom }) => {
  const { stats } = carta.card;
  const rotulo = carta.loading
    ? 'Geral carregando'
    : stats.rated
      ? `Geral ${stats.ovr}`
      : 'Geral aguardando avaliação';
  return (
    <div
      role="img"
      aria-label={rotulo}
      className="relative grid h-[4.75rem] w-[4.75rem] shrink-0 place-items-center @xl:h-[5.5rem] @xl:w-[5.5rem]"
    >
      <span
        aria-hidden
        className="absolute inset-[13%] rotate-45 rounded-[10px] border-2 bg-[#0b0c0e]/70 shadow-[0_10px_24px_rgba(0,0,0,0.45)]"
        style={{ borderColor: tom }}
      />
      <span
        aria-hidden
        className="relative font-mono text-[1.75rem] font-extrabold leading-none tabular-nums @xl:text-[2rem]"
      >
        {carta.loading ? <Carregando largura="w-9" /> : stats.rated ? stats.ovr : '?'}
      </span>
    </div>
  );
};

const Retrato: React.FC<{
  carta: MyCard;
  player: Player;
  tom: string;
  escala: number;
  cartaRef: React.Ref<HTMLDivElement>;
}> = ({ carta, player, tom, escala, cartaRef }) => {
  const [falhou, setFalhou] = useState(false);
  const foto = player.avatarUrl && !falhou ? player.avatarUrl : null;
  const mascara =
    escala >= 0.5
      ? 'linear-gradient(180deg, transparent 0%, #0b0c0e 16%, #0b0c0e 54%, transparent 96%), linear-gradient(90deg, transparent 0%, #0b0c0e 14%, #0b0c0e 66%, transparent 100%)'
      : 'linear-gradient(180deg, #0b0c0e 52%, transparent 96%), linear-gradient(90deg, #0b0c0e 62%, transparent 100%)';
  return (
    <div className="relative -mx-4 h-[20rem] @xl:h-[24rem] @3xl:mx-0 @3xl:mt-6 @3xl:h-[28rem] @5xl:h-[36rem]">
      {foto ? (
        <motion.img
          src={foto}
          alt=""
          onError={() => setFalhou(true)}
          className="absolute inset-y-0 left-0 h-full w-[82%] object-cover object-top @3xl:w-full"
          style={{ maskImage: mascara, maskComposite: 'intersect', WebkitMaskImage: mascara }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={CHEGADA}
        />
      ) : (
        <motion.span
          aria-hidden
          className="absolute -left-1 top-2 select-none pr-4 text-[11rem] font-black italic leading-none tracking-[-0.04em] @xl:text-[14rem] @3xl:top-6 @3xl:text-[12rem] @5xl:text-[17rem]"
          style={{
            color: `color-mix(in srgb, ${tom} 20%, transparent)`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={CHEGADA}
        >
          {iniciaisDe(player.nome)}
        </motion.span>
      )}
      <div
        className="absolute bottom-16 right-4 drop-shadow-[0_14px_24px_rgba(0,0,0,0.55)] @xl:bottom-20 @3xl:bottom-4 @3xl:right-0"
        style={{ width: CARTA_L * escala, height: CARTA_A * escala }}
      >
        {carta.loading ? (
          <span
            aria-hidden
            className="vut-card-shield block h-full w-full bg-white/10 motion-safe:animate-pulse"
          />
        ) : (
          <CartaNaEscala card={carta.card} escala={escala} nodeRef={cartaRef} />
        )}
      </div>
    </div>
  );
};

const Estrelas: React.FC<{ quantas: number; tom: string }> = ({ quantas, tom }) => (
  <span role="img" aria-label={`versatilidade ${quantas} de 5`} className="flex gap-0.5">
    {[0, 1, 2, 3, 4].map((i) => (
      <Star
        key={i}
        aria-hidden
        className="h-3.5 w-3.5"
        strokeWidth={2}
        style={
          i < quantas
            ? { color: tom, fill: tom }
            : { color: 'rgba(255,255,255,0.28)', fill: 'none' }
        }
      />
    ))}
  </span>
);

function frase(carta: MyCard): string {
  const { peladas } = carta.jogo;
  if (peladas === 0) return 'Ainda sem pelada aqui';
  const base = `${peladas} ${peladas === 1 ? 'pelada' : 'peladas'} em ${carta.community.name}`;
  return carta.lastPlayedAt
    ? `${base} · última noite ${formatarData(carta.lastPlayedAt).slice(0, 5)}`
    : base;
}

const ItemDeStatus: React.FC<{
  rotulo: string;
  icone: LucideIcon;
  leitura: Leitura | null;
}> = ({ rotulo, icone: Icone, leitura }) => (
  <div className="flex min-w-0 flex-col gap-1.5 bg-[#0f1216]/85 px-4 py-3.5">
    <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-white/65">
      <Icone aria-hidden className="h-3.5 w-3.5" strokeWidth={2.25} />
      {rotulo}
    </dt>
    <dd
      className="truncate text-[1.0625rem] font-black uppercase italic leading-tight tracking-[0.01em]"
      style={leitura ? { color: leitura.cor } : undefined}
    >
      {leitura ? leitura.texto : <Carregando largura="w-20" />}
    </dd>
  </div>
);

const Status: React.FC<{ carta: MyCard; player: Player }> = ({ carta, player }) => (
  <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-white/10 bg-white/10 @[40rem]:grid-cols-4">
    <ItemDeStatus
      rotulo="Fase"
      icone={Activity}
      leitura={carta.loading ? null : faseDa(carta.card.formBadge.value)}
    />
    <ItemDeStatus rotulo="Condição" icone={HeartPulse} leitura={condicaoDe(player)} />
    <ItemDeStatus
      rotulo="Edição atual"
      icone={Sparkles}
      leitura={carta.loading ? null : edicaoDa(carta.card)}
    />
    <ItemDeStatus
      rotulo="Mão dominante"
      icone={Hand}
      leitura={{ texto: maoDe(player), cor: '#ffffff' }}
    />
  </dl>
);

const Celula: React.FC<{ rotulo: string; children: React.ReactNode }> = ({ rotulo, children }) => (
  <div className="min-w-0 border-t border-white/10 pt-3">
    <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-white/60">
      {rotulo}
    </dt>
    <dd className="mt-1.5">{children}</dd>
  </div>
);

const Numero: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="font-mono text-[clamp(1.125rem,7cqw,1.375rem)] font-bold leading-none tabular-nums">
    {children}
  </span>
);

const Detalhe: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="ml-2 font-mono text-xs text-white/65 tabular-nums">{children}</span>
);

const Grade: React.FC<{ carta: MyCard; player: Player }> = ({ carta, player }) => {
  const { jogo } = carta;
  const valor = (conteudo: React.ReactNode) =>
    carta.loading ? <Carregando largura="w-14" /> : conteudo;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-5 @[30rem]:grid-cols-3">
      <Celula rotulo="Comunidade">
        <span className="line-clamp-2 text-[0.9375rem] font-bold leading-snug">
          {carta.community.name}
        </span>
      </Celula>
      <Celula rotulo="Peladas">
        {valor(
          <>
            <Numero>{jogo.peladas}</Numero>
            {jogo.jogos > 0 && (
              <Detalhe>
                {jogo.jogos} {jogo.jogos === 1 ? 'jogo' : 'jogos'}
              </Detalhe>
            )}
          </>,
        )}
      </Celula>
      <Celula rotulo="Vitórias">
        {valor(
          <>
            <Numero>{jogo.vitorias}</Numero>
            {jogo.jogos > 0 && <Detalhe>{jogo.aproveitamento}%</Detalhe>}
          </>,
        )}
      </Celula>
      <Celula rotulo="Pontos">{valor(<Numero>{jogo.pontos}</Numero>)}</Celula>
      <Celula rotulo="Última noite">
        {valor(<Numero>{carta.lastPlayedAt ? formatarData(carta.lastPlayedAt) : '—'}</Numero>)}
      </Celula>
      <Celula rotulo="Altura">{valor(<Numero>{alturaEmMetros(player.alturaCm)}</Numero>)}</Celula>
    </dl>
  );
};

function tomDaNota(nota: number): string {
  return `color-mix(in srgb, ${TOM_DO_TIER[tierFromOvr(nota)]} 72%, #ffffff)`;
}

const Aguardando: React.FC = () => (
  <p className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-bold text-amber-200">
    <Clock3 aria-hidden className="h-3.5 w-3.5" />
    Aguardando avaliação
  </p>
);

const ListaDeFundamentos: React.FC<{ carta: MyCard; tom: string; barras: boolean }> = ({
  carta,
  tom,
  barras,
}) => {
  const semNota = !carta.loading && !avaliado(carta.fundamentos);
  return (
    <div>
      {semNota && (
        <div className="mb-4">
          <Aguardando />
        </div>
      )}
      <ul
        aria-label="Fundamentos na escala da carta"
        className={
          barras
            ? 'grid gap-x-10 gap-y-4 @xl:grid-cols-2'
            : 'flex flex-col divide-y divide-white/[0.07]'
        }
      >
        {FUNDAMENTOS.map(({ chave, nome }) => {
          const nota = carta.loading ? null : notaNaCarta(carta.fundamentos, chave);
          return (
            <li key={chave} className={barras ? 'flex flex-col gap-2' : 'py-[0.4375rem]'}>
              <span className="flex items-baseline justify-between gap-4">
                <span className="text-sm text-white/80">{nome}</span>
                {carta.loading ? (
                  <Carregando largura="w-7" />
                ) : (
                  <span
                    className="font-mono text-base font-bold tabular-nums"
                    style={
                      nota != null ? { color: tomDaNota(nota) } : { color: 'rgba(255,255,255,0.5)' }
                    }
                  >
                    {nota ?? '—'}
                  </span>
                )}
              </span>
              {barras && (
                <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                  {nota != null && (
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${nota}%`,
                        background: `linear-gradient(90deg, color-mix(in srgb, ${tom} 55%, transparent), ${tom})`,
                      }}
                    />
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const Titulo: React.FC<{ children: React.ReactNode; extra?: React.ReactNode }> = ({
  children,
  extra,
}) => (
  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-white/10 pb-3">
    <h3 className="text-[1.375rem] font-black uppercase italic leading-none tracking-[-0.02em]">
      {children}
    </h3>
    {extra}
  </div>
);

export function AthleteProfilePanel({
  card: recebida,
  player,
  onShowCard,
  onRetry,
}: AthleteProfilePanelProps) {
  const carta = recebida.erro ? { ...recebida, loading: true } : recebida;
  const reduzir = !!useReducedMotionConfig();
  const id = useId();
  const [medirRef, largura] = useElementWidth(375);
  const [aba, setAba] = useState<Aba>('geral');
  const abasRef = useRef<(HTMLButtonElement | null)[]>([]);
  const cartaRef = useRef<HTMLDivElement>(null);
  const [compartilhando, setCompartilhando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [aberta, setAberta] = useState<EditionEntry | null>(null);
  const fecharEdicao = useCallback(() => setAberta(null), []);

  const tom = tomDa(carta);
  const { card } = carta;
  const largo = largura >= 1024;
  const escala = largo ? 0.52 : largura >= 640 ? 0.44 : 0.36;
  const colunas = largura >= 1024 ? 5 : largura >= 560 ? 4 : 3;
  const apelido = player.apelido?.trim();

  const abaVista = useRef(aba);
  useEffect(() => {
    if (abaVista.current === aba) return;
    abaVista.current = aba;
    abasRef.current[ABAS.findIndex((a) => a.id === aba)]?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: reduzir ? 'auto' : 'smooth',
    });
  }, [aba, reduzir]);

  const irPara = (indice: number) => {
    const alvo = (indice + ABAS.length) % ABAS.length;
    setAba(ABAS[alvo].id);
    abasRef.current[alvo]?.focus();
  };

  const teclaNaAba = (evento: React.KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const destino =
      evento.key === 'ArrowRight'
        ? indice + 1
        : evento.key === 'ArrowLeft'
          ? indice - 1
          : evento.key === 'Home'
            ? 0
            : evento.key === 'End'
              ? ABAS.length - 1
              : null;
    if (destino == null) return;
    evento.preventDefault();
    irPara(destino);
  };

  const compartilhar = async () => {
    if (carta.loading || !cartaRef.current || compartilhando) return;
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

  return (
    <>
      <section
        ref={medirRef}
        aria-label="Perfil de atleta"
        aria-busy={recebida.loading ? true : undefined}
        className="@container relative isolate w-full overflow-x-clip bg-[linear-gradient(160deg,#14171c_0%,#0b0c0e_58%)] pb-14 text-white selection:bg-white/25"
      >
        <Veu key={`${carta.community.id}-${tom}`} tom={tom} />
        <div className="mx-auto grid w-full max-w-6xl px-4 @3xl:grid-cols-[minmax(0,0.38fr)_minmax(0,1fr)] @3xl:gap-x-10 @3xl:px-8 @5xl:gap-x-12">
          <div className="@3xl:col-start-1 @3xl:row-span-2 @3xl:row-start-2">
            <Retrato carta={carta} player={player} tom={tom} escala={escala} cartaRef={cartaRef} />
          </div>

          <motion.div
            className="relative z-10 -mt-14 @xl:-mt-16 @3xl:col-start-2 @3xl:row-start-2 @3xl:mt-10"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={CHEGADA}
          >
            <div className="flex items-center gap-3 @xl:gap-5">
              <Losango carta={carta} tom={tom} />
              <div className="min-w-0">
                <p
                  className="font-mono text-sm font-bold uppercase tracking-[0.18em]"
                  style={{ color: `color-mix(in srgb, ${tom} 70%, #ffffff)` }}
                >
                  {card.posLabel}
                </p>
                <h2
                  tabIndex={-1}
                  className="outline-none mt-1 text-balance break-words pt-[0.08em] text-[clamp(2.125rem,8.5cqw,4.25rem)] font-black uppercase italic leading-[0.9] tracking-[-0.035em]"
                >
                  {player.nome}
                </h2>
                {apelido && apelido !== player.nome && (
                  <p className="mt-1.5 font-mono text-sm text-white/70">{apelido}</p>
                )}
              </div>
            </div>

            <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.8125rem] uppercase tracking-[0.12em] text-white/70 tabular-nums">
              {recebida.erro ? (
                <>
                  <span>Não deu para carregar os números</span>
                  <span aria-hidden className="text-white/30">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="uppercase tracking-[0.12em] text-white underline decoration-white/40 underline-offset-4 outline-offset-2 hover:decoration-white focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    Tentar de novo
                  </button>
                </>
              ) : carta.loading ? (
                <span>montando a carta…</span>
              ) : (
                <>
                  <span>
                    geral <b className="text-white">{card.stats.rated ? card.stats.ovr : '?'}</b>
                  </span>
                  <span aria-hidden className="text-white/30">
                    /
                  </span>
                  <span
                    title="Forma: última nota menos a média recente"
                    aria-label={`forma ${formaRecente(card)}, última nota menos a média recente`}
                  >
                    forma <b className="text-white">{formaRecente(card)}</b>
                  </span>
                  {card.stats.rated && (
                    <>
                      <span aria-hidden className="text-white/30">
                        /
                      </span>
                      <Estrelas quantas={card.stats.versatility} tom={tom} />
                    </>
                  )}
                </>
              )}
            </p>
            {!carta.loading && (
              <p className="mt-3 max-w-[52ch] text-[0.9375rem] leading-relaxed text-white/80">
                {frase(carta)}
              </p>
            )}

            <div className="mt-6 grid gap-2 @xl:flex @xl:flex-wrap @xl:items-center @xl:[&>button]:w-auto">
              <button
                type="button"
                onClick={compartilhar}
                disabled={carta.loading || compartilhando}
                aria-busy={compartilhando}
                aria-label="Compartilhar"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-6 text-sm font-black uppercase italic tracking-[0.12em] text-white shadow-[0_10px_30px_rgba(37,99,235,0.35)] outline-offset-2 transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                <Share2 className="h-4 w-4" aria-hidden />
                {compartilhando ? 'Gerando imagem…' : 'Compartilhar'}
              </button>
              <button
                type="button"
                onClick={onShowCard}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] border border-white/15 bg-white/5 px-5 text-sm font-bold text-white outline-offset-2 transition-colors duration-150 hover:border-white/30 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Layers className="h-4 w-4" aria-hidden />
                Mostrar minha carta
              </button>
            </div>
            {falhou && (
              <p role="alert" className="mt-3 text-sm text-white/80">
                Não deu para gerar a imagem. Tente de novo.
              </p>
            )}
          </motion.div>

          <div
            role="tablist"
            aria-label="Seções do perfil"
            className="mt-10 flex overflow-x-auto border-b border-white/10 [scrollbar-width:none] @xl:gap-1 @3xl:col-span-2 @3xl:row-start-1 @3xl:mt-6"
          >
            {ABAS.map((a, i) => {
              const ativa = a.id === aba;
              return (
                <button
                  key={a.id}
                  ref={(el) => {
                    abasRef.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-label={a.nome}
                  id={`${id}-aba-${a.id}`}
                  aria-selected={ativa}
                  aria-controls={`${id}-painel`}
                  tabIndex={ativa ? 0 : -1}
                  onClick={() => setAba(a.id)}
                  onKeyDown={(evento) => teclaNaAba(evento, i)}
                  className={`relative h-12 min-w-11 flex-auto shrink-0 whitespace-nowrap px-1 text-[0.6875rem] font-black uppercase italic tracking-[0.02em] outline-none transition-colors duration-150 focus-visible:rounded-md focus-visible:bg-white/10 @xl:flex-none @xl:px-4 @xl:text-[0.8125rem] @xl:tracking-[0.08em] ${
                    ativa ? 'text-white' : 'text-white/60 hover:text-white/90'
                  }`}
                >
                  {a.curto === a.nome ? (
                    a.nome
                  ) : (
                    <>
                      <span className="@xl:hidden">{a.curto}</span>
                      <span className="hidden @xl:inline">{a.nome}</span>
                    </>
                  )}
                  {ativa && (
                    <motion.span
                      aria-hidden
                      layoutId={`${id}-sublinhado`}
                      className="absolute inset-x-1 -bottom-px h-[3px] rounded-full @xl:inset-x-4"
                      style={{ background: tom }}
                      transition={{ duration: DURATION.state, ease: EASE_ARRIVE }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            id={`${id}-painel`}
            aria-labelledby={`${id}-aba-${aba}`}
            tabIndex={0}
            className="@container mt-6 min-w-0 rounded-md outline-offset-4 focus-visible:outline-2 focus-visible:outline-primary @3xl:col-start-2 @3xl:row-start-3 @3xl:mt-10"
          >
            <motion.div
              key={aba}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: DURATION.state, ease: EASE_ARRIVE }}
            >
              {aba === 'geral' && (
                <div className="grid gap-x-12 gap-y-10 @[44rem]:grid-cols-[minmax(0,1fr)_17rem]">
                  <div className="@container min-w-0 @[44rem]:col-span-2">
                    <Status carta={carta} player={player} />
                  </div>
                  <div className="@container min-w-0">
                    <Grade carta={carta} player={player} />
                  </div>
                  <div>
                    <Titulo
                      extra={
                        <button
                          type="button"
                          onClick={() => irPara(1)}
                          className="whitespace-nowrap text-xs font-bold text-white/70 underline decoration-white/30 underline-offset-4 outline-offset-2 transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          Ver com barras
                        </button>
                      }
                    >
                      Fundamentos
                    </Titulo>
                    <ListaDeFundamentos carta={carta} tom={tom} barras={false} />
                  </div>
                </div>
              )}
              {aba === 'fundamentos' && (
                <div className="max-w-3xl">
                  <Titulo>Fundamentos</Titulo>
                  <p className="mb-6 max-w-[60ch] text-sm leading-relaxed text-white/70">
                    Na escala da carta, pela avaliação em {carta.community.name}.
                  </p>
                  <ListaDeFundamentos carta={carta} tom={tom} barras />
                </div>
              )}
              {aba === 'conquistas' && (
                <div className="[&>section]:mt-0">
                  <Album carta={carta} colunas={colunas} />
                </div>
              )}
              {aba === 'edicoes' && (
                <div className="[&>section]:mt-0">
                  <Colecao carta={carta} onAbrir={setAberta} />
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </section>
      {aberta && !carta.loading && (
        <EdicaoAberta carta={carta} entrada={aberta} reduzir={reduzir} onFechar={fecharEdicao} />
      )}
    </>
  );
}
