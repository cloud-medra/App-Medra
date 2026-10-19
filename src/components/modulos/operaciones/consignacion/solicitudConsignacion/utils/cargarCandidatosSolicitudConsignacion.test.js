import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mockea todo firebase/firestore: getDocs se resuelve en orden según qué
// consulta se está armando (CARGADO -> guía por delivery -> maestros por
// referencia), sin necesidad de un emulador real.
const estadoMock = { llamadas: [] };

vi.mock('firebase/firestore', () => ({
  collectionGroup: (_db, nombre) => ({ tipo: 'collectionGroup', nombre }),
  collection: (_db, nombre) => ({ tipo: 'collection', nombre }),
  query: (base, ...restricciones) => ({ base, restricciones }),
  where: (campo, op, valor) => ({ campo, op, valor }),
  orderBy: (campo, direccion) => ({ campo, direccion }),
  getDocs: vi.fn()
}));

vi.mock('../../../../../../firebaseConfig', () => ({ db: {} }));

const docFake = (id, data, path) => ({
  id,
  ref: { path: path || `consignacion_registros/2026/mes/09/dia/22/admision/X/empresa/Y/detalles/${id}` },
  data: () => data
});

describe('cargarCandidatosSolicitudConsignacion', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    estadoMock.llamadas = [];
  });

  it('trae TODOS los ítems CARGADO de consignacion_registros, sin límite ni recorte', async () => {
    const { getDocs } = await import('firebase/firestore');
    const { cargarCandidatosSolicitudConsignacion } = await import('./cargarCandidatosSolicitudConsignacion');

    // 50 ítems CARGADO sin delivery vinculado — sin llamadas extra de guía.
    const itemsFake = Array.from({ length: 50 }, (_, i) =>
      docFake(`item-${i}`, { estado: 'CARGADO', gestionId: `10${i}`, nombre: `Paciente ${i}`, costo: 100, cantidad: 1 })
    );

    getDocs.mockResolvedValueOnce({ docs: itemsFake });

    const resultado = await cargarCandidatosSolicitudConsignacion();

    expect(resultado).toHaveLength(50);
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it('excluye documentos de otros módulos que comparten la subcolección "detalles"', async () => {
    const { getDocs } = await import('firebase/firestore');
    const { cargarCandidatosSolicitudConsignacion } = await import('./cargarCandidatosSolicitudConsignacion');

    const docsMezclados = [
      docFake('c1', { estado: 'CARGADO', gestionId: '1', costo: 10, cantidad: 1 }, 'consignacion_registros/.../detalles/c1'),
      docFake('i1', { estado: 'CARGADO', gestionId: '2' }, 'implantes_gestiones/.../detalles/i1'),
      docFake('h1', { estado: 'CARGADO', gestionId: '3' }, 'hemodinamia_gestiones/.../detalles/h1')
    ];
    getDocs.mockResolvedValueOnce({ docs: docsMezclados });

    const resultado = await cargarCandidatosSolicitudConsignacion();

    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe('c1');
  });

  it('agrega filas de desglose de guía para ítems con delivery vinculado (antes faltaban en Cargas Consolidado)', async () => {
    const { getDocs } = await import('firebase/firestore');
    const { cargarCandidatosSolicitudConsignacion } = await import('./cargarCandidatosSolicitudConsignacion');

    const itemConDelivery = docFake('item-1', {
      estado: 'CARGADO', gestionId: '500', nombre: 'Ana Ríos', costo: 1000, cantidad: 1, delivery: 'GUIA-001'
    }, 'consignacion_registros/.../detalles/item-1');

    // 1) query de CARGADO
    getDocs.mockResolvedValueOnce({ docs: [itemConDelivery] });
    // 2) query de la guía (numeroDocumento == delivery)
    getDocs.mockResolvedValueOnce({
      empty: false,
      docs: [
        { data: () => ({ numeroGuia: '999', codigo: 'PROD-A', cantidad: 3, lote: 'L1', vencimiento: '2027-01-01' }) }
      ]
    });
    // 3) query de maestros_codigos (referencia in [...])
    getDocs.mockResolvedValueOnce({ docs: [] });

    const resultado = await cargarCandidatosSolicitudConsignacion();

    // El ítem real + 1 fila de desglose de guía = 2 filas totales.
    expect(resultado).toHaveLength(2);
    const filaDesglose = resultado.find(f => f.esFilaGuia);
    expect(filaDesglose).toBeTruthy();
    expect(filaDesglose.codigo).toBe('No lleva OC');
    expect(filaDesglose.cantidad).toBe(3);
    expect(filaDesglose.ref).toBeNull();
  });

  it('el N° de guía va en cada fila "No lleva OC" (el de su propio producto) y la fila principal queda en 0', async () => {
    const { getDocs } = await import('firebase/firestore');
    const { cargarCandidatosSolicitudConsignacion } = await import('./cargarCandidatosSolicitudConsignacion');

    const item = docFake('item-2', {
      estado: 'CARGADO', gestionId: '600', costo: 500, cantidad: 2, delivery: 'GUIA-002'
    }, 'consignacion_registros/.../detalles/item-2');

    getDocs.mockResolvedValueOnce({ docs: [item] });
    getDocs.mockResolvedValueOnce({
      empty: false,
      docs: [
        { data: () => ({ numeroGuia: '111', codigo: 'PROD-A', cantidad: 1 }) },
        { data: () => ({ numeroGuia: '222', codigo: 'PROD-B', cantidad: 1 }) },
        { data: () => ({ numeroGuia: '111', codigo: 'KIT MANGA CRL', cantidad: 1 }) }
      ]
    });
    getDocs.mockResolvedValueOnce({ docs: [] });

    const resultado = await cargarCandidatosSolicitudConsignacion(true);

    const principal = resultado.find(f => !f.esFilaGuia);
    expect(principal.numeroGuia).toBe(0);
    expect(principal.costoTotal).toBe(1000);
    expect(resultado.filter(f => f.esFilaGuia).map(f => f.numeroGuia)).toEqual(['111', '222']);

    // Lo que se guarda en consignacion_imputadas: 0 en la principal y el
    // número de cada producto en filasGuia.
    expect(principal.numeroGuiaParaImputar).toBe(0);
    expect(principal.filasGuia).toEqual([
      { codigoGuia: 'PROD-A', descripcion: '-', empresa: '-', atributo: '-', cantidad: 1, lote: 'N/A', vencimiento: 'N/A', numeroGuia: '111' },
      { codigoGuia: 'PROD-B', descripcion: '-', empresa: '-', atributo: '-', cantidad: 1, lote: 'N/A', vencimiento: 'N/A', numeroGuia: '222' }
    ]);
  });

  it('sin filas de guía, se sigue guardando el N° de guía vinculado en la fila principal', async () => {
    const { getDocs } = await import('firebase/firestore');
    const { cargarCandidatosSolicitudConsignacion } = await import('./cargarCandidatosSolicitudConsignacion');

    const item = docFake('item-3', {
      estado: 'CARGADO', gestionId: '700', costo: 10, cantidad: 1, delivery: 'GUIA-003', numeroGuiaVinculada: '333'
    }, 'consignacion_registros/.../detalles/item-3');

    getDocs.mockResolvedValueOnce({ docs: [item] });
    getDocs.mockResolvedValueOnce({ empty: true, docs: [] });

    const [principal] = await cargarCandidatosSolicitudConsignacion(true);

    expect(principal.numeroGuia).toBe(0);
    expect(principal.filasGuia).toEqual([]);
    expect(principal.numeroGuiaParaImputar).toBe('333');
  });

  describe('orden de la carga masiva (opción ordenCarga, pantalla nativa)', () => {
    const CARGA = { toMillis: () => 1000 };
    // Como los devuelve Firestore: por id aleatorio.
    const docsCarga = () => [
      docFake('zz', { estado: 'CARGADO', gestionId: '200', posicionCarga: 3, fechaRegistro: CARGA, delivery: 'GUIA-ORDEN' }),
      docFake('aa', { estado: 'CARGADO', gestionId: '100', posicionCarga: 2, fechaRegistro: CARGA }),
      docFake('mm', { estado: 'CARGADO', gestionId: '100', posicionCarga: 0, fechaRegistro: CARGA }),
      docFake('bb', { estado: 'CARGADO', gestionId: '200', posicionCarga: 1, fechaRegistro: CARGA })
    ];
    const mockGuia = (getDocs) => {
      getDocs.mockResolvedValueOnce({ empty: false, docs: [{ data: () => ({ numeroGuia: '7', codigo: 'PROD-Z', cantidad: 1 }) }] });
      getDocs.mockResolvedValueOnce({ docs: [] });
    };

    it('ordena los ítems como Cargas y la fila de guía sigue debajo de su ítem', async () => {
      const { getDocs } = await import('firebase/firestore');
      const { cargarCandidatosSolicitudConsignacion } = await import('./cargarCandidatosSolicitudConsignacion');
      getDocs.mockResolvedValueOnce({ docs: docsCarga() });
      mockGuia(getDocs);

      const resultado = await cargarCandidatosSolicitudConsignacion(false, { ordenCarga: true });
      // 100 (pos 0, 2), 200 (pos 1, 3 + su fila de guía).
      expect(resultado.map((f) => (f.esFilaGuia ? 'guia' : f.id))).toEqual(['mm', 'aa', 'bb', 'zz', 'guia']);
    });

    it('sin la opción (Cargas Consolidado) se mantiene el orden de la consulta', async () => {
      const { getDocs } = await import('firebase/firestore');
      const { cargarCandidatosSolicitudConsignacion } = await import('./cargarCandidatosSolicitudConsignacion');
      getDocs.mockResolvedValueOnce({ docs: docsCarga() });

      const resultado = await cargarCandidatosSolicitudConsignacion();
      expect(resultado.filter((f) => !f.esFilaGuia).map((f) => f.id)).toEqual(['zz', 'aa', 'mm', 'bb']);
    });
  });
});
