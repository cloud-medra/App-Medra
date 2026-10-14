import { describe, it, expect, vi } from 'vitest';

vi.mock('../bodegaApi', () => ({ leerVinculo: vi.fn(), obtenerProducto: vi.fn() }));
const { identificarLectura, datosLoteDeLectura } = await import('./identificarLectura');

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
