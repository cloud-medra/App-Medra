import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExcel = vi.fn();
const mockPdf = vi.fn();
vi.mock('../shared/exportar', () => ({ exportarExcel: (...a) => mockExcel(...a), exportarPdf: (...a) => mockPdf(...a) }));
// Maestro de productos en memoria: la exportación usa su referencia (no el código).
vi.mock('../../../../stores/catalogosStore', () => ({ leerCatalogo: () => [{ id: 'a', referencia: 'REF-T1' }, { id: 'b', referencia: '' }] }));

const { exportarContenidoCaja, exportarInventarioCaja, exportarReposicionCaja } = await import('./exportarCajas');

const caja = {
  nombre: 'Caja de tutores', completitud: 50, totalFaltante: 3,
  productos: { a: { nombre: 'Tutor S', codigoMaestro: 'T1', stockObjetivo: 5, stockActual: 2 } },
};
const valores = (columnas, fila) => columnas.map((c) => c.valor(fila));

describe('exportarCajas', () => {
  beforeEach(() => { mockExcel.mockReset(); mockPdf.mockReset(); });

  it('contenido: PDF con el nombre de la caja como título y el faltante', async () => {
    await exportarContenidoCaja(caja, 'pdf');
    const [, opciones] = mockPdf.mock.calls[0];
    expect(opciones.titulo).toBe('Caja de tutores');
    expect(valores(opciones.columnas, opciones.filas[0])).toEqual(['REF-T1', 'Tutor S', 5, 2, 3]);
  });

  it('inventario: dos hojas en Excel y dos secciones en PDF', async () => {
    const inv = { fecha: new Date(2026, 9, 14, 10, 0), usuario: { nombre: 'Ana' }, lineas: [
      { productoId: 'a', nombre: 'Tutor S', codigoMaestro: 'T1', objetivo: 5, actualPrevio: 4, contado: 2, consumo: 2, faltante: 3 },
      { productoId: 'b', nombre: 'Venda', codigoMaestro: '', objetivo: 1, actualPrevio: 1, contado: 1, consumo: 0, faltante: 0 },
    ] };
    await exportarInventarioCaja(caja, inv, 'excel');
    const hojas = mockExcel.mock.calls[0][1];
    expect(hojas.map((h) => [h.nombre, h.filas.length])).toEqual([['Consumo vs actual', 2], ['Faltante vs objetivo', 1]]);
    await exportarInventarioCaja(caja, inv, 'pdf');
    const opciones = mockPdf.mock.calls[0][1];
    expect(opciones.subtitulo).toMatch(/Ana/);
    expect(opciones.secciones).toHaveLength(2);
  });

  it('reposición: lotes legibles y pendiente', async () => {
    await exportarReposicionCaja(caja, { lineas: [{ productoId: 'a', nombre: 'Tutor S', codigoMaestro: 'T1', faltanteAntes: 3, cantidad: 2, pendiente: 1, lotes: [{ lote: null, vencimiento: null, cantidad: 2 }] }] }, 'excel');
    const [{ columnas, filas }] = mockExcel.mock.calls[0][1];
    expect(valores(columnas, filas[0])).toEqual(['REF-T1', 'Tutor S', 3, 2, 1, 'S/L × 2']);
  });
});
