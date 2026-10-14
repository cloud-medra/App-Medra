import { describe, it, expect } from 'vitest';
import { agregarLinea, campoFaltante, cambiarCantidad, quitarLinea, totalUnidades, erroresLineas, lineasDesdeDocumento } from './lineasDocumento';

const CON_LOTE = { id: 'p1', nombre: 'Sonda', manejaLote: true, manejaVencimiento: true };
const SIN_LOTE = { id: 'p2', nombre: 'Gasa', manejaLote: false, manejaVencimiento: false };

describe('líneas de documento', () => {
  it('campo faltante en orden: cantidad, lote, vencimiento', () => {
    expect(campoFaltante({ producto: CON_LOTE, cantidad: 0 })).toBe('cantidad');
    expect(campoFaltante({ producto: CON_LOTE, cantidad: 1, lote: ' ' })).toBe('lote');
    expect(campoFaltante({ producto: CON_LOTE, cantidad: 1, lote: 'a', vencimiento: '2026-02-30' })).toBe('vencimiento');
    expect(campoFaltante({ producto: CON_LOTE, cantidad: 1, lote: 'a', vencimiento: '2026-02-28' })).toBeNull();
    expect(campoFaltante({ producto: SIN_LOTE, cantidad: 2 })).toBeNull();
  });

  it('el mismo producto + lote + vencimiento se suma (lote sin distinguir espacios/mayúsculas)', () => {
    let r = agregarLinea([], { productoId: 'p1', producto: CON_LOTE, lote: 'ab 1', vencimiento: '2027-01-01', cantidad: 1 });
    expect(r.sumada).toBe(false);
    r = agregarLinea(r.lineas, { productoId: 'p1', producto: CON_LOTE, lote: 'AB1', vencimiento: '2027-01-01', cantidad: 2 });
    expect(r.sumada).toBe(true);
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0]).toMatchObject({ lote: 'AB1', cantidad: 3 });
    r = agregarLinea(r.lineas, { productoId: 'p1', producto: CON_LOTE, lote: 'AB1', vencimiento: '2027-02-01', cantidad: 1 });
    expect(r.lineas).toHaveLength(2);
  });

  it('producto sin lote: descarta lote/vencimiento leídos', () => {
    const { linea } = agregarLinea([], { productoId: 'p2', producto: SIN_LOTE, lote: 'X', vencimiento: '2027-01-01', cantidad: 1 });
    expect(linea).toMatchObject({ lote: '', vencimiento: '' });
  });

  it('editar, quitar, total y errores contra el maestro', () => {
    let { lineas } = agregarLinea([], { productoId: 'p1', producto: CON_LOTE, lote: 'L', vencimiento: '2027-01-01', cantidad: 1 });
    ({ lineas } = agregarLinea(lineas, { productoId: 'p2', producto: SIN_LOTE, cantidad: 4 }));
    lineas = cambiarCantidad(lineas, lineas[0].key, 5);
    expect(totalUnidades(lineas)).toBe(9);
    expect(erroresLineas(lineas, { p1: CON_LOTE, p2: SIN_LOTE })).toEqual([]);
    expect(erroresLineas(cambiarCantidad(lineas, lineas[1].key, 0), { p1: CON_LOTE, p2: SIN_LOTE })).toHaveLength(1);
    expect(erroresLineas(lineas, { p2: SIN_LOTE })).toEqual(['El producto no existe.']);
    expect(quitarLinea(lineas, lineas[0].key)).toHaveLength(1);
    expect(lineasDesdeDocumento([{ productoId: 'p1', lote: 'L', vencimiento: '', cantidad: 1 }])[0].key).toBeTruthy();
  });
});
