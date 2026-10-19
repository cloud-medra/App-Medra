import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../shared/useResumenImputadas', () => ({ useResumenImputadas: vi.fn(), TODOS_LOS_MESES: 'TODOS' }));

describe('agruparFilasGuiaPorDocumento', () => {
  it('asocia filasGuia a su documento y no repite las de un delivery compartido', async () => {
    const { agruparFilasGuiaPorDocumento } = await import('./useResumenConsignacionData');
    const filas = [{ codigoGuia: 'A', numeroGuia: '111' }, { codigoGuia: 'B', numeroGuia: '222' }];

    const mapa = agruparFilasGuiaPorDocumento([
      { refPath: 'r1', delivery: 'D1', filasGuia: filas },
      { refPath: 'r2', delivery: 'D1', filasGuia: filas },
      { refPath: 'r3', delivery: 'D2' },
      { refPath: 'r4', delivery: 'D3', filasGuia: [{ codigoGuia: 'C', numeroGuia: '444' }] }
    ]);

    expect(mapa.get('r1').map((f) => f.numeroGuia)).toEqual(['111', '222']);
    expect(mapa.has('r2')).toBe(false);
    expect(mapa.has('r3')).toBe(false);
    expect(mapa.get('r4')[0].numeroGuia).toBe('444');
  });
});

describe('ordenarDocumentosResumen', () => {
  it('por fecha de cirugía (más nueva primero) y, dentro del mismo día, en el orden de la carga masiva', async () => {
    const { ordenarDocumentosResumen } = await import('./useResumenConsignacionData');
    const carga = { toMillis: () => 1000 };
    const docs = [
      { id: 'zz', fecha: '2026-10-08', gestionId: '200', posicionCarga: 3, fechaRegistro: carga },
      { id: 'viejo', fecha: '2026-10-01', gestionId: '900' },
      { id: 'aa', fecha: '2026-10-08', gestionId: '100', posicionCarga: 2, fechaRegistro: carga },
      { id: 'mm', fecha: '2026-10-08', gestionId: '100', posicionCarga: 0, fechaRegistro: carga },
      { id: 'nuevo', fecha: '2026-10-09', gestionId: '500' },
      { id: 'bb', fecha: '2026-10-08', gestionId: '200', posicionCarga: 1, fechaRegistro: carga }
    ];
    expect(ordenarDocumentosResumen(docs).map((d) => d.id)).toEqual(['nuevo', 'mm', 'aa', 'bb', 'zz', 'viejo']);
  });

  it('imputadas antiguas sin posicionCarga: el mismo día queda agrupado por admisión', async () => {
    const { ordenarDocumentosResumen } = await import('./useResumenConsignacionData');
    const carga = { toMillis: () => 1000 };
    const docs = [
      { id: 'x', fecha: '2026-10-08', gestionId: '200', fechaRegistro: carga },
      { id: 'y', fecha: '2026-10-08', gestionId: '100', fechaRegistro: carga },
      { id: 'z', fecha: '2026-10-08', gestionId: '200', fechaRegistro: carga }
    ];
    expect(ordenarDocumentosResumen(docs).map((d) => d.gestionId)).toEqual(['100', '200', '200']);
  });
});
