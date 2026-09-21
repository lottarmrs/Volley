import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  UnsavedGuardProvider,
  createUnsavedGuardStore,
  type UnsavedGuard,
} from '../community/unsavedGuard';

type GuardGate = (to: string) => void;

const GuardGateContext = createContext<GuardGate | null>(null);

function useGuardGate(): GuardGate | null {
  return useContext(GuardGateContext);
}

const store = createUnsavedGuardStore();

export function UnsavedGuardHost({ children }: { children: ReactNode }) {
  const [pendingTo, setPendingTo] = useState<string | null>(null);
  const [guard, setGuard] = useState<UnsavedGuard | null>(null);
  const navigate = useNavigate();

  const register = useCallback((next: UnsavedGuard | null) => {
    store.register(next);
  }, []);

  const gate = useMemo<GuardGate>(
    () => (to: string) => {
      const ativo = store.read();
      if (!ativo?.dirty) {
        navigate(to);
        return;
      }
      setGuard(ativo);
      setPendingTo(to);
    },
    [navigate],
  );

  const seguir = (salvar: boolean) => {
    const destino = pendingTo;
    const ativo = guard;
    setPendingTo(null);
    setGuard(null);
    if (salvar) ativo?.save();
    store.register(null);
    if (destino) navigate(destino);
  };

  return (
    <UnsavedGuardProvider value={register}>
      <GuardGateContext.Provider value={gate}>
        {children}
        {pendingTo && guard && (
          <div className="modal modal-open" role="dialog" aria-labelledby="guarda-titulo">
            <div className="modal-box max-w-md space-y-5">
              <h3 id="guarda-titulo" className="text-lg font-black uppercase tracking-tight">
                Você tem alterações não salvas
              </h3>
              <p className="text-sm leading-relaxed text-base-content/70">
                O que você digitou em <strong>{guard.label}</strong> ainda não foi salvo. Sair agora
                descarta essas alterações.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row-reverse">
                <button type="button" className="btn btn-primary" onClick={() => seguir(true)}>
                  Salvar e sair
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => seguir(false)}>
                  Sair sem salvar
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setPendingTo(null);
                    setGuard(null);
                  }}
                >
                  Continuar editando
                </button>
              </div>
            </div>
          </div>
        )}
      </GuardGateContext.Provider>
    </UnsavedGuardProvider>
  );
}

export interface GuardedLinkProps {
  to: string;
  className?: string;
  children: ReactNode;
  role?: string;
  ariaSelected?: boolean;
}

export function GuardedLink({ to, className, children, role, ariaSelected }: GuardedLinkProps) {
  const gate = useGuardGate();
  return (
    <Link
      to={to}
      className={className}
      role={role}
      aria-selected={ariaSelected}
      onClick={(event) => {
        if (!gate) return;
        event.preventDefault();
        gate(to);
      }}
    >
      {children}
    </Link>
  );
}
