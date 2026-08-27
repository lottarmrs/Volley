import { useCallback, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UnsavedGuardProvider, useUnsavedGuard, type UnsavedGuard } from './unsavedGuard';

/**
 * Reproduz a mecânica de CommunityDetailView: abas renderizadas
 * condicionalmente, guarda registrada pela aba ativa, troca interceptada.
 */
function Harness({ save }: { save: () => void }) {
  const [aba, setAba] = useState<'regras' | 'atletas'>('regras');
  const [pendente, setPendente] = useState<{ origem: string } | null>(null);
  const guardaRef = useRef<UnsavedGuard | null>(null);

  const registrar = useCallback((guard: UnsavedGuard | null) => {
    guardaRef.current = guard;
  }, []);

  const pedirTroca = () => {
    const guarda = guardaRef.current;
    if (aba !== 'atletas' && guarda?.dirty) {
      setPendente({ origem: guarda.label });
      return;
    }
    setAba('atletas');
  };

  const resolver = (acao: 'salvar' | 'descartar') => {
    if (acao === 'salvar') guardaRef.current?.save();
    guardaRef.current = null;
    setAba('atletas');
    setPendente(null);
  };

  return (
    <UnsavedGuardProvider value={registrar}>
      <button type="button" onClick={pedirTroca}>
        Ir para Atletas
      </button>

      {pendente && (
        <div role="dialog">
          <p>Alterações não salvas em {pendente.origem}</p>
          <button type="button" onClick={() => resolver('salvar')}>
            Salvar e sair
          </button>
          <button type="button" onClick={() => resolver('descartar')}>
            Descartar
          </button>
          <button type="button" onClick={() => setPendente(null)}>
            Voltar
          </button>
        </div>
      )}

      {aba === 'regras' ? <AbaRegras save={save} /> : <p>Aba Atletas</p>}
    </UnsavedGuardProvider>
  );
}

function AbaRegras({ save }: { save: () => void }) {
  const [valor, setValor] = useState('');
  useUnsavedGuard({ dirty: valor !== '', save, label: 'Regras' });
  return (
    <label>
      Local
      <input value={valor} onChange={(event) => setValor(event.target.value)} />
    </label>
  );
}

describe('useUnsavedGuard', () => {
  it('deixa trocar de aba quando nada foi digitado', () => {
    render(<Harness save={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /ir para atletas/i }));
    expect(screen.getByText('Aba Atletas')).toBeTruthy();
  });

  it('intercepta a troca quando há rascunho e nomeia a aba de origem', () => {
    render(<Harness save={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/local/i), { target: { value: 'Quadra do clube' } });
    fireEvent.click(screen.getByRole('button', { name: /ir para atletas/i }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/alterações não salvas em regras/i)).toBeTruthy();
    expect(screen.queryByText('Aba Atletas')).toBeNull();
  });

  it('"Salvar e sair" persiste antes de trocar', () => {
    const save = vi.fn();
    render(<Harness save={save} />);
    fireEvent.change(screen.getByLabelText(/local/i), { target: { value: 'Quadra' } });
    fireEvent.click(screen.getByRole('button', { name: /ir para atletas/i }));
    fireEvent.click(screen.getByRole('button', { name: /salvar e sair/i }));

    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Aba Atletas')).toBeTruthy();
  });

  it('"Descartar" troca sem salvar', () => {
    const save = vi.fn();
    render(<Harness save={save} />);
    fireEvent.change(screen.getByLabelText(/local/i), { target: { value: 'Quadra' } });
    fireEvent.click(screen.getByRole('button', { name: /ir para atletas/i }));
    fireEvent.click(screen.getByRole('button', { name: /descartar/i }));

    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText('Aba Atletas')).toBeTruthy();
  });

  it('"Voltar" mantém a aba e o rascunho intactos', () => {
    const save = vi.fn();
    render(<Harness save={save} />);
    fireEvent.change(screen.getByLabelText(/local/i), { target: { value: 'Quadra' } });
    fireEvent.click(screen.getByRole('button', { name: /ir para atletas/i }));
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));

    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByText('Aba Atletas')).toBeNull();
    expect((screen.getByLabelText(/local/i) as HTMLInputElement).value).toBe('Quadra');
  });
});
