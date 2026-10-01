import type { SessionType } from '@shared/types';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export interface MarkPeladaValues {
  date: string;
  time: string;
  location: string;
  capacity: number;
  type: SessionType;
}

export function markPeladaDefaults(
  community: {
    defaultDay?: string;
    defaultStartTime?: string;
    defaultLocation?: string;
    defaultFormat?: SessionType;
  },
  today: Date,
): MarkPeladaValues {
  const alvo = DIAS.indexOf(community.defaultDay ?? '');
  const dia = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (alvo >= 0) dia.setDate(dia.getDate() + ((alvo - dia.getDay() + 7) % 7));
  return {
    date: isoDate(dia),
    time: community.defaultStartTime || '20:00',
    location: community.defaultLocation ?? '',
    capacity: 12,
    type: community.defaultFormat === 'tournament' ? 'tournament' : 'free_play',
  };
}

export function plannedStartIso(date: string, time: string): string {
  if (!date || !time) return '';
  const [ano, mes, dia] = date.split('-').map(Number);
  const [hora, minuto] = time.split(':').map(Number);
  const instante = new Date(ano, mes - 1, dia, hora, minuto);
  return Number.isNaN(instante.getTime()) ? '' : instante.toISOString();
}

export function peladaName(communityName: string, date: string): string {
  const [ano, mes, dia] = date.split('-').map(Number);
  const d = new Date(ano, mes - 1, dia);
  return `${communityName} · ${CURTOS[d.getDay()]} ${pad(dia)}/${pad(mes)}`;
}
