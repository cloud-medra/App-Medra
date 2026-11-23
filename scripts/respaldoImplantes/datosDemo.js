// Datos ficticios para probar el respaldo sin leer Firestore (opción --demo):
// mismo volumen que producción (~3.000 referencias) para medir cuánto tarda
// en abrir y recalcular. Ningún nombre ni admisión es real.

const EMPRESAS = ['DEMO MEDICAL', 'DEMO ORTOPEDIA', 'DEMO IMPLANTES', 'DEMO SURGICAL', 'DEMO SPINE'];
const CLASES = ['TORNILLO', 'PLACA', 'CLAVO', 'PAD', 'ANCLA'];

// Generador determinista (mismo resultado en cada corrida).
const azar = (semilla) => {
  let s = semilla;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
};

export const datosDemo = ({ referencias = 3000, gestiones = 400, anio = '2026', mes = '11' } = {}) => {
  const r = azar(42);
  const codigos = Array.from({ length: referencias }, (_, i) => ({
    referencia: `REF-${String(i % 2799).padStart(5, '0')}`, // ~200 repetidas en otra empresa
    codigo: i % 50 === 0 ? '' : String(100000 + i),
    empresa: EMPRESAS[i % EMPRESAS.length],
    precioNeto: Math.round(5000 + r() * 900000),
    clase: i % 97 === 0 ? 'PAD' : CLASES[i % 3],
    tipo: 'COTIZACION',
    descriptorAuto: `PRODUCTO DEMO ${i}`,
    segmento: 'IMPLANTES',
    estado: i % 60 === 0 ? 'INACTIVO' : 'ACTIVO',
  }));
  const usables = codigos.filter((c) => c.estado === 'ACTIVO');

  const docs = Array.from({ length: gestiones }, (_, g) => {
    const dia = String(1 + (g % 22)).padStart(2, '0');
    const empresa = EMPRESAS[g % EMPRESAS.length];
    const n = 1 + Math.floor(r() * 6);
    const items = Array.from({ length: n }, (__, k) => {
      const c = usables[Math.floor(r() * usables.length)];
      const cantidad = 1 + Math.floor(r() * 3);
      return {
        id: `demo-${g}-${k}`, numCotizacion: `COT-${g}`, referencia: c.referencia, codigo: c.codigo,
        cantidad, lote: `L${k}`, vencimiento: '2028-05-31', precio: c.precioNeto, vecesCosto: 1.5,
        recargoEncontrado: true, venta: c.precioNeto * 1.5 * cantidad, totalItem: c.precioNeto * cantidad,
        empresaVinculada: c.empresa, tipoVinculado: c.tipo, descriptorAuto: c.descriptorAuto, clase: c.clase,
        sinCodigo: !c.codigo, estadoCarga: k % 3 === 0 ? 'CARGADO' : 'PENDIENTE',
      };
    });
    return {
      refPath: `implantes_gestiones/${anio}/mes/${mes}/dia/${dia}/admision/${900000 + g}/empresa/${empresa}/detalles/demo${g}`,
      gestionId: String(900000 + g), nombre: `PACIENTE DEMO ${g}`, fecha: `${anio}-${mes}-${dia}`, empresa,
      informe: 'PENDIENTE', centro: 'PABELLON', atributo: 'IMPLANTES', lado: 'no_especificado', observacion: '',
      convenio: 'P', prevision: 'P', medico: 'P', descripcion: 'P', estado: 'PENDIENTE', solicitud: 'PENDIENTE',
      costo: items.reduce((s, it) => s + it.totalItem, 0), registradoPor: 'DEMO',
      cotizaciones: [{ id: `c${g}`, items }],
    };
  });

  return {
    gestiones: docs,
    codigos,
    empresas: EMPRESAS.map((nombre) => ({ nombre, estado: 'ACTIVO' })),
    centros: [{ nombre: 'PABELLON' }, { nombre: 'AMBULATORIO' }],
    recargos: [
      { desde: 0, hasta: 50000, vecesCosto: 2, estado: 'ACTIVO' },
      { desde: 50001, hasta: 300000, vecesCosto: 1.6, estado: 'ACTIVO' },
      { desde: 300001, hasta: 2000000, vecesCosto: 1.3, estado: 'ACTIVO' },
    ],
    gestionesMesAnterior: Math.round(gestiones * 1.1),
  };
};
