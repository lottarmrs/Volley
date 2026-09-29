/**
 * Bancada de design da ficha do atleta.
 *
 * A ficha aparece em quatro lugares (cadastro, Minha ficha, Convidados em
 * Gestao, e a pagina que prende a conta ate ela existir) e todos ficam atras
 * de fluxo real: cadastro, AuthGuard ou o wizard de conta. Aqui os
 * componentes reais rodam com dados de mentira e callbacks locais, um estado
 * por bloco.
 *
 * So o servidor de desenvolvimento serve este arquivo. `vite build` emite
 * apenas o `index.html` da raiz, entao nada daqui chega a producao.
 *
 * Endereco: http://localhost:3100/preview/ficha.html
 */
import { StrictMode, useState, type ComponentProps, type FC, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import '../src/index.css';
import { AthleteProfileForm } from '../src/components/player/AthleteProfileForm';
import { CompleteAthleteProfilePage } from '../src/app/auth/CompleteAthleteProfilePage';
import { MyAthleteProfile } from '../src/components/account/MyAthleteProfile';
import { CommunityGuestsArea } from '../src/components/community/areas/CommunityGuestsArea';
import { AuthSessionContext, type AuthSessionContextValue } from '../src/app/auth/useAuthSession';
import { appOk, productError } from '../src/application/appResult';
import { makePlayer } from '../src/test/fixtures';
import type { AthleteProfileDraft } from '../src/domain/athleteProfile';
import type { Player } from '../src/types';

const VAZIO: AthleteProfileDraft = {
  genero: null,
  posicaoPrincipal: null,
  alturaCm: null,
  maoDominante: null,
  apelido: '',
  posicoesSecundarias: [],
};

const PREENCHIDA: AthleteProfileDraft = {
  genero: 'F',
  posicaoPrincipal: 'central',
  alturaCm: 178,
  maoDominante: 'direita',
  apelido: 'Duda',
  posicoesSecundarias: ['oposto'],
  lesionado: true,
  limitacaoFisica: 'Joelho direito — evitar saltos repetidos.',
};

/* A pagina de cadastro le a sessao de autenticacao so para o retry() apos
   salvar. A bancada injeta o contexto direto, em vez de instanciar o
   provider real com um cliente de mentira: menos peca falsa no caminho. */
const SESSAO_DE_AUTENTICACAO = {
  state: { kind: 'needs_athlete_profile', userId: 'u-bancada' },
  session: null,
  account: {
    state: 'needs_athlete_profile',
    profile: { id: 'u-bancada', email: 'bancada@exemplo.com', role: 'user' },
    playerId: 'p-bancada',
    username: 'bancada',
    requiresAal2: false,
  },
  authClient: {},
  retry: async () => {},
  completeUsername: async () => {},
  signOut: async () => {},
} as unknown as AuthSessionContextValue;

const Bloco: FC<{ nome: string; children: ReactNode }> = ({ nome, children }) => (
  <section className="space-y-3">
    <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">{nome}</h2>
    {children}
  </section>
);

const FormularioVazio: FC = () => {
  const [draft, setDraft] = useState<AthleteProfileDraft>(VAZIO);
  return <AthleteProfileForm value={draft} onChange={setDraft} />;
};

const FormularioComErro: FC = () => {
  const [draft, setDraft] = useState<AthleteProfileDraft>(VAZIO);
  return (
    <AthleteProfileForm
      value={draft}
      onChange={setDraft}
      serverError="Nao foi possivel salvar sua ficha. Verifique a conexao."
    />
  );
};

const FormularioMinhaFichaPreenchida: FC = () => {
  const [draft, setDraft] = useState<AthleteProfileDraft>(PREENCHIDA);
  return <AthleteProfileForm value={draft} onChange={setDraft} showCondition />;
};

const FormularioConvidadoComNivel: FC = () => {
  const [draft, setDraft] = useState<AthleteProfileDraft>(VAZIO);
  const [nivel, setNivel] = useState<1 | 2 | 3 | 4 | 5>(3);
  return (
    <AthleteProfileForm
      value={draft}
      onChange={setDraft}
      showCondition
      level={{ value: nivel, onChange: setNivel }}
    />
  );
};

const FormularioConvidadoSemNivel: FC = () => {
  const [draft, setDraft] = useState<AthleteProfileDraft>(VAZIO);
  return <AthleteProfileForm value={draft} onChange={setDraft} showCondition />;
};

const MinhaFichaCarregando: FC = () => (
  <MyAthleteProfile player={null} onSaved={() => undefined} onAvatarApplied={() => undefined} />
);

const MinhaFichaPreenchida: FC = () => {
  const [jogador, setJogador] = useState<Player>(() =>
    makePlayer('p-bancada', {
      nome: 'Duda Rocha',
      apelido: 'Duda',
      genero: 'F',
      posicaoPrincipal: 'central',
      posicoesSecundarias: ['oposto'],
      alturaCm: 178,
      maoDominante: 'direita',
      status: { lesionado: true, limitacaoFisica: 'Joelho direito', presencaFrequente: true },
    }),
  );
  return (
    <MyAthleteProfile
      player={jogador}
      onSaved={(draft) =>
        setJogador((atual) => ({
          ...atual,
          genero: draft.genero,
          posicaoPrincipal: draft.posicaoPrincipal,
          posicoesSecundarias: draft.posicoesSecundarias,
          alturaCm: draft.alturaCm ?? undefined,
          maoDominante: draft.maoDominante ?? atual.maoDominante,
          apelido: draft.apelido || atual.nome,
          status: {
            ...atual.status,
            lesionado: !!draft.lesionado,
            limitacaoFisica: draft.limitacaoFisica ?? null,
          },
        }))
      }
      onAvatarApplied={(url) => setJogador((atual) => ({ ...atual, avatarUrl: url }))}
    />
  );
};

const CONVIDADO_COMPLETO = makePlayer('g1', {
  nome: 'Caio Medeiros',
  apelido: 'Caião',
  genero: 'M',
  posicaoPrincipal: 'oposto',
  alturaCm: 188,
  maoDominante: 'direita',
});

const CONVIDADO_INCOMPLETO = makePlayer('g2', {
  nome: 'Eduardo Vasconcelos',
  apelido: 'Eduardo Vasconcelos',
  genero: null,
  posicaoPrincipal: null,
  alturaCm: undefined,
});

function fabricaDeCallbacks() {
  const onSave: ComponentProps<typeof CommunityGuestsArea>['onSave'] = ({
    playerId,
    nome,
    draft,
  }) => {
    if (!nome.trim()) return productError('invalid_input', 'Informe o nome do convidado.');
    return appOk(
      makePlayer(playerId ?? 'novo', {
        nome,
        apelido: draft.apelido || nome,
        genero: draft.genero,
        posicaoPrincipal: draft.posicaoPrincipal,
        posicoesSecundarias: draft.posicoesSecundarias,
      }),
    );
  };
  const onDeactivate: ComponentProps<typeof CommunityGuestsArea>['onDeactivate'] = () =>
    appOk('deactivated' as const);
  const onReactivate: ComponentProps<typeof CommunityGuestsArea>['onReactivate'] = () =>
    appOk('reactivated' as const);
  const onDelete: ComponentProps<typeof CommunityGuestsArea>['onDelete'] = () =>
    appOk('removed' as const);
  return { onSave, onDeactivate, onReactivate, onDelete };
}

const ConvidadosListaVazia: FC = () => {
  const callbacks = fabricaDeCallbacks();
  return <CommunityGuestsArea guests={[]} noCloud={false} isOwner {...callbacks} />;
};

const ConvidadosComLista: FC = () => {
  const callbacks = fabricaDeCallbacks();
  return (
    <CommunityGuestsArea
      guests={[CONVIDADO_COMPLETO, CONVIDADO_INCOMPLETO]}
      noCloud={false}
      isOwner
      {...callbacks}
    />
  );
};

const ConvidadosEditando: FC = () => {
  const callbacks = fabricaDeCallbacks();
  return (
    <CommunityGuestsArea
      guests={[CONVIDADO_COMPLETO, CONVIDADO_INCOMPLETO]}
      noCloud={true}
      isOwner
      {...callbacks}
      initialEditingId={CONVIDADO_COMPLETO.id}
    />
  );
};

const CONVIDADOS_DESATIVADOS = [
  makePlayer('g3', { nome: 'Rogério Batista', apelido: 'Rogério Batista', ativo: false }),
  makePlayer('g4', { nome: 'Lúcia Fernandes', apelido: 'Lu', ativo: false }),
];

const ConvidadosComDesativados: FC<{ isOwner: boolean }> = ({ isOwner }) => {
  const callbacks = fabricaDeCallbacks();
  return (
    <CommunityGuestsArea
      guests={[CONVIDADO_COMPLETO, ...CONVIDADOS_DESATIVADOS]}
      noCloud={false}
      {...callbacks}
      isOwner={isOwner}
    />
  );
};

const ConvidadosEditandoDesativado: FC = () => {
  const callbacks = fabricaDeCallbacks();
  return (
    <CommunityGuestsArea
      guests={[CONVIDADO_COMPLETO, ...CONVIDADOS_DESATIVADOS]}
      noCloud={false}
      isOwner
      {...callbacks}
      initialEditingId={CONVIDADOS_DESATIVADOS[0].id}
    />
  );
};

const ConvidadosAusente: FC = () => {
  const callbacks = fabricaDeCallbacks();
  return (
    <CommunityGuestsArea
      guests={[CONVIDADO_COMPLETO]}
      noCloud={false}
      isOwner
      {...callbacks}
      initialEditingId="convidado-que-nao-existe-mais"
    />
  );
};

export function Bancada() {
  return (
    <MemoryRouter>
      <AuthSessionContext.Provider value={SESSAO_DE_AUTENTICACAO}>
        <div className="min-h-screen bg-base-100 px-4 py-8">
          <div className="mx-auto max-w-xl space-y-12">
            <header className="space-y-1 border-b border-base-300 pb-5">
              <h1 className="text-2xl font-black uppercase tracking-tight text-base-content">
                Ficha do atleta · estados da tela
              </h1>
              <p className="text-sm text-base-content/60">
                Componentes reais, dados de mentira. Só o servidor de desenvolvimento serve esta
                página.
              </p>
            </header>

            <Bloco nome="AthleteProfileForm — cadastro, vazio">
              <FormularioVazio />
            </Bloco>
            <Bloco nome="AthleteProfileForm — cadastro, com erro do servidor">
              <FormularioComErro />
            </Bloco>
            <Bloco nome="AthleteProfileForm — Minha ficha, preenchida, com condição física">
              <FormularioMinhaFichaPreenchida />
            </Bloco>
            <Bloco nome="AthleteProfileForm — convidado, com nível">
              <FormularioConvidadoComNivel />
            </Bloco>
            <Bloco nome="AthleteProfileForm — convidado, sem nível">
              <FormularioConvidadoSemNivel />
            </Bloco>

            <Bloco nome="CompleteAthleteProfilePage — /completar-ficha">
              <div className="rounded-2xl border border-base-300 overflow-hidden">
                <CompleteAthleteProfilePage />
              </div>
            </Bloco>

            <Bloco nome="MyAthleteProfile — carregando">
              <MinhaFichaCarregando />
            </Bloco>
            <Bloco nome="MyAthleteProfile — preenchida">
              <MinhaFichaPreenchida />
            </Bloco>

            <Bloco nome="CommunityGuestsArea — lista vazia">
              <ConvidadosListaVazia />
            </Bloco>
            <Bloco nome="CommunityGuestsArea — com convidados (um sem ficha completa)">
              <ConvidadosComLista />
            </Bloco>
            <Bloco nome="CommunityGuestsArea — editando">
              <ConvidadosEditando />
            </Bloco>
            <Bloco nome="CommunityGuestsArea — aviso de convidado ausente">
              <ConvidadosAusente />
            </Bloco>
            <Bloco nome="CommunityGuestsArea — desativados, visto pelo dono (Reativar e Excluir)">
              <ConvidadosComDesativados isOwner />
            </Bloco>
            <Bloco nome="CommunityGuestsArea — desativados, visto pelo admin (só Reativar)">
              <ConvidadosComDesativados isOwner={false} />
            </Bloco>
            <Bloco nome="CommunityGuestsArea — editando um desativado">
              <ConvidadosEditandoDesativado />
            </Bloco>
          </div>
        </div>
      </AuthSessionContext.Provider>
    </MemoryRouter>
  );
}

createRoot(document.getElementById('bancada') as HTMLElement).render(
  <StrictMode>
    <Bancada />
  </StrictMode>,
);
