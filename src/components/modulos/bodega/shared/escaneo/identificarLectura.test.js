import { describe, it, expect, vi } from 'vitest';

vi.mock('../bodegaApi', () => ({ leerVinculo: vi.fn(), obtenerProducto: vi.fn() }));
const { identificarLectura, datosLoteDeLectura, datosLoteEnEspera, combinarDatosLote, opcionesLote, VIGENCIA_DATOS_LOTE_MS, datosLoteEnTexto, esSoloLote } = await import('./identificarLectura');

const GTIN = '07612345678900';
const PRODUCTO = { id: 'p1', nombre: 'Sonda' };

describe('identificarLectura', () => {
  it('GS1 vinculado: producto + lote/vencimiento del código, buscando por GTIN', async () => {
    const leer = vi.fn(async () => ({ productoId: 'p1' }));
    const r = await identificarLectura(`(01)${GTIN}(17)261231(10)L1`, { leer, producto: async () => PRODUCTO });
    expect(leer).toHaveBeenCalledWith(GTIN);
    expect(r.tipo).toBe('producto');
    expect(r.producto).toBe(PRODUCTO);
    expect(datosLoteDeLectura(r.lectura)).toEqual({ lote: 'L1', vencimiento: '2026-12-31' });
  });
  it('sin vínculo, o vinculado a un producto que ya no existe: sinVincular', async () => {
    expect((await identificarLectura('780123', { leer: async () => null, producto: async () => PRODUCTO })).tipo).toBe('sinVincular');
    expect((await identificarLectura('780123', { leer: async () => ({ productoId: 'x' }), producto: async () => null })).tipo).toBe('sinVincular');
  });
  it('segundo código (solo lote/vencimiento): no consulta vínculos', async () => {
    const leer = vi.fn();
    const r = await identificarLectura('(10)XYZ(17)270101', { leer });
    expect(r.tipo).toBe('datosLote');
    expect(leer).not.toHaveBeenCalled();
    expect(datosLoteDeLectura(r.lectura)).toEqual({ lote: 'XYZ', vencimiento: '2027-01-01' });
  });
  it('vacío -> null', async () => expect(await identificarLectura('   ')).toBeNull());
});

describe('dos códigos GS1 (GTIN + lote/vencimiento)', () => {
  const CODIGO_1 = '01076118191390912016';
  const CODIGO_2 = '173412011035769P5';

  it('código 2 crudo no vinculado: datos de lote; si el texto está vinculado, gana el vínculo', async () => {
    const r = await identificarLectura(CODIGO_2, { leer: async () => null, producto: async () => PRODUCTO });
    expect(r.tipo).toBe('datosLote');
    expect(datosLoteDeLectura(r.lectura)).toEqual({ lote: '35769P5', vencimiento: '2034-12-01' });
    const leer = vi.fn(async () => ({ productoId: 'p1' }));
    const normal = await identificarLectura(CODIGO_2, { leer, producto: async () => PRODUCTO });
    expect(leer).toHaveBeenCalledWith(CODIGO_2);
    expect(normal).toMatchObject({ tipo: 'producto', producto: PRODUCTO, lectura: { clave: CODIGO_2 } });
    expect(datosLoteDeLectura(normal.lectura)).toEqual({ lote: '', vencimiento: '' });
  });

  it('código 1 identifica el producto por el GTIN (sin lote)', async () => {
    const leer = vi.fn(async () => ({ productoId: 'p1' }));
    const r = await identificarLectura(CODIGO_1, { leer, producto: async () => PRODUCTO });
    expect(leer).toHaveBeenCalledWith('07611819139091');
    expect(datosLoteDeLectura(r.lectura)).toEqual({ lote: '', vencimiento: '' });
  });

  it('orden 2 → 1: el lote en espera se aplica al producto; vence a los 2 minutos', async () => {
    const dos = await identificarLectura(CODIGO_2, { leer: async () => null });
    const espera = datosLoteEnEspera(dos.lectura, 1000);
    const uno = await identificarLectura(CODIGO_1, { leer: async () => ({ productoId: 'p1' }), producto: async () => PRODUCTO });
    expect(combinarDatosLote(uno.lectura, espera, 2000)).toEqual({ lote: '35769P5', vencimiento: '2034-12-01', codigoLote: CODIGO_2, usoEspera: true });
    expect(combinarDatosLote(uno.lectura, espera, 1000 + VIGENCIA_DATOS_LOTE_MS + 1)).toMatchObject({ lote: '', usoEspera: false });
    expect(combinarDatosLote(uno.lectura, null)).toMatchObject({ lote: '', vencimiento: '', usoEspera: false });
  });

  it('todo en uno: usa el lote del propio código aunque haya uno en espera', async () => {
    const todo = await identificarLectura(']d20107611819139091173412001035769P5', { leer: async () => ({ productoId: 'p1' }), producto: async () => PRODUCTO });
    expect(combinarDatosLote(todo.lectura, { lote: 'OTRO', vencimiento: '2030-01-01', codigoLote: 'x', en: 0 }, 0)).toEqual({ lote: '35769P5', vencimiento: '2034-12-31', codigoLote: '', usoEspera: false });
  });

  it('opcionesLote: un lote por lote + vencimiento (suma dueños), FEFO', () => {
    expect(opcionesLote([
      { lote: 'B', vencimiento: '2030-01-01', disponible: 2 },
      { lote: 'A', vencimiento: '2029-01-01', disponible: 1, propietarioId: null },
      { lote: 'A', vencimiento: '2029-01-01', disponible: 3, propietarioId: 'acme' },
      { lote: null, vencimiento: null, disponible: 0 },
    ])).toEqual([
      { lote: 'A', vencimiento: '2029-01-01', disponible: 4 },
      { lote: 'B', vencimiento: '2030-01-01', disponible: 2 },
      { lote: '', vencimiento: '', disponible: 0 },
    ]);
  });
});

