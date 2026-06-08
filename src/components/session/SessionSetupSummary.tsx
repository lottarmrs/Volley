import React from 'react';
import { Player, Session } from '../../types';
import { Users, Calendar, MapPin, Trophy, Clock, Target, RotateCw } from 'lucide-react';

interface SessionSetupSummaryProps {
  session: Session;
  selectedPlayers: Player[];
}

export function SessionSetupSummary({ session, selectedPlayers }: SessionSetupSummaryProps) {
  const males = selectedPlayers.filter(p => p.genero === 'M').length;
  const females = selectedPlayers.filter(p => p.genero === 'F').length;
  
  return (
    <div className="card card-border bg-base-200 h-fit lg:sticky lg:top-8">
      <div className="card-body p-6 space-y-4">
        <h3 className="card-title text-xs font-bold uppercase tracking-[0.2em] text-accent border-b border-base-300 pb-4">Resumo da Sessão</h3>
        
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 p-1 bg-base-100 rounded">
              <Calendar className="w-3.5 h-3.5 text-text-muted" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-text-muted leading-none mb-1">Nome & Data</p>
              <p className="text-xs font-bold text-base-content uppercase">{session.name || '---'}</p>
              <p className="text-[10px] text-text-muted font-mono">{session.date || '---'}</p>
            </div>
          </div>

          {session.location && (
            <div className="flex items-start gap-3">
              <div className="mt-1 p-1 bg-base-100 rounded">
                <MapPin className="w-3.5 h-3.5 text-text-muted" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-text-muted leading-none mb-1">Local</p>
                <p className="text-xs font-bold text-base-content uppercase">{session.location}</p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3">
            <div className="mt-1 p-1 bg-base-100 rounded">
              <Users className="w-3.5 h-3.5 text-text-muted" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-text-muted leading-none mb-1">Atletas Selecionados</p>
              <p className="text-sm font-bold text-base-content">{selectedPlayers.length}</p>
              <p className="text-[9px] font-bold text-base-content/60 uppercase">
                <span className="text-info">{males}M</span> / <span className="text-secondary">{females}F</span>
              </p>
            </div>
          </div>

          {session.type && (
            <div className="flex items-start gap-3 border-t border-base-300 pt-4">
              <div className="mt-1 p-1 bg-base-100 rounded">
                {session.type === 'free_play' ? <Clock className="w-3.5 h-3.5 text-accent" /> : <Trophy className="w-3.5 h-3.5 text-primary" />}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-text-muted leading-none mb-1">Formato</p>
                <p className="text-xs font-bold text-base-content uppercase">{session.type === 'free_play' ? 'Jogo Livre' : 'Torneio'}</p>
                {session.config && (
                  <p className="text-[9px] font-bold text-text-muted uppercase mt-1">
                    {session.config.teamCount} Times • {session.config.maxPoints} Pts • {session.config.tieBreakMethod === 'direct_3' ? '3 Direto' : 'Vai a 2'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {selectedPlayers.length > 0 && session.config && (
          <div className="mt-6 pt-4 border-t border-base-300">
            <div className="flex justify-between items-center bg-base-100 p-3 rounded-lg border border-base-300">
               <div>
                  <p className="text-[8px] font-bold text-text-muted uppercase">Atletas / Time</p>
                  <p className="text-xs font-bold font-mono text-base-content">~{(selectedPlayers.length / session.config.teamCount).toFixed(1)}</p>
               </div>
               <div className="text-right">
                  <p className="text-[8px] font-bold text-text-muted uppercase">Equilíbrio</p>
                  <p className="text-xs font-bold font-mono text-success">Estimado</p>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
