import React, { lazy, Suspense, useState, useEffect } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
  Calendar as CalendarIcon,
  Clock,
  Trophy,
  Volleyball,
} from 'lucide-react';
import { Link } from 'react-router';
import { paths } from '@app/appRoutes';
import { EmptyState } from '../../ui/EmptyState';
import type { AgendaItem } from '@app/agendaViewModel';

// O DayPilot pesa 410 KB e só serve às visões de grade. A agenda vazia e a
// visão de lista renderizam sem ele.
const AgendaCalendar = lazy(() =>
  import('./AgendaCalendar').then((module) => ({ default: module.AgendaCalendar })),
);

function sanitizeDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  return dateStr.split('T')[0];
}

function formatHeaderTitle(dateStr: string, viewMode: CalendarViewMode): string {
  const cleanDate = sanitizeDate(dateStr);
  const d = new Date(`${cleanDate}T12:00:00`);

  if (viewMode === 'Month') {
    const monthName = d.toLocaleDateString('pt-BR', { month: 'long' });
    const year = d.getFullYear();
    return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${year}`;
  }

  if (viewMode === 'Week') {
    const dayOfWeek = d.getDay();
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const mon = new Date(d);
    mon.setDate(d.getDate() + diffToMon);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);

    const monDay = mon.getDate();
    const sunDay = sun.getDate();

    if (mon.getMonth() === sun.getMonth()) {
      const fullMonth = mon.toLocaleDateString('pt-BR', { month: 'long' });
      return `${monDay} a ${sunDay} de ${fullMonth.charAt(0).toUpperCase() + fullMonth.slice(1)} de ${mon.getFullYear()}`;
    }
    const monMonth = mon.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    const sunMonth = sun.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    return `${monDay} ${monMonth} – ${sunDay} ${sunMonth} de ${sun.getFullYear()}`;
  }

  const formatted = d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatShortDate(dateStr: string) {
  const cleanDate = sanitizeDate(dateStr);
  return new Date(`${cleanDate}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    weekday: 'short',
  });
}

export type CalendarViewMode = 'Day' | 'Week' | 'Month' | 'List';

