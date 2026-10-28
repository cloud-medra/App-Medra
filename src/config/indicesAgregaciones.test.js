import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Toda agregación sum() con filtros necesita un índice compuesto que
// incluya los campos filtrados Y los sumados; el índice automático de un
// campo no alcanza. Sin él, getAggregateFromServer falla con
// FAILED_PRECONDITION y la pantalla muestra 0 (pasó con la Valorización de
// bodega y el Comparativo mensual: el índice (periodoId, linea) no tenía
// cantidad ni valor). Un sum() sin filtros no necesita índice compuesto.
//
// CONSULTAS lista cada consulta sum() de src/: el test exige que su índice
// exista en firestore.indexes.json y que todo archivo con sum() esté aquí
// con todos sus campos sumados. Al agregar una consulta, se agrega aquí y
// su índice al archivo.
const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const INDICES = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../firestore.indexes.json', import.meta.url)), 'utf8'));

const CONSULTAS = {
  // Saldo de Bodega del mes abierto: sum() por línea de la cuadratura
  // (periodoId == id, o == null para los movimientos sin periodo).
  'components/modulos/administracion/controlMensual/bodegaPeriodoStore.js': [
    { coleccion: 'bodega_movimientos', filtros: ['periodoId', 'linea'], sumas: ['cantidad', 'valor'] },
  ],
  // Mes abierto de Control Mensual: toda la subcolección, sin filtros.
  'components/modulos/administracion/controlMensual/resumenImputacionesStore.js': [
    { coleccion: 'documentos', filtros: [], sumas: ['total'] },
  ],
  // Comparativo mensual: rango sobre la fecha del documento.
  'components/modulos/administracion/totalesFinanzas/useComparativoMesData.js': [
    { coleccion: 'documentos', filtros: ['fecha'], sumas: ['total'] },
    { coleccion: 'documentos', filtros: ['fchEmis'], sumas: ['total'] },
  ],
  // Herramienta de medición (solo desarrollo): toda la subcolección, sin filtros.
  'dev/firestoreMeter.js': [
    { coleccion: 'documentos', filtros: [], sumas: ['total'] },
  ],
};

const recorrer = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'privado' ? [] : recorrer(p);
  return /\.(jsx?|tsx?)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
});
const relativo = (p) => path.relative(RAIZ, p).split(path.sep).join('/');

