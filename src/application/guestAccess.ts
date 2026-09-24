import type { AuthSessionState } from './authSession';

export type AccessLevel = 'blocked' | 'guest' | 'account';

export function resolveAccessLevel(state: AuthSessionState): AccessLevel {
  if (state.kind === 'ready') return 'account';
  if (state.kind === 'anonymous') return 'guest';
  return 'blocked';
}

export function isGuestAccess(state: AuthSessionState): boolean {
  return resolveAccessLevel(state) === 'guest';
}

export interface AccountOnlyArea {
  title: string;
  reason: string;
}

/** Quem chega por um link compartilhado veio pela pelada, nao pelo conceito de
 *  comunidade, e a frase generica nao diz o que ele esta perdendo. */
const CONVITE_DA_INSCRICAO: AccountOnlyArea = {
  title: 'Entre para garantir sua vaga',
  reason:
    'A lista desta pelada é por ordem de chegada, e cada vaga precisa ter dono. Crie a conta para entrar na lista — leva um minuto e você volta direto para cá.',
};

const ACCOUNT_ONLY_AREAS: { prefix: string; area: AccountOnlyArea }[] = [
  {
    prefix: '/comunidades',
    area: {
      title: 'Comunidades precisam de conta',
      reason:
        'Uma comunidade guarda o elenco, as presenças e as permissões de quem pode marcar ponto. Isso vive na nuvem para o grupo inteiro enxergar a mesma coisa.',
    },
  },
  {
    prefix: '/ligas',
    area: {
      title: 'Ligas precisam de conta',
      reason:
        'Uma liga acompanha classificação e rodadas ao longo de semanas, com resultados que o grupo confere depois. Esse histórico precisa sobreviver a este navegador.',
    },
  },
  {
    prefix: '/agenda',
    area: {
      title: 'A agenda precisa de conta',
      reason:
        'A agenda reúne as peladas e rodadas já marcadas do seu grupo. Sem conta não há grupo para reunir.',
    },
  },
  {
    prefix: '/perfil',
    area: {
      title: 'O perfil precisa de conta',
      reason:
        'Seu perfil de atleta, seu card e sua sincronização são a sua identidade dentro da pelada.',
    },
  },
  {
    prefix: '/admin',
    area: {
      title: 'A administração precisa de conta',
      reason: 'Esta área é restrita à equipe do produto.',
    },
  },
];

const DEFAULT_ACCOUNT_ONLY_AREA: AccountOnlyArea = {
  title: 'Esta área precisa de conta',
  reason:
    'O modo local guarda a pelada deste navegador. Tudo que atravessa dispositivos ou pessoas mora na conta.',
};

/** `/comunidades/:id/sessoes/:id/inscricao` nao e um prefixo, entao a rota da
 *  inscricao e reconhecida pelo formato antes da busca por prefixo. */
const ROTA_DA_INSCRICAO = /^\/comunidades\/[^/]+\/sessoes\/[^/]+\/inscricao$/;

export function describeAccountOnlyArea(pathname: string): AccountOnlyArea {
  if (ROTA_DA_INSCRICAO.test(pathname)) {
    return CONVITE_DA_INSCRICAO;
  }
  const match = ACCOUNT_ONLY_AREAS.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
  );
  return match ? match.area : DEFAULT_ACCOUNT_ONLY_AREA;
}