export function AgendaView({
  items,
  onOpen,
}: {
  items: AgendaItem[];
  onOpen: (item: AgendaItem) => void;
}) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('Week');
  const [startDate, setStartDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  // Auto-detect mobile screen to default to 'Day' view mode for touch ergonomics
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setViewMode('Day');
    }
  }, []);
  // Navigate date forward/backward by 1 day, 7 days, or 1 month
  const handleNavigate = (direction: -1 | 1) => {
    const cleanDate = sanitizeDate(startDate);
    const current = new Date(`${cleanDate}T12:00:00`);
    if (viewMode === 'Day') {
      current.setDate(current.getDate() + direction);
    } else if (viewMode === 'Week') {
      current.setDate(current.getDate() + direction * 7);
    } else {
      current.setDate(1);
      current.setMonth(current.getMonth() + direction);
    }
    setStartDate(current.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    setStartDate(new Date().toISOString().split('T')[0]);
  };

  // Calendário vazio é grade vazia: sem nada marcado em lugar nenhum, navegar
  // por semanas em branco não conta o que preenche a agenda.
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Nada marcado por enquanto"
        description="A agenda junta num calendário só as sessões marcadas das suas comunidades e as rodadas das ligas em andamento — de todas elas ao mesmo tempo. É como o grupo sabe quando é o próximo jogo sem perguntar no WhatsApp."
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            to={paths.comunidades}
            className="btn btn-primary min-h-[48px] flex-1 gap-2 px-6 font-black uppercase tracking-wider"
          >
            <Volleyball className="h-5 w-5" /> Marcar uma pelada
          </Link>
          <Link
            to={paths.ligas}
            className="btn btn-outline min-h-[48px] flex-1 gap-2 px-6 font-bold uppercase tracking-wider"
          >
            <Trophy className="h-5 w-5" /> Criar uma liga
          </Link>
        </div>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4 select-none">
      {/* 1. TOP TOOLBAR & CONTROLS */}
      <div className="card card-border bg-base-200 p-4 rounded-2xl border border-base-300 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleNavigate(-1)}
              className="btn btn-square btn-ghost btn-sm min-h-[44px] min-w-[44px]"
              aria-label="Anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="btn btn-outline btn-sm min-h-[44px] text-xs font-bold uppercase"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => handleNavigate(1)}
              className="btn btn-square btn-ghost btn-sm min-h-[44px] min-w-[44px]"
              aria-label="Próximo"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <span className="text-xs font-black uppercase tracking-wider text-base-content capitalize">
            {formatHeaderTitle(startDate, viewMode)}
          </span>
        </div>

        {/* VIEW TYPE SWITCHER BUTTONS */}
        <div className="flex items-center bg-base-300/60 p-1 rounded-xl gap-1 border border-base-300">
          <button
            type="button"
            onClick={() => setViewMode('Day')}
            className={`px-3 py-2 text-xs font-bold uppercase rounded-lg transition-colors duration-200 min-h-[36px] ${
              viewMode === 'Day'
                ? 'bg-primary text-primary-content shadow-md'
                : 'text-text-muted hover:text-base-content'
            }`}
          >
            Dia
          </button>
          <button
            type="button"
            onClick={() => setViewMode('Week')}
            className={`px-3 py-2 text-xs font-bold uppercase rounded-lg transition-colors duration-200 min-h-[36px] ${
              viewMode === 'Week'
                ? 'bg-primary text-primary-content shadow-md'
                : 'text-text-muted hover:text-base-content'
            }`}
          >
            Semana
          </button>
          <button
            type="button"
            onClick={() => setViewMode('Month')}
            className={`px-3 py-2 text-xs font-bold uppercase rounded-lg transition-colors duration-200 min-h-[36px] ${
              viewMode === 'Month'
                ? 'bg-primary text-primary-content shadow-md'
                : 'text-text-muted hover:text-base-content'
            }`}
          >
            Mês
          </button>
          <button
            type="button"
            onClick={() => setViewMode('List')}
            className={`px-3 py-2 text-xs font-bold uppercase rounded-lg transition-colors duration-200 min-h-[36px] flex items-center gap-1 ${
              viewMode === 'List'
                ? 'bg-primary text-primary-content shadow-md'
                : 'text-text-muted hover:text-base-content'
            }`}
          >
            <List className="w-3.5 h-3.5" /> Lista
          </button>
        </div>
      </div>

      {/* LEGENDA DE CORES RÁPIDA */}
      <div className="flex items-center gap-6 text-xs font-bold text-base-content/80 px-2">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#2563eb] shadow-sm border border-blue-400/40" />
          <span>Sessão de Pelada</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#7c3aed] shadow-sm border border-purple-400/40" />
          <span>Rodada de Liga</span>
        </div>
      </div>

      {/* 2. CALENDAR CONTAINER */}
      <div className="card card-border bg-base-200 p-4 rounded-3xl border border-base-300 overflow-hidden shadow-xl">
        {viewMode !== 'List' ? (
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-16 text-xs font-bold uppercase tracking-wider text-base-content/50">
                Carregando calendário...
              </div>
            }
          >
            <AgendaCalendar
              items={items}
              viewMode={viewMode}
              startDate={startDate}
              onOpen={onOpen}
            />
          </Suspense>
        ) : (
          /* LIST VIEW FALLBACK */
          <div>
            {items.length === 0 ? (
              <div className="card-body items-center text-center gap-2 py-12">
                <CalendarDays className="w-10 h-10 text-base-content/40" />
                <h2 className="text-base font-black uppercase tracking-tight">Nada agendado</h2>
                <p className="text-sm text-base-content/60">
                  Sessões marcadas e rodadas de liga das suas comunidades aparecem aqui.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(item)}
                      className="w-full card card-border bg-base-100 text-left hover:border-primary/50 transition-all p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xs uppercase ${
                            item.kind === 'round'
                              ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20'
                              : 'bg-primary/10 text-primary border border-primary/20'
                          }`}
                        >
                          {item.kind === 'round' ? 'Liga' : 'Sessão'}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-base-content group-hover:text-primary transition-colors">
                            {item.title}
                          </p>
                          <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                            <Clock className="w-3.5 h-3.5 text-accent" />
                            {item.communityName}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs font-mono font-bold text-primary bg-base-200 px-3 py-1.5 rounded-xl border border-base-300">
                        <CalendarIcon className="w-3.5 h-3.5" />
                        {formatShortDate(item.date)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