describe('código 2 escaneado dentro de un campo (Lote o modal)', () => {
  it('GS1 de lote/vencimiento: rellena en vez de dejar el texto', () => {
    expect(datosLoteEnTexto('173412011035769P5')).toMatchObject({ lote: '35769P5', vencimiento: '2034-12-01', codigoLote: '173412011035769P5' });
    expect(datosLoteEnTexto(']C1173412001035769P5')).toMatchObject({ lote: '35769P5', vencimiento: '2034-12-31' });
    expect(datosLoteEnTexto(']d20107611819139091173412011035769P5')).toMatchObject({ lote: '35769P5', vencimiento: '2034-12-01', codigoLote: '' });
  });
  it('un lote escrito a mano o un GTIN solo no se tocan', () => {
    expect(datosLoteEnTexto('35769P5')).toBeNull();
    expect(datosLoteEnTexto('L-2024')).toBeNull();
    expect(datosLoteEnTexto('01076118191390912016')).toBeNull();
    expect(datosLoteEnTexto('')).toBeNull();
  });
});

// Ejemplos reales de Carga inicial: barras (código 2 con solo lote) y
// sierras (código 2 con vencimiento y lote).
describe('código 2 con solo lote (barras)', () => {
  const BARRAS_1 = '01076118190259122015';
  const BARRAS_2 = '105505P62';
  const SIERRAS_2 = '17360201' + '1083142p2';
  const sinVinculo = { leer: async () => null, producto: async () => PRODUCTO };

  it('código 1 de barras identifica el producto por el GTIN', async () => {
    const leer = vi.fn(async () => ({ productoId: 'p1' }));
    const r = await identificarLectura(BARRAS_1, { leer, producto: async () => PRODUCTO });
    expect(leer).toHaveBeenCalledWith('07611819025912');
    expect(r.tipo).toBe('producto');
  });

  it('con producto en curso: lote 5505P62, sin vencimiento', async () => {
    const r = await identificarLectura(BARRAS_2, { ...sinVinculo, conProductoEnCurso: true });
    expect(r.tipo).toBe('datosLote');
    expect(datosLoteDeLectura(r.lectura)).toEqual({ lote: '5505P62', vencimiento: '' });
    expect(esSoloLote(r.lectura)).toBe(true);
    expect(datosLoteEnEspera(r.lectura, 1)).toMatchObject({ lote: '5505P62', vencimiento: '', codigoLote: BARRAS_2 });
  });

  it('sin producto en curso: código común (no queda en espera)', async () => {
    const r = await identificarLectura(BARRAS_2, sinVinculo);
    expect(r.tipo).toBe('sinVincular');
    expect(r.lectura.clave).toBe(BARRAS_2);
  });

  it('si ese texto está vinculado a un producto, gana el vínculo', async () => {
    const leer = vi.fn(async () => ({ productoId: 'p1' }));
    const r = await identificarLectura(BARRAS_2, { leer, producto: async () => PRODUCTO, conProductoEnCurso: true });
    expect(leer).toHaveBeenCalledWith(BARRAS_2);
    expect(r).toMatchObject({ tipo: 'producto', producto: PRODUCTO });
  });

  it('sierras (lote y vencimiento) sigue igual, con o sin producto en curso', async () => {
    for (const conProductoEnCurso of [false, true]) {
      const r = await identificarLectura(SIERRAS_2, { ...sinVinculo, conProductoEnCurso });
      expect(r.tipo).toBe('datosLote');
      expect(datosLoteDeLectura(r.lectura)).toEqual({ lote: '83142p2', vencimiento: '2036-02-01' });
      expect(esSoloLote(r.lectura)).toBe(false);
    }
  });

  it('en el campo Lote: convierte el código de solo lote; un lote escrito a mano no cambia', () => {
    expect(datosLoteEnTexto(BARRAS_2, { soloLote: true })).toMatchObject({ lote: '5505P62', vencimiento: '', codigoLote: BARRAS_2 });
    expect(datosLoteEnTexto(BARRAS_2)).toBeNull();
    expect(datosLoteEnTexto('ABC123', { soloLote: true })).toBeNull();
    expect(datosLoteEnTexto(SIERRAS_2, { soloLote: true })).toMatchObject({ lote: '83142p2', vencimiento: '2036-02-01' });
  });
});
