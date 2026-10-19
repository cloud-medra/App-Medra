import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBuscar = vi.fn();
vi.mock('./buscarReporteInfoPorAdmision', () => ({ buscarReporteInfoPorAdmision: (...a) => mockBuscar(...a) }));
vi.mock('../../../../../../stores/catalogosStore', () => ({ cargarCatalogo: vi.fn(), refrescarCatalogo: vi.fn() }));

import { buscarReporteInfoReintentandoNoEncontradas } from './cacheMaestros';

describe('buscarReporteInfoReintentandoNoEncontradas', () => {
  beforeEach(() => mockBuscar.mockReset());

  it('la encontrada sale de la caché; la no encontrada se vuelve a consultar', async () => {
    mockBuscar.mockImplementation(async (_db, adm) => (adm === '100' ? { Paciente: 'A' } : null));
    await buscarReporteInfoReintentandoNoEncontradas({}, '100');
    await buscarReporteInfoReintentandoNoEncontradas({}, '200');
    expect(mockBuscar).toHaveBeenCalledTimes(2);

    // Mientras tanto la 200 se completó en Reportes Info.
    mockBuscar.mockImplementation(async () => ({ Paciente: 'B' }));
    expect(await buscarReporteInfoReintentandoNoEncontradas({}, '100')).toEqual({ Paciente: 'A' });
    expect(await buscarReporteInfoReintentandoNoEncontradas({}, '200')).toEqual({ Paciente: 'B' });
    expect(mockBuscar.mock.calls.map((c) => c[1])).toEqual(['100', '200', '200']);

    // Ya encontrada: no se vuelve a consultar.
    await buscarReporteInfoReintentandoNoEncontradas({}, '200');
    expect(mockBuscar).toHaveBeenCalledTimes(3);
  });
});
