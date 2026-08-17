import { lazy } from 'react';
import { useParams } from 'react';
import { ChampionshipErrorBoundary } from '../../components/championship/ChampionshipErrorBoundary';

export const ChampionshipsHubView = lazy(() =>
  import('../../components/championship/ChampionshipsHubView').then((m) => ({ default: m.ChampionshipsHubView })),
);
export const ChampionshipWizardView = lazy(() =>
  import('../../components/championship/ChampionshipWizardView').then((m) => ({ default: m.ChampionshipWizardView })),
);
export const ChampionshipDetailView = lazy(() =>
  import('../../components/championship/ChampionshipDetailView').then((m) => ({ default: m.ChampionshipDetailView })),
);

export function LigasHubRoute() {
  return (
    <ChampionshipErrorBoundary>
      <ChampionshipsHubView />
    </ChampionshipErrorBoundary>
  );
}

export function LigaNovaRoute() {
  return (
    <ChampionshipErrorBoundary>
      <ChampionshipWizardView />
    </ChampionshipErrorBoundary>
  );
}

export function LigaDetalheRoute() {
  const { championshipId } = useParams<{ championshipId: string }>();
  return (
    <ChampionshipErrorBoundary>
      <ChampionshipDetailView championshipId={championshipId} />
    </ChampionshipErrorBoundary>
  );
}
