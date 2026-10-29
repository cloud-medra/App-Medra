// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { copiarAlPortapapeles } from './portapapeles';

const ponerClipboard = (valor) => Object.defineProperty(navigator, 'clipboard', { value: valor, configurable: true });

describe('copiarAlPortapapeles', () => {
  afterEach(() => {
    ponerClipboard(undefined);
    delete document.execCommand;
  });

  it('usa navigator.clipboard cuando está disponible', async () => {
    const writeText = vi.fn().mockResolvedValue();
    ponerClipboard({ writeText });
    document.execCommand = vi.fn();
    expect(await copiarAlPortapapeles('12.345.678-9')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('12.345.678-9');
    expect(document.execCommand).not.toHaveBeenCalled();
  });

  it('sin navigator.clipboard, o si lo rechaza, usa execCommand', async () => {
    document.execCommand = vi.fn(() => true);
    expect(await copiarAlPortapapeles('a')).toBe(true);

    ponerClipboard({ writeText: vi.fn().mockRejectedValue(new Error('sin permiso')) });
    expect(await copiarAlPortapapeles('b')).toBe(true);
    expect(document.execCommand).toHaveBeenCalledTimes(2);
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('devuelve false si ningún método funciona', async () => {
    document.execCommand = vi.fn(() => false);
    expect(await copiarAlPortapapeles('a')).toBe(false);
  });
});
