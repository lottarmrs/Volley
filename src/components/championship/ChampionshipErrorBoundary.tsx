import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ChampionshipErrorBoundary extends React.Component<Props, State> {
  declare props: Readonly<Props>;
  declare state: State;
  declare setState: (state: Partial<State>) => void;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ChampionshipErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card card-border bg-base-200 p-6 max-w-lg mx-auto my-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-error/10 text-error flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-black uppercase">Ocorreu um erro nas Ligas</h3>
          <p className="text-sm text-base-content/60">
            Não foi possível carregar as informações desta tela no momento.
          </p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              <RefreshCw className="w-4 h-4" /> Tentar novamente
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
