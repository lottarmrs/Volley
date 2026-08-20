import { createContext, useContext, useEffect } from 'react';

export interface UnsavedGuard {
  /** Há alteração digitada que ainda não foi persistida. */
  dirty: boolean;
  /** Persiste o rascunho. Chamado quando o usuário escolhe "Salvar". */
  save: () => void;
  /** Nome da aba, para o diálogo poder dizer onde está o trabalho em risco. */
  label: string;
}

type RegisterGuard = (guard: UnsavedGuard | null) => void;

const UnsavedGuardContext = createContext<RegisterGuard | null>(null);

export const UnsavedGuardProvider = UnsavedGuardContext.Provider;

/**
 * As abas da comunidade são renderizadas condicionalmente, então trocar de aba
 * desmonta o componente e leva o `useState` do rascunho junto. Quem tem campo
 * editável registra aqui o próprio estado sujo; a tela de detalhe intercepta a
 * troca e pergunta antes de deixar o trabalho evaporar.
 */
export function useUnsavedGuard(guard: UnsavedGuard): void {
  const register = useContext(UnsavedGuardContext);

  useEffect(() => {
    if (!register) return;
    register(guard.dirty ? guard : null);
    return () => register(null);
    // `save` muda de identidade a cada render; re-registrar é barato porque o
    // destino é uma ref, não estado.
  }, [register, guard.dirty, guard.label, guard.save]);
}
