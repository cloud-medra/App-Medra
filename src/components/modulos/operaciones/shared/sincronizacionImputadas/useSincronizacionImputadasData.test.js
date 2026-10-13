// @vitest-environment jsdom
// Sincronizar (imputadas) por módulo: cada módulo busca en sus gestiones,
// compara con sus imputadas y escribe en ellas (Implantes y Hemodinamia).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const consultas = [];
const escrituras = [];
const gestiones = {};
vi.mock('firebase/firestore', () => ({
  collection: (_db, ...partes) => ({ ruta: partes.join('/') }),
  collectionGroup: (_db, nombre) => ({ grupo: nombre }),
  doc: (_db, ...partes) => ({ ruta: partes.join('/') }),
  where: (campo, op, valor) => ({ campo: String(campo), op, valor }),
  orderBy: () => ({}),
  documentId: () => '__name__',
  query: (base, ...filtros) => ({ base, filtros }),
  getDocs: async (q) => {
    consultas.push(q);
    if (q.base.grupo) {
      const prefijo = q.filtros.find((f) => f.op === '>=').valor.split('/')[0];
      return { docs: (gestiones[prefijo] || []).map((g) => ({ ref: { path: `${prefijo}/2026/x/detalles/${g.id}` }, data: () => g })) };
    }
    if (q.base.ruta === 'cierres_periodos') return { empty: false, docs: [{ data: () => ({ anio: 2026, mes: 'octubre' }) }] };
    return { docs: [] };
  },
  writeBatch: () => ({ set: (ref) => escrituras.push(['set', ref.ruta]), delete: (ref) => escrituras.push(['delete', ref.ruta]), commit: async () => {} }),
}));
vi.mock('../../../../../firebaseConfig', () => ({ db: {} }));
const showToast = vi.fn();
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../../../../../context/UserContext', () => ({ useUser: () => ({ userData: { nombreCompleto: 'Yo' } }) }));
const logs = [];
vi.mock('../../implantes/gestionImplantes/utils/registrarLogImplantes', () => ({ registrarLogImplantes: async (ref, accion) => { logs.push([ref.ruta, accion]); } }));

const { useSincronizacionImputadasData } = await import('./useSincronizacionImputadasData');

const item = { id: 'it1', referencia: 'REF', codigo: 'C', cantidad: 1, precio: 10, periodoAnio: 2026, periodoMes: 'octubre' };
beforeEach(() => { consultas.length = 0; escrituras.length = 0; logs.length = 0; });

describe('useSincronizacionImputadasData por módulo', () => {
  it.each([
    ['implantes', 'implantes_gestiones', 'implantes_imputadas', 'PABELLON'],
    ['hemodinamia', 'hemodinamia_gestiones', 'hemodinamia_imputadas', 'HEMODINAMIA'],
  ])('%s: busca en %s, compara con %s y corrige ahí', async (modulo, gestionesCol, imputadasCol, centro) => {
    gestiones[gestionesCol] = [{ id: 'g1', gestionId: '123', empresa: 'ACME', fecha: '2026-10-01', solicitud: 'SOLICITADO', cotizaciones: [{ items: [item] }] }];
    const { result } = renderHook(() => useSincronizacionImputadasData(modulo));
    await act(async () => { await result.current.buscarAdmisiones(['123']); });
    const [res] = result.current.resultados;
    expect(res.error).toBeNull();
    const bloque = res.bloques[0];
    expect(bloque.dataGestion.centro).toBe(centro);
    // Comparó contra las imputadas del módulo y del período del ítem.
    expect(consultas.some((q) => q.base.ruta === `${imputadasCol}/2026/meses/octubre/documentos`)).toBe(true);
    await act(async () => { await result.current.aplicarCorreccion('123', bloque); });
    expect(escrituras).toEqual([['set', `${imputadasCol}/2026/meses/octubre/documentos/it1`]]);
    expect(logs).toEqual([[`${gestionesCol}/2026/x/detalles/g1`, 'IMPUTACION_RESINCRONIZADA']]);
  });

  it('una admisión que no existe en el módulo lo informa con su colección', async () => {
    gestiones.hemodinamia_gestiones = [];
    const { result } = renderHook(() => useSincronizacionImputadasData('hemodinamia'));
    await act(async () => { await result.current.buscarAdmisiones(['999']); });
    expect(result.current.resultados[0].error).toBe('No se encontró esta admisión en hemodinamia_gestiones.');
  });
});
