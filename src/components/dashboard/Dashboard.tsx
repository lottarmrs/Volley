import React from 'react';
import {
  Plus,
  History as HistoryIcon,
  Play,
  RotateCcw,
  Users,
  Zap,
  Sparkles,
  ChevronRight,
  Shield,
} from 'lucide-react';
import type { ScreenContract } from '@app/screens/screenContract';
import type { DashboardModel } from '@app/screens/dashboard/dashboardModel';
import type { DashboardIntent } from '@app/screens/dashboard/dashboardIntents';
import { derivePhase, PHASE_LABEL } from '@domain/sessionPhase';

interface DashboardProps {
  contract: ScreenContract<DashboardModel, DashboardIntent>;
}

export function Dashboard({ contract }: DashboardProps) {
  const { model, dispatch } = contract;
  const { activeSession, sessionDraft, games } = model;
  const phase = derivePhase(activeSession, games);
  const mostrarCardAtivo = phase !== 'rascunho' && phase !== 'encerrada';

  return (
    <div className="space-y-6 select-none">
      {/* 1. HERO / BANNER PRINCIPAL */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary/15 via-base-200 to-base-300 border border-primary/25 shadow-xl p-6 sm:p-8 flex flex-col sm:flex-row justify-between sm:items-center gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4" /> Central de Comando
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">
            Bem-vindo ao Panelinha
          </h2>
          <p className="text-xs sm:text-sm text-base-content/70 leading-relaxed">
            Plataforma local-first de gerenciamento de campeonatos, partidas e equilíbrio de equipes
            com algoritmo Web Worker.
          </p>
        </div>
        <div className="flex gap-3 shrink-0 w-full sm:w-auto">
          <button
            onClick={() => dispatch({ kind: 'newSession' })}
            className="btn btn-primary btn-md font-black uppercase tracking-wider px-6 shadow-lg shadow-primary/20 gap-2 min-h-[48px] w-full sm:w-auto"
          >
            <Plus className="w-5 h-5" /> Nova Sessão
          </button>
        </div>
      </div>

      {/* 2. ALERTAS DE SESSÃO ATIVA OU RASCUNHO PENDENTE */}
      <div className="grid grid-cols-1 gap-4">
        {mostrarCardAtivo && activeSession && (
          <div className="alert alert-success alert-soft p-5 border border-success/30 flex flex-col sm:flex-row gap-4 items-center justify-between rounded-2xl shadow-md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-success/15 flex items-center justify-center border border-success/20 shrink-0">
                <Play className="w-6 h-6 text-success animate-pulse" />
              </div>
              <div className="text-left">
                <span className="badge badge-success font-bold text-[9px] uppercase tracking-wider px-2.5 py-0.5">
                  {PHASE_LABEL[phase]} • Ao Vivo
                </span>
                <h2 className="text-base font-black uppercase tracking-tight text-white mt-1">
                  {activeSession.name}
                </h2>
                <p className="text-xs text-base-content/60 font-medium">
                  {activeSession.type === 'free_play' ? 'Jogo Livre (Pelada)' : 'Torneio Oficial'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto justify-end shrink-0">
              <button
                onClick={() => dispatch({ kind: 'clearActiveSession' })}
                className="btn btn-ghost btn-sm text-error hover:bg-error/10 min-h-[44px]"
              >
                Descartar
              </button>
              <button
                onClick={() => dispatch({ kind: 'resumeSession' })}
                className="btn btn-success btn-sm text-black font-black uppercase px-5 min-h-[44px]"
              >
                Continuar Partida
              </button>
            </div>
          </div>
        )}

        {sessionDraft && !mostrarCardAtivo && (
          <div className="alert alert-warning alert-soft p-5 border border-warning/30 flex flex-col sm:flex-row gap-4 items-center justify-between rounded-2xl shadow-md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-warning/15 flex items-center justify-center border border-warning/20 shrink-0">
                <RotateCcw className="w-6 h-6 text-warning" />
              </div>
              <div className="text-left">
                <span className="badge badge-warning font-bold text-[9px] uppercase tracking-wider px-2.5 py-0.5 text-amber-950">
                  Rascunho Salvo
                </span>
                <h2 className="text-base font-black uppercase tracking-tight text-white mt-1">
                  {sessionDraft.session.name}
                </h2>
                <p className="text-xs text-base-content/60">
                  Sessão com elenco e times pré-configurados.
                </p>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto justify-end shrink-0">
              <button
                onClick={() => dispatch({ kind: 'clearDraft' })}
                className="btn btn-ghost btn-sm text-error hover:bg-error/10 min-h-[44px]"
              >
                Descartar
              </button>
              <button
                onClick={() => dispatch({ kind: 'resumeDraft', draft: sessionDraft })}
                className="btn btn-warning btn-sm text-amber-950 font-black uppercase px-5 min-h-[44px]"
              >
                Continuar Rascunho
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. MÓDULOS DE NAVEGAÇÃO E RECURSOS PRINCIPAIS */}
      <div className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-wider text-base-content/50 px-1">
          Módulos da Plataforma
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* CARD 1: NOVA SESSÃO / SORTED TRIPLE */}
          <div
            onClick={() => dispatch({ kind: 'newSession' })}
            className="card bg-base-200 border border-base-300 p-5 rounded-2xl hover:border-primary hover:bg-base-200/80 transition-all duration-200 hover:shadow-xl group cursor-pointer flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase text-white tracking-tight flex items-center justify-between">
                  Nova Pelada{' '}
                  <ChevronRight className="w-4 h-4 text-base-content/40 group-hover:text-primary transition-colors" />
                </h3>
                <p className="text-xs text-base-content/60 mt-1 leading-relaxed">
                  Criar sessão, selecionar elenco e sortear equipes em 1 clique.
                </p>
              </div>
            </div>
            <div className="pt-4 border-t border-base-300/50 mt-4 flex items-center justify-between text-[11px] font-bold text-primary">
              <span>Sortear Equipes</span>
              <span>→</span>
            </div>
          </div>

          {/* CARD 2: GESTÃO DE ATLETAS */}
          <div
            onClick={() => dispatch({ kind: 'players' })}
            className="card bg-base-200 border border-base-300 p-5 rounded-2xl hover:border-accent hover:bg-base-200/80 transition-all duration-200 hover:shadow-xl group cursor-pointer flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase text-white tracking-tight flex items-center justify-between">
                  Atletas{' '}
                  <ChevronRight className="w-4 h-4 text-base-content/40 group-hover:text-accent transition-colors" />
                </h3>
                <p className="text-xs text-base-content/60 mt-1 leading-relaxed">
                  Fichas técnicas, níveis de fundamentos e avaliações individuais.
                </p>
              </div>
            </div>
            <div className="pt-4 border-t border-base-300/50 mt-4 flex items-center justify-between text-[11px] font-bold text-accent">
              <span>Gerenciar Elenco</span>
              <span>→</span>
            </div>
          </div>

          {/* CARD 3: COMUNIDADES */}
          <div
            onClick={() => dispatch({ kind: 'communities' })}
            className="card bg-base-200 border border-base-300 p-5 rounded-2xl hover:border-secondary hover:bg-base-200/80 transition-all duration-200 hover:shadow-xl group cursor-pointer flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center text-secondary group-hover:scale-110 transition-transform">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase text-white tracking-tight flex items-center justify-between">
                  Comunidades{' '}
                  <ChevronRight className="w-4 h-4 text-base-content/40 group-hover:text-secondary transition-colors" />
                </h3>
                <p className="text-xs text-base-content/60 mt-1 leading-relaxed">
                  Organizar grupos recorrentes, presenças e convocatórias WhatsApp.
                </p>
              </div>
            </div>
            <div className="pt-4 border-t border-base-300/50 mt-4 flex items-center justify-between text-[11px] font-bold text-secondary">
              <span>Ver Grupos</span>
              <span>→</span>
            </div>
          </div>

          {/* CARD 4: HISTÓRICO & AGENDA */}
          <div
            onClick={() => dispatch({ kind: 'history' })}
            className="card bg-base-200 border border-base-300 p-5 rounded-2xl hover:border-emerald-500 hover:bg-base-200/80 transition-all duration-200 hover:shadow-xl group cursor-pointer flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                <HistoryIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase text-white tracking-tight flex items-center justify-between">
                  Histórico{' '}
                  <ChevronRight className="w-4 h-4 text-base-content/40 group-hover:text-emerald-400 transition-colors" />
                </h3>
                <p className="text-xs text-base-content/60 mt-1 leading-relaxed">
                  Consultar partidas finalizadas, estatísticas e relatórios antigos.
                </p>
              </div>
            </div>
            <div className="pt-4 border-t border-base-300/50 mt-4 flex items-center justify-between text-[11px] font-bold text-emerald-400">
              <span>Ver Histórico</span>
              <span>→</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
