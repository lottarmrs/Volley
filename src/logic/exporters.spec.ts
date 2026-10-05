import { afterEach, describe, expect, it, vi } from 'vitest';
import { openWhatsAppShare } from './exporters';

describe('openWhatsAppShare', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'share');
  });

  it('abre a folha de compartilhar do aparelho para escolher a conversa', async () => {
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);

    await openWhatsAppShare('Bora jogar');

    expect(share).toHaveBeenCalledWith({ text: 'Bora jogar' });
    expect(abrir).not.toHaveBeenCalled();
  });

  it('quem desiste da folha nao e mandado para o WhatsApp', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('cancelado', 'AbortError');
    });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);

    await openWhatsAppShare('Bora jogar');

    expect(abrir).not.toHaveBeenCalled();
  });

  it('sem folha de compartilhar, ou se ela falhar, abre o WhatsApp', async () => {
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
    await openWhatsAppShare('Bora jogar');
    expect(abrir).toHaveBeenCalledWith('https://wa.me/?text=Bora%20jogar', '_blank');

    Object.defineProperty(navigator, 'share', {
      value: vi.fn(async () => {
        throw new DOMException('sem gesto', 'NotAllowedError');
      }),
      configurable: true,
    });
    await openWhatsAppShare('Bora jogar');
    expect(abrir).toHaveBeenCalledTimes(2);
  });
});
