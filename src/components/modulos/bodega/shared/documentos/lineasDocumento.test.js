import { describe, it, expect } from 'vitest';
import { agregarLinea, campoFaltante, campoSugerido, cambiarCantidad, quitarLinea, totalUnidades, erroresLineas, lineasDesdeDocumento, cambiarPrecio, precioSugerido, referenciaProducto, totalValorLineas, precioMaestroClinico, precioInicialLinea } from './lineasDocumento';

const CON_LOTE = { id: 'p1', nombre: 'Sonda', manejaLote: true, manejaVencimiento: true };
const SIN_LOTE = { id: 'p2', nombre: 'Gasa', manejaLote: false, manejaVencimiento: false };

describe('líneas de documento', () => {
  it('solo la cantidad o un vencimiento mal escrito bloquean; lote y vencimiento son opcionales', () => {
    expect(campoFaltante({ producto: CON_LOTE, cantidad: 0 })).toBe('cantidad');
    expect(campoFaltante({ producto: CON_LOTE, cantidad: 1, lote: ' ' })).toBeNull();
    expect(campoFaltante({ producto: CON_LOTE, cantidad: 1, lote: 'a', vencimiento: '2026-02-30' })).toBe('vencimiento');
    expect(campoFaltante({ producto: CON_LOTE, cantidad: 1, lote: 'a', vencimiento: '2026-02-28' })).toBeNull();
    expect(campoFaltante({ producto: SIN_LOTE, cantidad: 2 })).toBeNull();
  });

  it('campo sugerido: el dato opcional vacío que el producto maneja', () => {
    expect(campoSugerido({ producto: CON_LOTE, cantidad: 1, lote: ' ' })).toBe('lote');
    expect(campoSugerido({ producto: CON_LOTE, cantidad: 1, lote: 'a' })).toBe('vencimiento');
    expect(campoSugerido({ producto: CON_LOTE, cantidad: 1, lote: 'a', vencimiento: '2026-02-28' })).toBeNull();
    expect(campoSugerido({ producto: SIN_LOTE, cantidad: 1 })).toBeNull();
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

describe('precio unitario (Carga inicial)', () => {
  const prod = { id: 'p', manejaLote: true, manejaVencimiento: false };
  it('agregarLinea guarda el precio redondeado y, al sumar, conserva el de la línea existente', () => {
    const a = agregarLinea([], { productoId: 'p', producto: prod, lote: 'a1', cantidad: 2, precioUnitario: '1499.6' });
    expect(a.linea.precioUnitario).toBe(1500);
    const b = agregarLinea(a.lineas, { productoId: 'p', producto: prod, lote: 'A1', cantidad: 3, precioUnitario: 999 });
    expect(b.sumada).toBe(true);
    expect(b.lineas[0]).toMatchObject({ cantidad: 5, precioUnitario: 1500 });
  });
  it('sin precio en la entrada (Ingreso, Inventario) no agrega el campo', () => {
    const a = agregarLinea([], { productoId: 'p', producto: prod, lote: 'X', cantidad: 1 });
    expect('precioUnitario' in a.linea).toBe(false);
  });
  it('precio vacío queda null; cambiarPrecio acepta vacío y redondea', () => {
    const a = agregarLinea([], { productoId: 'p', producto: prod, lote: 'X', cantidad: 1, precioUnitario: '' });
    expect(a.linea.precioUnitario).toBeNull();
    const key = a.linea.key;
    expect(cambiarPrecio(a.lineas, key, '250.4')[0].precioUnitario).toBe(250);
    expect(cambiarPrecio(a.lineas, key, '')[0].precioUnitario).toBeNull();
  });
  it('precioSugerido y referenciaProducto', () => {
    expect(precioSugerido({ maestroCodigo: { precioNeto: 12345.5 } })).toBe(12346);
    expect(precioSugerido({ maestroCodigo: null })).toBe('');
    expect(precioSugerido({})).toBe('');
    expect(referenciaProducto({ referencia: 'SF-16', maestroCodigo: { referencia: 'X' } })).toBe('SF-16');
    expect(referenciaProducto({ referencia: '', maestroCodigo: { referencia: 'CVC-7' } })).toBe('CVC-7');
    expect(referenciaProducto({})).toBe('');
  });
  it('totales con líneas antiguas sin precio', () => {
    expect(totalValorLineas([{ cantidad: 2, precioUnitario: 1000 }, { cantidad: 5 }])).toBe(2000);
  });
});

describe('precio neto al crear un producto en Carga inicial', () => {
  it('precarga el precio neto del maestro clínico (pesos enteros; vacío si no tiene)', () => {
    expect(precioMaestroClinico({ precioNeto: 1234.6 })).toBe(1235);
    expect(precioMaestroClinico({ precioNeto: 0 })).toBe('');
    expect(precioMaestroClinico({})).toBe('');
  });

  it('la línea usa el precio neto escrito; si viene vacío o inválido, el del maestro clínico', () => {
    const producto = { maestroCodigo: { precioNeto: 5000 } };
    expect(precioInicialLinea(producto, '4200')).toBe(4200);
    expect(precioInicialLinea(producto, '0')).toBe(0);
    expect(precioInicialLinea(producto, '')).toBe(5000);
    expect(precioInicialLinea(producto, undefined)).toBe(5000);
    expect(precioInicialLinea(producto, '-3')).toBe(5000);
    expect(precioInicialLinea({}, '')).toBe('');
  });
});

describe('código de lote leído (segundo código GS1)', () => {
  it('se guarda en la línea y al sumar se conserva el primero que lo trae', () => {
    let r = agregarLinea([], { productoId: 'p1', producto: CON_LOTE, lote: 'L1', vencimiento: '2034-12-01', cantidad: 1 });
    expect(r.linea.codigoLote).toBe('');
    r = agregarLinea(r.lineas, { productoId: 'p1', producto: CON_LOTE, lote: 'L1', vencimiento: '2034-12-01', cantidad: 2, codigoLote: '1734120110L1' });
    expect(r.linea).toMatchObject({ cantidad: 3, codigoLote: '1734120110L1' });
  });
});
