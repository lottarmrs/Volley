import { useMemo } from 'react';
import { DayPilot, DayPilotCalendar, DayPilotMonth } from '@daypilot/daypilot-lite-react';
import type { AgendaItem } from '@app/agendaViewModel';

// Register pt-BR locale in DayPilot Lite
if (typeof DayPilot !== 'undefined' && DayPilot.Locale) {
  DayPilot.Locale.register(
    new DayPilot.Locale('pt-br', {
      dayNames: [
        'Domingo',
        'Segunda-feira',
        'Terça-feira',
        'Quarta-feira',
        'Quinta-feira',
        'Sexta-feira',
        'Sábado',
      ],
      dayNamesShort: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
      monthNames: [
        'Janeiro',
        'Fevereiro',
        'Março',
        'Abril',
        'Maio',
        'Junho',
        'Julho',
        'Agosto',
        'Setembro',
        'Outubro',
        'Novembro',
        'Dezembro',
      ],
      monthNamesShort: [
        'Jan',
        'Fev',
        'Mar',
        'Abr',
        'Mai',
        'Jun',
        'Jul',
        'Ago',
        'Set',
        'Out',
        'Nov',
        'Dez',
      ],
      timePattern: 'HH:mm',
      datePattern: 'dd/MM/yyyy',
      dateTimePattern: 'dd/MM/yyyy HH:mm',
      timeFormat: 'Clock24Hours',
      weekStarts: 1,
    }),
  );
}

function sanitizeDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  return dateStr.split('T')[0];
}

interface AgendaCalendarProps {
  items: AgendaItem[];
  /** Só as visões de grade chegam aqui; a lista não precisa do DayPilot. */
  viewMode: 'Day' | 'Week' | 'Month';
  startDate: string;
  onOpen: (item: AgendaItem) => void;
}

export function AgendaCalendar({ items, viewMode, startDate, onOpen }: AgendaCalendarProps) {
  const events = useMemo(() => {
    return items.map((item) => {
      const isRound = item.kind === 'round';
      const cleanDate = sanitizeDate(item.date);
      const existingTime = item.date.includes('T') ? item.date.split('T')[1] : null;

      let startHour = 19;
      let startMin = 0;
      if (existingTime) {
        const parts = existingTime.split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!Number.isNaN(h)) startHour = h;
        if (!Number.isNaN(m)) startMin = m;
      }
      const endHour = Math.min(23, startHour + 2);

      const startIso = `${cleanDate}T${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00`;
      const endIso = `${cleanDate}T${String(endHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00`;

      return {
        id: item.id,
        text: `${item.title} • ${item.communityName}`,
        start: startIso,
        end: endIso,
        backColor: isRound ? '#7c3aed' : '#2563eb',
        borderColor: isRound ? '#6d28d9' : '#1d4ed8',
        fontColor: '#ffffff',
        barColor: isRound ? '#a78bfa' : '#60a5fa',
        data: item,
      };
    });
  }, [items]);

  const calendarConfig = useMemo(
    () => ({
      locale: 'pt-br',
      viewType: viewMode === 'Day' ? ('Day' as const) : ('Week' as const),
      startDate: startDate,
      headerDateFormat: 'ddd dd/MM',
      timeFormat: 'Clock24Hours' as const,
      businessBeginsHour: 8,
      businessEndsHour: 23,
      dayBeginsHour: 7,
      dayEndsHour: 23,
      eventDeleteHandling: 'Disabled' as const,
      eventMoveHandling: 'Disabled' as const,
      eventResizeHandling: 'Disabled' as const,
      onBeforeEventRender: (args: any) => {
        const item = args.data.data as AgendaItem;
        if (!item) return;
        const isRound = item.kind === 'round';
        const start = new Date(args.data.start.toString());
        const end = new Date(args.data.end.toString());
        const startStr = start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const endStr = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        args.data.html = `
          <div style="padding: 2px 4px; display: flex; flex-direction: column; gap: 2px; height: 100%;">
            <div style="font-size: 10px; font-weight: 800; opacity: 0.95; letter-spacing: 0.5px; display: flex; items-center; justify-content: space-between;">
              <span>${startStr} - ${endStr}</span>
              <span style="font-size: 9px; padding: 1px 4px; border-radius: 6px; background: rgba(255,255,255,0.25); text-transform: uppercase;">${isRound ? 'Liga' : 'Pelada'}</span>
            </div>
            <div style="font-size: 11px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.2;">
              ${item.title}
            </div>
            <div style="font-size: 10px; opacity: 0.8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${item.communityName}
            </div>
          </div>
        `;
      },
      onEventClick: (args: any) => {
        if (args.e?.data?.data) {
          onOpen(args.e.data.data as AgendaItem);
        }
      },
    }),
    [viewMode, startDate, onOpen],
  );

  const monthConfig = useMemo(
    () => ({
      locale: 'pt-br',
      startDate: startDate,
      eventDeleteHandling: 'Disabled' as const,
      eventMoveHandling: 'Disabled' as const,
      eventResizeHandling: 'Disabled' as const,
      onBeforeCellRender: (args: any) => {
        const cellDate = new Date(args.cell.start.toString());
        const targetDate = new Date(`${sanitizeDate(startDate)}T12:00:00`);
        if (cellDate.getMonth() !== targetDate.getMonth()) {
          args.cell.properties.cssClass = 'daypilot-other-month-cell';
        }
      },
      onEventClick: (args: any) => {
        if (args.e?.data?.data) {
          onOpen(args.e.data.data as AgendaItem);
        }
      },
    }),
    [startDate, onOpen],
  );

  return (
    <div className="daypilot-container font-sans text-xs">
      {viewMode === 'Month' ? (
        <DayPilotMonth {...monthConfig} events={events} />
      ) : (
        <DayPilotCalendar {...calendarConfig} events={events} />
      )}
    </div>
  );
}
