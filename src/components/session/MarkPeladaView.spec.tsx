import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarkPeladaView } from './MarkPeladaView';

const sugestao = {
  date: '2026-10-02',
  time: '20:00',
  location: 'Bolão',
  capacity: 12,
  type: 'free_play' as const,
};

function renderMarcar(extra: Partial<Parameters<typeof MarkPeladaView>[0]> = {}) {
  const onSubmit = vi.fn();
  render(
    <MarkPeladaView
      communityName="Inimigos do Vôlei"
      defaults={sugestao}
      today="2026-09-30"
      busy={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={() => {}}
      {...extra}
    />,
  );
  return { onSubmit };
}

describe('MarkPeladaView', () => {
  it('marca com os valores sugeridos e o formato escolhido', () => {
    const { onSubmit } = renderMarcar();
    fireEvent.click(screen.getByLabelText('Torneio'));
    fireEvent.click(screen.getByRole('button', { name: /marcar e abrir a lista/i }));
    expect(onSubmit).toHaveBeenCalledWith({ ...sugestao, type: 'tournament' });
  });

  it('sem horario nao marca e diz o que falta', () => {
    const { onSubmit } = renderMarcar({ defaults: { ...sugestao, time: '' } });
    fireEvent.click(screen.getByRole('button', { name: /marcar e abrir a lista/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Escolha o horário da pelada.');
  });

  it('data no passado nao marca', () => {
    const { onSubmit } = renderMarcar({ defaults: { ...sugestao, date: '2026-09-29' } });
    fireEvent.click(screen.getByRole('button', { name: /marcar e abrir a lista/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('enquanto marca o botao trava e o erro do servidor aparece', () => {
    renderMarcar({ busy: true, error: 'Sem conexão. Tente de novo quando o sinal voltar.' });
    expect((screen.getByRole('button', { name: /marcando/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByRole('alert').textContent).toContain('Sem conexão');
  });
});
