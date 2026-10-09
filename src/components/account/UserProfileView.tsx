import { useEffect, useRef, useState } from 'react';
import { useReducedMotionConfig } from 'motion/react';
import { User, Activity, Settings, Cloud, CheckCircle2 } from 'lucide-react';
import type { Player, UserProfile, Position } from '../../types';
import { SettingsModule } from '../settings/SettingsModule';
import { Link } from 'react-router';
import type { MyCard } from '@app/myCards';
import { AthleteProfilePanel } from './AthleteProfilePanel';
import { MyCardDeck } from './MyCardDeck';

const POSITION_SIGLAS: Record<Position, string> = {
  levantador: 'LEV',
  oposto: 'OPO',
  ponteiro: 'PON',
  central: 'CEN',
  libero: 'LIB',
  'all-rounder': 'UNI',
};

export interface UserProfileViewProps {
  user?: { email?: string; id?: string } | null;
  profile?:
    | (UserProfile & { username?: string; avatar_url?: string; display_name?: string })
    | null;
  player?: Player | null;
  myCards?: {
    cards: MyCard[];
    selectedCommunityId: string | null;
    onSelect: (communityId: string) => void;
    view: 'carta' | 'atleta';
    onOpenProfile: (communityId: string) => void;
    onShowCard: () => void;
  };
  onExportBackup?: () => void;
  onImportBackup?: (file: File) => void;
  onRestoreDemoPlayers?: () => void;
}

export function UserProfileView({
  user,
  profile,
  player,
  myCards,
  onExportBackup,
  onImportBackup,
  onRestoreDemoPlayers,
}: UserProfileViewProps) {
  const [activeTab, setActiveTab] = useState<'perfil' | 'configuracoes'>('perfil');
  const dataTools =
    onExportBackup && onImportBackup && onRestoreDemoPlayers
      ? { onExportBackup, onImportBackup, onRestoreDemoPlayers }
      : null;

  const reduzir = !!useReducedMotionConfig();
  const cartasRef = useRef<HTMLDivElement>(null);
  const vista = myCards?.view;
  const vistaAnterior = useRef(vista);

  useEffect(() => {
    if (vistaAnterior.current === vista) return;
    vistaAnterior.current = vista;
    const regiao = cartasRef.current;
    if (!regiao) return;
    regiao.scrollIntoView({ block: 'start', behavior: reduzir ? 'auto' : 'smooth' });
    regiao.querySelector<HTMLElement>('section h2')?.focus({ preventScroll: true });
  }, [vista, reduzir]);

  const archetype = player?.perfil?.arquetipo;
  const atletaCard =
    myCards?.view === 'atleta'
      ? (myCards.cards.find((c) => c.community.id === myCards.selectedCommunityId) ??
        myCards.cards[0] ??
        null)
      : null;

  return (
    <div className="space-y-6 pb-12 max-w-4xl mx-auto select-none">
      {/* 1. HERO ATHLETE CARD / HEADER */}
      <div className="card card-border bg-base-200 overflow-hidden shadow-2xl rounded-3xl border border-white/10">
        <div className="h-28 bg-gradient-to-r from-primary via-indigo-600 to-rose-600 relative p-6 flex justify-between items-start">
          <div className="flex gap-2">
            {player?.numeroCamisa != null && (
              <span className="badge badge-neutral backdrop-blur bg-black/40 border-white/20 text-white font-mono font-black text-xs px-3 py-2">
                #{player.numeroCamisa}
              </span>
            )}
            {player?.posicaoPrincipal && (
              <span className="badge badge-warning font-black text-xs uppercase px-3 py-2 shadow-md">
                {POSITION_SIGLAS[player.posicaoPrincipal]}
              </span>
            )}
          </div>
        </div>

        <div className="px-6 pb-6 pt-0 relative">
          <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between -mt-12 mb-4 gap-4">
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 text-center sm:text-left">
              <div className="avatar placeholder">
                <div className="w-24 h-24 rounded-2xl bg-base-100 ring-4 ring-base-200 shadow-2xl flex items-center justify-center overflow-hidden">
                  {player?.avatarUrl || profile?.avatar_url ? (
                    <img
                      src={player?.avatarUrl || profile?.avatar_url}
                      alt={player?.nome || profile?.name || 'Avatar'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-12 h-12 text-primary" />
                  )}
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-black uppercase tracking-tight text-base-content flex items-center gap-2 justify-center sm:justify-start">
                  {player?.apelido ||
                    player?.nome ||
                    profile?.display_name ||
                    profile?.name ||
                    'Atleta Panelinha'}
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                </h2>
                <p className="text-xs text-text-muted font-mono">
                  {profile?.username
                    ? `@${profile.username}`
                    : user?.email || profile?.email || 'Atleta Local'}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2 justify-center sm:justify-start text-[11px] font-bold text-base-content/70">
                  {archetype && <span className="badge badge-ghost badge-sm">{archetype}</span>}
                  {player?.maoDominante && (
                    <span className="capitalize text-text-muted">• Mao {player.maoDominante}</span>
                  )}
                  {player?.alturaCm && (
                    <span className="text-text-muted">• {player.alturaCm} cm</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to="/perfil/sync"
                className="btn btn-outline btn-sm min-h-[44px] gap-2 rounded-xl text-xs uppercase font-bold"
              >
                <Cloud className="w-4 h-4 text-info" />
                <span>Nuvem Sync</span>
              </Link>
            </div>
          </div>

          {/* STATUS DA NUVEM / VÍNCULO */}
          <div className="bg-base-300/40 border border-base-300 rounded-2xl p-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-base-content/80">
              <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
              <span>
                Conta Vinculada:{' '}
                <strong className="text-base-content">
                  {user?.email || profile?.email || 'Modo Local (Offline)'}
                </strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. ABAS DE NAVEGAÇÃO */}
      {dataTools && (
        <div className="flex flex-wrap border-b border-base-300 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('perfil')}
            className={`pb-3 text-sm font-bold uppercase tracking-wider min-h-[44px] flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'perfil'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-base-content'
            }`}
          >
            <Activity className="w-4 h-4" /> Minha carta
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('configuracoes')}
            className={`pb-3 text-sm font-bold uppercase tracking-wider min-h-[44px] flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'configuracoes'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-base-content'
            }`}
          >
            <Settings className="w-4 h-4" /> Configurações & Dados
          </button>
        </div>
      )}

      {/* 3. CONTEÚDO DAS ABAS */}
      {activeTab === 'perfil' || !dataTools ? (
        <div ref={cartasRef} className="scroll-mt-24">
          {myCards &&
            (atletaCard && player ? (
              <AthleteProfilePanel
                card={atletaCard}
                player={player}
                onShowCard={myCards.onShowCard}
              />
            ) : (
              <MyCardDeck
                cards={myCards.cards}
                selectedCommunityId={myCards.selectedCommunityId}
                onSelect={myCards.onSelect}
                onOpenProfile={myCards.onOpenProfile}
              />
            ))}
        </div>
      ) : (
        /* ABA CONFIGURAÇÕES & BACKUP */
        <div className="space-y-6">
          <SettingsModule
            onExportBackup={dataTools.onExportBackup}
            onImportBackup={dataTools.onImportBackup}
            onRestoreDemoPlayers={dataTools.onRestoreDemoPlayers}
          />
        </div>
      )}
    </div>
  );
}
