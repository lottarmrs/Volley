import type { ScreenContract } from '../screenContract';
import type { GestaoViewModel } from './gestaoViewModel';
import type { GestaoViewIntent } from './gestaoViewIntents';

export interface GestaoViewContractInput {
  currentUserId: string | null;
  isMaster: boolean;
  onToast?: (message: string, variant: 'success' | 'error') => void;
}

function buildModel(input: GestaoViewContractInput): GestaoViewModel {
  return {
    currentUserId: input.currentUserId,
    isMaster: input.isMaster,
  };
}

export function buildGestaoViewContract(
  input: GestaoViewContractInput,
): ScreenContract<GestaoViewModel, GestaoViewIntent> {
  const model = buildModel(input);
  const dispatch = async (intent: GestaoViewIntent): Promise<void> => {
    switch (intent.kind) {
      case 'toast':
        if (input.onToast) input.onToast(intent.message, intent.variant);
        return;
    }
  };
  return { model, dispatch };
}
