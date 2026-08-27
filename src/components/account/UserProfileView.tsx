import React, { useState } from 'react';
import {
  User,
  Shield,
  Trophy,
  Flame,
  Zap,
  Activity,
  Award,
  Settings,
  Cloud,
  CheckCircle2,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import type { Player, Community, UserProfile, Position } from '../../types';
import { SettingsModule } from '../settings/SettingsModule';
import { Link } from 'react-router';

import { calculatePositionOverall } from '../../logic/calculations';

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
  communities?: Community[];
  lastSyncedAt?: string | null;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onRestoreDemoPlayers: () => void;
}

export function UserProfileView({
  user,
  profile,
  player,
  communities = [],
  lastSyncedAt,
  onExportBackup,
  onImportBackup,
  onRestoreDemoPlayers,
}: UserProfileViewProps) {
  const [activeTab, setActiveTab] = useState<'perfil' | 'configuracoes'>('perfil');

  const defaultAtributos = {
    saque: 7,
    recepcao: 7,
    levantamento: 7,
    ataque: 7,
    defesa: 7,
    bloqueio: 7,
    velocidade: 7,
    resistencia: 7,
    leituraDeJogo: 7,
    regularidade: 7,
    controleEmocional: 7,
  };

  const effectivePlayer = player
    ? {
        ...player,
        atributos: {
          ...defaultAtributos,
          ...(player.atributos || {}),
        },
      }
    : null;

  const rawOvr = effectivePlayer
    ? calculatePositionOverall(effectivePlayer, effectivePlayer.posicaoPrincipal)
    : 70;
  const overallScore = Number.isFinite(rawOvr) && rawOvr > 0 ? rawOvr : 70;

  const saque = effectivePlayer?.atributos.saque ?? 7;
  const recepcao = effectivePlayer?.atributos.recepcao ?? 7;
  const levantamento = effectivePlayer?.atributos.levantamento ?? 7;
  const ataque = effectivePlayer?.atributos.ataque ?? 7;
  const defesa = effectivePlayer?.atributos.defesa ?? 7;

  const attrs = {
    saque: saque > 10 ? Math.round(saque) : Math.round(saque * 10),
    recepcao: recepcao > 10 ? Math.round(recepcao) : Math.round(recepcao * 10),
    levantamento: levantamento > 10 ? Math.round(levantamento) : Math.round(levantamento * 10),
    ataque: ataque > 10 ? Math.round(ataque) : Math.round(ataque * 10),
    defesa: defesa > 10 ? Math.round(defesa) : Math.round(defesa * 10),
  };

  const archetype = player?.perfil?.arquetipo || 'Atleta Polivalente';

  return (
    <div className="space-y-6 pb-12 max-w-4xl mx-auto select-none">
      {/* 1. HERO ATHLETE CARD / HEADER */}
      <div className="card card-border bg-base-200 overflow-hidden shadow-2xl rounded-3xl border border-white/10">
        <div className="h-28 bg-gradient-to-r from-primary via-indigo-600 to-rose-600 relative p-6 flex justify-between items-start">
          <div className="flex gap-2">
            <span className="badge badge-neutral backdrop-blur bg-black/40 border-white/20 text-white font-mono font-black text-xs px-3 py-2">
              #{player?.numeroCamisa ?? 10}
            </span>
            {player?.posicaoPrincipal && (
              <span className="badge badge-warning font-black text-xs uppercase px-3 py-2 shadow-md">
                {POSITION_SIGLAS[player.posicaoPrincipal]}
              </span>
            )}
          </div>
          <span className="badge badge-accent font-black uppercase text-[10px] tracking-wider px-3 py-2">
            {overallScore} OVR
          </span>
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
                  <span className="badge badge-ghost badge-sm">{archetype}</span>
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
            {lastSyncedAt && (
              <span className="text-[10px] font-mono text-text-muted">
                Último sync:{' '}
                {new Date(lastSyncedAt).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. ABAS DE NAVEGAÇÃO */}
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
          <Activity className="w-4 h-4" /> Desempenho & Habilidades
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

      {/* 3. CONTEÚDO DAS ABAS */}
      {activeTab === 'perfil' ? (
        <div className="space-y-6">
          {/* ESTATÍSTICAS RÁPIDAS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card card-border bg-base-200 p-4 rounded-2xl border border-base-300 text-center space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">
                Partidas
              </span>
              <p className="text-2xl font-black font-mono text-base-content">
                {player?.formaAtual?.ultimasPartidas?.length || 12}
              </p>
            </div>
            <div className="card card-border bg-base-200 p-4 rounded-2xl border border-base-300 text-center space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">
                Aproveitamento
              </span>
              <p className="text-2xl font-black font-mono text-success">68%</p>
            </div>
            <div className="card card-border bg-base-200 p-4 rounded-2xl border border-base-300 text-center space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">
                Sequência
              </span>
              <p className="text-2xl font-black font-mono text-amber-500 flex items-center justify-center gap-1">
                <Flame className="w-5 h-5 fill-amber-500" /> 4V
              </p>
            </div>
            <div className="card card-border bg-base-200 p-4 rounded-2xl border border-base-300 text-center space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">
                Rating OVR
              </span>
              <p className="text-2xl font-black font-mono text-primary">{overallScore}</p>
            </div>
          </div>

          {/* ATRIBUTOS & HABILIDADES */}
          <div className="card card-border bg-base-200 p-6 rounded-3xl space-y-4 border border-base-300">
            <div className="flex items-center justify-between border-b border-base-300 pb-3">
              <h3 className="text-base font-black uppercase tracking-wider text-base-content flex items-center gap-2">
                <Zap className="w-5 h-5 text-accent" /> Atributos de Vôlei
              </h3>
              <span className="text-xs text-text-muted font-semibold">Avaliação Geral</span>
            </div>

            <div className="space-y-3">
              <AttributeRow label="Saque" value={attrs.saque} color="bg-primary" />
              <AttributeRow
                label="Recepção / Passe"
                value={attrs.recepcao}
                color="bg-emerald-500"
              />
              <AttributeRow label="Levantamento" value={attrs.levantamento} color="bg-amber-500" />
              <AttributeRow label="Ataque" value={attrs.ataque} color="bg-rose-500" />
              <AttributeRow label="Defesa & Bloqueio" value={attrs.defesa} color="bg-indigo-500" />
            </div>
          </div>

          {/* MINHAS COMUNIDADES */}
          <div className="card card-border bg-base-200 p-6 rounded-3xl space-y-4 border border-base-300">
            <div className="flex items-center justify-between border-b border-base-300 pb-3">
              <h3 className="text-base font-black uppercase tracking-wider text-base-content flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" /> Minhas Comunidades & Panelinhas (
                {communities.length})
              </h3>
              <Link
                to="/comunidades"
                className="text-xs text-primary font-bold uppercase hover:underline"
              >
                Ver todas
              </Link>
            </div>

            {communities.length === 0 ? (
              <p className="text-xs text-text-muted italic py-2">
                Você ainda não participa de nenhuma comunidade de vôlei.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {communities.map((community) => (
                  <Link
                    key={community.id}
                    to={`/comunidades/${community.id}`}
                    className="p-3 rounded-2xl bg-base-100 border border-base-300 hover:border-primary/50 flex items-center justify-between transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center font-black text-primary text-sm">
                        {community.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-base-content group-hover:text-primary transition-colors">
                          {community.name}
                        </h4>
                        <span className="text-[10px] font-semibold text-text-muted">
                          {community.joinCode ? `Código: ${community.joinCode}` : 'Pública'}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-muted group-hover:translate-x-1 transition-transform" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* GALERIA DE CONQUISTAS */}
          <div className="card card-border bg-base-200 p-6 rounded-3xl space-y-4 border border-base-300">
            <div className="flex items-center justify-between border-b border-base-300 pb-3">
              <h3 className="text-base font-black uppercase tracking-wider text-base-content flex items-center gap-2">
                <Award className="w-5 h-5 text-warning" /> Conquistas & Medalhas
              </h3>
              <span className="text-xs text-text-muted font-bold">3 Desbloqueadas</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <BadgeCard
                icon={<Sparkles className="w-5 h-5 text-amber-400" />}
                title="Sacador de Elite"
                desc="Anotou mais de 10 aces em partidas da comunidade."
                unlocked
              />
              <BadgeCard
                icon={<Trophy className="w-5 h-5 text-amber-500" />}
                title="Rei da Quadra"
                desc="Venceu 5 partidas seguidas no formato Ganhou Fica."
                unlocked
              />
              <BadgeCard
                icon={<Shield className="w-5 h-5 text-emerald-400" />}
                title="Paredão Insuperável"
                desc="Líder de bloqueios em um torneio oficial."
                unlocked
              />
            </div>
          </div>
        </div>
      ) : (
        /* ABA CONFIGURAÇÕES & BACKUP */
        <div className="space-y-6">
          <SettingsModule
            onExportBackup={onExportBackup}
            onImportBackup={onImportBackup}
            onRestoreDemoPlayers={onRestoreDemoPlayers}
          />
        </div>
      )}
    </div>
  );
}

function AttributeRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
        <span className="text-base-content/80">{label}</span>
        <span className="font-mono text-base-content">{value}</span>
      </div>
      <div className="w-full h-2.5 bg-base-100 rounded-full overflow-hidden border border-white/5">
        <div
          className={`h-full ${color} origin-left transition-transform duration-300 rounded-full w-full`}
          style={{ transform: `scaleX(${Math.min(100, Math.max(0, value)) / 100})` }}
        />
      </div>
    </div>
  );
}

function BadgeCard({
  icon,
  title,
  desc,
  unlocked,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  unlocked?: boolean;
}) {
  return (
    <div
      className={`p-4 rounded-2xl border ${
        unlocked
          ? 'bg-base-100/90 border-warning/30 shadow-md'
          : 'bg-base-300/20 border-base-300 opacity-50'
      } flex items-start gap-3`}
    >
      <div className="p-2.5 rounded-xl bg-base-200 border border-base-300">{icon}</div>
      <div className="space-y-1">
        <h4 className="text-xs font-black uppercase text-base-content">{title}</h4>
        <p className="text-[10px] text-text-muted leading-tight">{desc}</p>
      </div>
    </div>
  );
}
