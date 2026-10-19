// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const CARGA = { toMillis: () => 1000 };
// Consignación como la devuelve la consulta (por ruta: día y luego id
// aleatorio): la admisión 100 queda repartida.
const CONSIGNACION = [
  ['aa', '200', 3], ['bb', '100', 2], ['cc', '100', 0], ['dd', '200', 1]
].map(([id, gestionId, posicionCarga]) => ({ id, gestionId, posicionCarga, nombre: `P-${posicionCarga}`, fecha: '2026-10-08', fechaRegistro: CARGA }));
const IMPLANTES = [{ id: 'i2', gestionId: '9', fecha: '2026-10-08' }, { id: 'i1', gestionId: '1', fecha: '2026-10-08' }];

vi.mock('firebase/firestore', () => ({
  getDocs: vi.fn(async (q) => {
    const datos = q.raiz === 'consignacion_registros' ? CONSIGNACION : q.raiz === 'implantes_gestiones' ? IMPLANTES : [];
    return { docs: datos.map((d) => ({ id: d.id, ref: { path: `${q.raiz}/${d.id}` }, data: () => d })) };
  })
}));
vi.mock('./periodoQueryHelpers', () => ({
  aniosDisponiblesPorMarcador: vi.fn(async () => ['2026']),
  aniosDisponiblesPorSondeo: vi.fn(async () => []),
  construirQueryAnioGestion: (raiz) => ({ raiz }),
  calcularMesPorDefecto: () => '10'
}));
vi.mock('../utils/normalizarFila', async (importOriginal) => {
  const original = await importOriginal();
  // Implantes y Hemodinamia: una fila simple por bloque (su forma real no importa acá).
  const simple = (origen) => (b) => ({ origen, id: b.id, gestionId: b.gestionId, fecha: b.fecha });
  return { ...original, normalizarFilaGestionImplantes: simple('IMP'), normalizarFilaGestionHemodinamia: simple('HEMO') };
});

import { useGestionConsolidadaData } from './useGestionConsolidadaData';
import { ORIGEN } from '../utils/normalizarFila';

describe('useGestionConsolidadaData: orden de Consignación', () => {
  it('las filas de Consignación salen en el orden de la carga masiva, cada admisión junta; Implantes no cambia', async () => {
    const { result } = renderHook(() => useGestionConsolidadaData());
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    act(() => { result.current.setAnio('2026'); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const filas = result.current.filasPagina;
    expect(filas.filter((f) => f.origen === 'IMP').map((f) => f.id)).toEqual(['i2', 'i1']);
    // 100 (pos 0, 2), 200 (pos 1, 3).
    expect(filas.filter((f) => f.origen === ORIGEN.CONSIGNACION).map((f) => f.nombre))
      .toEqual(['P-0', 'P-2', 'P-1', 'P-3']);
  });
});
