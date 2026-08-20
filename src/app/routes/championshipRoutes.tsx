import { lazy, Suspense } from 'react';
import { useParams } from 'react-router';
import { ChampionshipErrorBoundary } from '../../components/championship/ChampionshipErrorBoundary';

export const ChampionshipsHubView = lazy(() =>
  import('../../components/championship/ChampionshipsHubView').then((m) => ({
    default: m.ChampionshipsHubView,
  })),
);
export const ChampionshipWizardView = lazy(() =>
  import('../../components/championship/ChampionshipWizardView').then((m) => ({
    default: m.ChampionshipWizardView,
  })),
);
export const ChampionshipDetailView = lazy(() =>
  import('../../components/championship/ChampionshipDetailView').then((m) => ({
    default: m.ChampionshipDetailView,
  })),
);

function ChampionshipSkeleton() {
  return (
    <div className="space-y-6 py-6 animate-pulse max-w-5xl mx-auto">
      <div className="flex items-center gap-3 border-b border-base-300 pb-4">
        <div className="w-10 h-10 rounded-xl bg-base-300" />
        <div className="space-y-2">
          <div className="h-5 w-48 bg-base-300 rounded" />
          <div className="h-3 w-32 bg-base-300/60 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="h-20 bg-base-200 rounded-2xl border border-base-300" />
        <div className="h-20 bg-base-200 rounded-2xl border border-base-300" />
        <div className="h-20 bg-base-200 rounded-2xl border border-base-300" />
      </div>
      <div className="h-72 bg-base-200 rounded-2xl border border-base-300" />
    </div>
  );
}

export function LigasHubRoute() {
  return (
    <ChampionshipErrorBoundary>
      <Suspense fallback={<ChampionshipSkeleton />}>
        <ChampionshipsHubView />
      </Suspense>
    </ChampionshipErrorBoundary>
  );
}

export function LigaNovaRoute() {
  return (
    <ChampionshipErrorBoundary>
      <Suspense fallback={<ChampionshipSkeleton />}>
        <ChampionshipWizardView />
      </Suspense>
    </ChampionshipErrorBoundary>
  );
}

export function LigaDetalheRoute() {
  const { championshipId } = useParams<{ championshipId: string }>();
  return (
    <ChampionshipErrorBoundary>
      <Suspense fallback={<ChampionshipSkeleton />}>
        <ChampionshipDetailView championshipId={championshipId} />
      </Suspense>
    </ChampionshipErrorBoundary>
  );
}
