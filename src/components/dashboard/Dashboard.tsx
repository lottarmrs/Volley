import React from 'react';
import { Plus, History as HistoryIcon, Play, RotateCcw } from 'lucide-react';
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
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="card bg-base-200 border border-base-300 shadow-xl p-6 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-white uppercase tracking-tight">
            Bem-vindo ao Panelinha
          </h1>
          <p className="text-xs text-base-content/60 mt-1">
            Plataforma de gerenciamento de campeonatos, partidas e equilíbrio de equipes.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => dispatch({ kind: 'newSession' })} className="btn btn-primary">
            <Plus className="w-4 h-4" /> Nova Sessão
          </button>
        </div>
      </div>

      {/* Active and Draft Sessions Alert */}
      <div className="grid grid-cols-1 gap-4">
        {mostrarCardAtivo && activeSession && (
          <div className="alert alert-success alert-soft p-5 border border-success/30 flex flex-col sm:flex-row gap-4 items-center justify-between rounded-2xl">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-success/15 flex items-center justify-center border border-success/20 shrink-0">
                <Play className="w-5 h-5 text-success animate-pulse" />
              </div>
              <div className="text-left">
                <span className="badge badge-success badge-soft font-bold text-[8px] uppercase">
                  {PHASE_LABEL[phase]}
                </span>
                <h2 className="text-sm font-bold uppercase tracking-tight text-white mt-1">
                  {activeSession.name}
                </h2>
                <p className="text-[10px] text-base-content/50 uppercase font-semibold mt-0.5">
                  {activeSession.type === 'free_play' ? 'Jogo Livre' : 'Torneio'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto justify-end">
              <button
                onClick={() => dispatch({ kind: 'clearActiveSession' })}
                className="btn btn-ghost btn-sm text-error hover:bg-error/10 flex-1 sm:flex-initial"
              >
                Descartar
              </button>
              <button
                onClick={() => dispatch({ kind: 'resumeSession' })}
                className="btn btn-success btn-sm text-black font-bold flex-1 sm:flex-initial"
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {sessionDraft && !mostrarCardAtivo && (
          <div className="alert alert-warning alert-soft p-5 border border-warning/30 flex flex-col sm:flex-row gap-4 items-center justify-between rounded-2xl">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-warning/15 flex items-center justify-center border border-warning/20 shrink-0">
                <RotateCcw className="w-5 h-5 text-warning" />
              </div>
              <div className="text-left">
                <span className="badge badge-neutral badge-soft text-[8px] font-bold uppercase">
                  Rascunho Pendente
                </span>
                <h2 className="text-sm font-bold uppercase tracking-tight text-white mt-1">
                  {sessionDraft.session.name}
                </h2>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto justify-end">
              <button
                onClick={() => dispatch({ kind: 'clearDraft' })}
                className="btn btn-ghost btn-sm text-error hover:bg-error/10 flex-1 sm:flex-initial"
              >
                Descartar
              </button>
              <button
                onClick={() => dispatch({ kind: 'resumeDraft', draft: sessionDraft })}
                className="btn btn-warning btn-sm text-black font-bold flex-1 sm:flex-initial"
              >
                Continuar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Administrative Options */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div
          onClick={() => dispatch({ kind: 'newSession' })}
          className="card bg-base-100 shadow-sm border border-base-300 overflow-hidden hover:border-primary hover:bg-primary/5 transition-all duration-300 hover:shadow-lg group cursor-pointer flex flex-col"
        >
          <figure className="h-40 overflow-hidden bg-base-300 relative">
            <img
              src="https://lncimg.lance.com.br/uploads/2026/03/selecao-volei-fem-2-aspect-ratio-512-320.jpg"
              alt="Nova Sessão"
              className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
            />
          </figure>
          <div className="card-body p-5 flex flex-col justify-between flex-1">
            <div>
              <h2 className="card-title text-sm font-bold uppercase tracking-tight text-white">
                Nova Sessão
              </h2>
              <p className="text-xs text-base-content/60 mt-2 leading-relaxed">
                Criar novo evento, selecionar elenco e equilibrar equipes de forma inteligente.
              </p>
            </div>
          </div>
        </div>

        <div
          onClick={() => dispatch({ kind: 'players' })}
          className="card bg-base-100 shadow-sm border border-base-300 overflow-hidden hover:border-accent hover:bg-accent/5 transition-all duration-300 hover:shadow-lg group cursor-pointer flex flex-col"
        >
          <figure className="h-40 overflow-hidden bg-base-300 relative">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/7/7f/Volleyball_dig_by_Denys_Fomin.jpg"
              alt="Atletas"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          </figure>
          <div className="card-body p-5 flex flex-col justify-between flex-1">
            <div>
              <h2 className="card-title text-sm font-bold uppercase tracking-tight text-white">
                Atletas
              </h2>
              <p className="text-xs text-base-content/60 mt-2 leading-relaxed">
                Gerenciar fichas técnicas, habilidades individuais, posições e forma física dos
                jogadores.
              </p>
            </div>
          </div>
        </div>

        <div
          onClick={() => dispatch({ kind: 'communities' })}
          className="card bg-base-100 shadow-sm border border-base-300 overflow-hidden hover:border-secondary hover:bg-secondary/5 transition-all duration-300 hover:shadow-lg group cursor-pointer flex flex-col"
        >
          <figure className="h-40 overflow-hidden bg-base-300 relative">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/c/c9/Brasil_%C3%A9_ouro_no_v%C3%B4lei_masculino_1039374-210816_mg_69150004.jpg"
              alt="Comunidades"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          </figure>
          <div className="card-body p-5 flex flex-col justify-between flex-1">
            <div>
              <h2 className="card-title text-sm font-bold uppercase tracking-tight text-white">
                Comunidades
              </h2>
              <p className="text-xs text-base-content/60 mt-2 leading-relaxed">
                Organizar grupos de jogadores recorrentes, filtrar participantes e definir
                presenças.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* History link card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          onClick={() => dispatch({ kind: 'history' })}
          className="card bg-base-200 border border-base-300 shadow-md p-5 flex flex-row items-center gap-4 hover:bg-base-300 transition-all text-left cursor-pointer"
        >
          <HistoryIcon className="w-6 h-6 text-base-content/60" />
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              Histórico de Sessões
            </span>
            <p className="text-[10px] text-base-content/40 uppercase mt-0.5">
              Consultar partidas e relatórios antigos
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
