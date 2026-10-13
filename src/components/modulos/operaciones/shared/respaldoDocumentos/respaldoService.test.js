// Respaldo de documentos por módulo: cada uno en su colección de Firestore y
// su carpeta de Storage (mismas reglas, ver firestore.rules y storage.rules).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const escrituras = [];
vi.mock('firebase/firestore', () => ({
  collection: (_db, nombre) => ({ nombre }),
  doc: (col, ...partes) => (partes.length > 1 ? { ruta: `${partes[0]}/${partes[1]}` } : { id: 'nuevo', ruta: `${col.nombre}/nuevo` }),
  setDoc: async (ref, datos) => { escrituras.push(['set', ref.ruta, datos]); },
  updateDoc: async (ref, datos) => { escrituras.push(['update', ref.ruta, datos]); },
  deleteDoc: async (ref) => { escrituras.push(['delete', ref.ruta]); },
  serverTimestamp: () => 'ts',
}));
vi.mock('firebase/storage', () => ({
  ref: (_s, ruta) => ({ ruta }),
  uploadBytesResumable: (ref) => {
    escrituras.push(['upload', ref.ruta]);
    return { on: (_e, _p, _r, listo) => listo() };
  },
  deleteObject: async (ref) => { escrituras.push(['deleteObject', ref.ruta]); },
}));
vi.mock('../../../../../firebaseConfig', () => ({ db: {}, storage: {}, auth: { currentUser: { uid: 'u1', email: 'a@x.cl' } } }));
vi.mock('../../../../../hooks/useVisibleSnapshot', () => ({ onSnapshotVisible: vi.fn() }));

const servicio = await import('./respaldoService');

beforeEach(() => { escrituras.length = 0; });

describe('respaldoService por módulo', () => {
  it.each([
    ['implantes', 'implantes_respaldo_documentos', 'implantes_respaldo'],
    ['hemodinamia', 'hemodinamia_respaldo_documentos', 'hemodinamia_respaldo'],
  ])('%s: colección %s y carpeta %s', async (modulo, coleccion, carpeta) => {
    const file = new File(['x'], 'orig.pdf', { type: 'application/pdf' });
    const { ruta } = await servicio.subirRespaldo({ modulo, file, idAdmision: '55', fecha: '2026-10-01', nombre: 'ANA', tipo: 'dp', usuarioNombre: 'Yo' });
    expect(ruta).toBe(`${carpeta}/nuevo/55 - ANA - DP.pdf`);
    expect(escrituras[0]).toEqual(['upload', ruta]);
    expect(escrituras[1][1]).toBe(`${coleccion}/nuevo`);
    await servicio.enviarRespaldoAPapelera(modulo, 'r1', 'Yo');
    await servicio.restaurarRespaldo(modulo, 'r1');
    await servicio.eliminarRespaldoDefinitivo(modulo, { id: 'r1', ruta: `${carpeta}/r1/x.pdf` });
    expect(escrituras.slice(2).map(([op, r]) => [op, r])).toEqual([
      ['update', `${coleccion}/r1`], ['update', `${coleccion}/r1`], ['deleteObject', `${carpeta}/r1/x.pdf`], ['delete', `${coleccion}/r1`],
    ]);
  });
});
