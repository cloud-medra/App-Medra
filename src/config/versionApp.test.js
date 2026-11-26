import { describe, it, expect } from 'vitest';
import { HISTORIAL_VERSIONES, VERSION_APP, ULTIMA_VERSION } from './versionApp';

const partes = (v) => v.split('.').map(Number);

describe('versionApp', () => {
  it('VERSION_APP es la primera entrada del historial', () => {
    expect(VERSION_APP).toBe(HISTORIAL_VERSIONES[0].version);
    expect(ULTIMA_VERSION).toBe(HISTORIAL_VERSIONES[0]);
  });

  it('cada entrada tiene versión X.Y.Z, fecha AAAA-MM-DD y al menos un cambio', () => {
    for (const v of HISTORIAL_VERSIONES) {
      expect(v.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(v.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(v.cambios.length).toBeGreaterThan(0);
      v.cambios.forEach((c) => expect(c.trim()).not.toBe(''));
    }
  });

  it('las versiones bajan de a una (la más nueva primero) y las fechas no suben', () => {
    for (let i = 1; i < HISTORIAL_VERSIONES.length; i++) {
      const [ma, mi, pa] = partes(HISTORIAL_VERSIONES[i - 1].version);
      const [mb, mib, pb] = partes(HISTORIAL_VERSIONES[i].version);
      const siguiente = (ma === mb && mi === mib && pa === pb + 1) // 1.0.1 → 1.0.2
        || (ma === mb && mi === mib + 1 && pa === 0) // 1.0.9 → 1.1.0
        || (ma === mb + 1 && mi === 0 && pa === 0); // 1.9.9 → 2.0.0
      expect(siguiente, `${HISTORIAL_VERSIONES[i].version} → ${HISTORIAL_VERSIONES[i - 1].version}`).toBe(true);
      expect(HISTORIAL_VERSIONES[i - 1].fecha >= HISTORIAL_VERSIONES[i].fecha).toBe(true);
    }
  });
});
