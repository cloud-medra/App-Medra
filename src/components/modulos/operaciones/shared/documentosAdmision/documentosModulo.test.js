// Documentos de admisión por módulo: cada uno en su carpeta de Storage y
// cada uno verifica sus admisiones (Carga masiva) solo en sus gestiones.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const consultas = [];
vi.mock('firebase/firestore', () => ({
  collectionGroup: (_db, nombre) => ({ grupo: nombre }),
  where: (campo, op, valor) => ({ campo: String(campo), op, valor }),
  documentId: () => '__name__',
  limit: (n) => ({ limit: n }),
  query: (...partes) => partes,
  getDocs: async (q) => { consultas.push(q); return { empty: true, docs: [] }; },
}));
vi.mock('firebase/storage', () => ({ ref: vi.fn(), listAll: vi.fn(), uploadBytesResumable: vi.fn(), getBlob: vi.fn() }));
vi.mock('../../../../../firebaseConfig', () => ({ db: {}, storage: {}, auth: {} }));

const { carpetaAdmision } = await import('./documentosStorage');
const { buscarAdmisiones } = await import('../cargaMasivaDocumentos/utils/buscarAdmisiones');

beforeEach(() => { consultas.length = 0; });

describe('documentos de admisión por módulo', () => {
  it('carpeta de Storage de cada módulo', () => {
    expect(carpetaAdmision('implantes', ' 123 ')).toBe('implantes/123/documentos');
    expect(carpetaAdmision('hemodinamia', '45/6')).toBe('hemodinamia/45_6/documentos');
    expect(() => carpetaAdmision('otro', '1')).toThrow();
  });

  it('Carga masiva verifica la admisión solo en las gestiones del módulo', async () => {
    const { encontradas } = await buscarAdmisiones('hemodinamia', ['777']);
    expect(encontradas.get('777')).toBeNull();
    const rango = consultas[0].filter((p) => p.campo === '__name__').map((p) => p.valor);
    expect(rango).toEqual(['hemodinamia_gestiones/0000', 'hemodinamia_gestiones/9999']);
    await buscarAdmisiones('implantes', ['777']);
    expect(consultas[1].find((p) => p.campo === '__name__').valor).toBe('implantes_gestiones/0000');
  });
});