// sum('campo') o fs.sum('campo') de firebase/firestore.
const sumasDe = (codigo) => [...codigo.matchAll(/\bsum\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);

// Campos de un índice compuesto (sin el __name__ implícito).
const camposIndice = (i) => i.fields.map((f) => f.fieldPath).filter((c) => c !== '__name__');
const tieneIndice = ({ coleccion, filtros, sumas }) => {
  const buscados = [...filtros, ...sumas].sort();
  return INDICES.indexes.some((i) => i.collectionGroup === coleccion && i.queryScope === 'COLLECTION'
    && JSON.stringify([...camposIndice(i)].sort()) === JSON.stringify(buscados));
};

describe('índices de las agregaciones sum()', () => {
  const conSuma = recorrer(RAIZ)
    .map((p) => ({ archivo: relativo(p), sumas: sumasDe(fs.readFileSync(p, 'utf8')) }))
    .filter((a) => a.sumas.length);

  it('todo archivo con sum() está en CONSULTAS con todos sus campos sumados', () => {
    const faltan = conSuma.flatMap(({ archivo, sumas }) => {
      const declaradas = (CONSULTAS[archivo] || []).flatMap((c) => c.sumas);
      return sumas.filter((s) => !declaradas.includes(s)).map((s) => `${archivo}: sum('${s}')`);
    });
    expect(faltan).toEqual([]);
  });

  it('CONSULTAS no tiene archivos que ya no usan sum()', () => {
    const usados = conSuma.map((a) => a.archivo);
    expect(Object.keys(CONSULTAS).filter((a) => !usados.includes(a))).toEqual([]);
  });

  it('cada sum() con filtros tiene su índice compuesto en firestore.indexes.json', () => {
    const sinIndice = Object.entries(CONSULTAS).flatMap(([archivo, consultas]) => consultas
      .filter((c) => c.filtros.length && !tieneIndice(c))
      .map((c) => `${archivo}: ${c.coleccion} (${[...c.filtros, ...c.sumas].join(', ')})`));
    expect(sinIndice).toEqual([]);
  });
});

// count() (getCountFromServer o count() en getAggregateFromServer) con
// filtros: sin índice falla igual que sum() y el contador queda vacío o en 0.
//   - Sin filtros, o un solo campo en una consulta de colección: alcanza el
//     índice automático de un campo (salvo que un fieldOverride lo quite).
//   - Un campo en collectionGroup (el rango de documentId() no cuenta): el
//     índice de un campo NO es automático para collection group; tiene que
//     estar en fieldOverrides con queryScope COLLECTION_GROUP.
//   - Más campos: índice compuesto con esos campos en el mismo alcance.
// CONTEOS lista cada consulta count() de src/ por archivo (`alcance`
// COLLECTION o COLLECTION_GROUP; `filtros` sin __name__). Un or(...) se
// declara como una consulta por rama. También van aquí las consultas
// getDocs del panel del Inicio que comparten sus índices.
const CONTEOS = {
  'components/modulos/administracion/controlMensual/bodegaPeriodoStore.js': [
    { coleccion: 'bodega_movimientos', alcance: 'COLLECTION', filtros: ['periodoId'] },
  ],
  'components/modulos/administracion/controlMensual/resumenImputacionesStore.js': [
    { coleccion: 'documentos', alcance: 'COLLECTION', filtros: [] },
  ],
  'components/modulos/administracion/totalesFinanzas/useComparativoMesData.js': [
    { coleccion: 'documentos', alcance: 'COLLECTION', filtros: ['fecha', 'total'] },
    { coleccion: 'documentos', alcance: 'COLLECTION', filtros: ['fchEmis', 'total'] },
  ],
  // Control Procesos de Laboratorio: estado in (…) + rango de documentId().
  'components/modulos/gestiones/laboratorio/procesos/usePendientesLaboratorio.js': [
    { coleccion: 'documentos', alcance: 'COLLECTION_GROUP', filtros: ['estado'] },
  ],
  // Cantidad de ítems de cada PAD: toda la subcolección.
  'components/modulos/maestros/padMaestros/PadMaestros.jsx': [
    { coleccion: 'items_pad', alcance: 'COLLECTION', filtros: [] },
  ],
  // Descripciones ocultas de un mes (ocultaImplantes u ocultaDocumentos).
  'components/modulos/operaciones/documentos/reportesInfo/ReportesInfo.jsx': [
    { coleccion: 'registros', alcance: 'COLLECTION', filtros: ['ocultaImplantes'] },
    { coleccion: 'registros', alcance: 'COLLECTION', filtros: ['ocultaDocumentos'] },
  ],
  // Seguimiento de Facturas y Guías: despacho pendiente (numero_guia) y
  // pendiente de factura (or: estado | numero_factura).
  'components/modulos/operaciones/documentos/seguimientoFacturasGuias/hooks/useMesesConPendientes.js': [
    { coleccion: 'detalles', alcance: 'COLLECTION_GROUP', filtros: ['numero_guia'] },
    { coleccion: 'detalles', alcance: 'COLLECTION_GROUP', filtros: ['estado'] },
    { coleccion: 'detalles', alcance: 'COLLECTION_GROUP', filtros: ['numero_factura'] },
  ],
  // Inicio → Pendientes (gestiones de Implantes).
  'components/modulos/dashboard/panelInicio/usePendientesInicioData.js': [
    { coleccion: 'detalles', alcance: 'COLLECTION_GROUP', filtros: ['solicitud'] },
    { coleccion: 'detalles', alcance: 'COLLECTION_GROUP', filtros: ['estado'] },
    { coleccion: 'detalles', alcance: 'COLLECTION_GROUP', filtros: ['estado', 'fecha'] },
    // getDocs de las cirugías del día (fecha == día).
    { coleccion: 'detalles', alcance: 'COLLECTION_GROUP', filtros: ['fecha'] },
  ],
  // Herramienta de medición (solo desarrollo): colecciones completas.
  'dev/firestoreMeter.js': [
    { coleccion: '*', alcance: 'COLLECTION', filtros: [] },
  ],
};

// Código sin comentarios (los comentarios mencionan count() a menudo).
const sinComentarios = (codigo) => codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const usaCount = (codigo) => /\bcount\(\)|getCountFromServer\(/.test(sinComentarios(codigo));

const overrideDe = (coleccion, campo) => (INDICES.fieldOverrides || [])
  .find((f) => f.collectionGroup === coleccion && f.fieldPath === campo);
const tieneIndiceConteo = ({ coleccion, alcance, filtros }) => {
  if (filtros.length === 0) return true;
  const buscados = JSON.stringify([...filtros].sort());
  const compuesto = INDICES.indexes.some((i) => i.collectionGroup === coleccion && i.queryScope === alcance
    && JSON.stringify([...camposIndice(i)].sort()) === buscados);
  if (compuesto || filtros.length > 1) return compuesto;
  const override = overrideDe(coleccion, filtros[0]);
  if (alcance === 'COLLECTION') return !override || override.indexes.some((i) => i.queryScope === 'COLLECTION' && i.order);
  return Boolean(override?.indexes.some((i) => i.queryScope === 'COLLECTION_GROUP' && i.order));
};

describe('índices de los conteos count()', () => {
  const conCount = recorrer(RAIZ)
    .filter((p) => usaCount(fs.readFileSync(p, 'utf8')))
    .map(relativo);

  it('todo archivo con count() está en CONTEOS', () => {
    expect(conCount.filter((a) => !CONTEOS[a])).toEqual([]);
  });

  it('CONTEOS no tiene archivos que ya no usan count()', () => {
    expect(Object.keys(CONTEOS).filter((a) => !conCount.includes(a))).toEqual([]);
  });

  it('cada count() con filtros tiene su índice en firestore.indexes.json', () => {
    const sinIndice = Object.entries(CONTEOS).flatMap(([archivo, consultas]) => consultas
      .filter((c) => !tieneIndiceConteo(c))
      .map((c) => `${archivo}: ${c.coleccion} ${c.alcance} (${c.filtros.join(', ')})`));
    expect(sinIndice).toEqual([]);
  });

  it('detecta las reglas: collectionGroup de un campo sin override, o varios campos sin compuesto, fallan', () => {
    expect(tieneIndiceConteo({ coleccion: 'detalles', alcance: 'COLLECTION_GROUP', filtros: ['campoInventado'] })).toBe(false);
    expect(tieneIndiceConteo({ coleccion: 'detalles', alcance: 'COLLECTION_GROUP', filtros: ['estado', 'campoInventado'] })).toBe(false);
    expect(tieneIndiceConteo({ coleccion: 'cualquiera', alcance: 'COLLECTION', filtros: ['campo'] })).toBe(true);
  });
});
