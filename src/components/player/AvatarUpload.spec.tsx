import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { proposePlayerAvatarCommand } from '../../application/avatarUseCases';
import { AvatarUpload } from './AvatarUpload';

vi.mock('../../application/avatarUseCases', () => ({
  proposePlayerAvatarCommand: vi.fn(),
}));

function enviar(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['x'], 'foto.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('AvatarUpload', () => {
  it('a foto enviada vale na hora', async () => {
    vi.mocked(proposePlayerAvatarCommand).mockResolvedValue({
      ok: true,
      value: { applied: true, imageUrl: 'https://x.test/nova.png' },
    } as never);
    const onApplied = vi.fn();
    const { container } = render(
      <AvatarUpload playerCloudId="cp1" initials="AS" onApplied={onApplied} />,
    );
    enviar(container);
    expect(await screen.findByText('Foto atualizada.')).toBeTruthy();
    expect(onApplied).toHaveBeenCalledWith('https://x.test/nova.png');
  });

  it('nunca fala em aprovacao', async () => {
    vi.mocked(proposePlayerAvatarCommand).mockResolvedValue({
      ok: true,
      value: { applied: false, imageUrl: 'https://x.test/nova.png' },
    } as never);
    const onApplied = vi.fn();
    const { container } = render(
      <AvatarUpload playerCloudId="cp1" initials="AS" onApplied={onApplied} />,
    );
    enviar(container);
    expect(await screen.findByText('Não foi possível atualizar a foto.')).toBeTruthy();
    expect(screen.queryByText(/aprovação/i)).toBeNull();
    expect(onApplied).not.toHaveBeenCalled();
  });
});
