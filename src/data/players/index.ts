import matheus from './matheus.json';
import joao from './joao.json';
import aline from './aline.json';
import bruna from './bruna.json';
import pedro from './pedro.json';
import carla from './carla.json';
import lucas from './lucas.json';
import marina from './marina.json';
import andre from './andre.json';
import julia from './julia.json';
import thiago from './thiago.json';
import rafael from './rafael.json';
import felipe from './felipe.json';
import carlos from './carlos.json';
import bianca from './bianca.json';

export const players = [
  matheus,
  joao,
  aline,
  bruna,
  pedro,
  carla,
  lucas,
  marina,
  andre,
  julia,
  thiago,
  rafael,
  felipe,
  carlos,
  bianca,
].map((p) => ({
  ...p,
  posicoesSecundarias: (p as any).posicoesSecundarias || [],
  formaAtual: (p as any).formaAtual || {
    valor: 0,
    observacao: 'Forma padrão',
    ultimasPartidas: [],
  },
  status: (p as any).status || {
    lesionado: false,
    limitacaoFisica: null,
    presencaFrequente: true,
  },
  metadata: (p as any).metadata || {
    criadoEm: '2026-04-28',
    atualizadoEm: '2026-04-30',
  },
}));
