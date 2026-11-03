// Planificación de una importación de "Detalles OC" contra el snapshot
// (lógica pura, sin Firebase: corre en el Web Worker). Decide, sin leer
// Firestore, qué filas son nuevas, cuáles cambiaron y en qué campos, cuáles
// no cambiaron, y los casos especiales que van al resumen.
//
// Snapshot (formato 2, ver snapshotStorageDetallesOC.js):
//   { [id]: { g: grupo, a: admisión, f: 'YYYY-MM-DD', p: proveedor, v: { campo: valor } } }
// `v` guarda los CAMPOS_COMPARADOS normalizados (fechas 'YYYY-MM-DD',
// números como número, texto recortado, '' si vacío).
import { grupoFilaDetalleOC } from './idFilaDetalleOC';
import { normalizarProveedorId } from './normalizarProveedor';
import { normalizarCodigo } from '../../../shared/ocIndex/normalizacionOC.js';

export const FORMATO_SNAPSHOT = 2;

// Campos de datos que se comparan y se actualizan. Los que definen la ruta
// del documento (admisión, fecha, proveedor) y el id no están: un cambio de
// fecha se trata aparte (la fila se mueve de mes).
export const CAMPOS_COMPARADOS = [
  'paciente', 'medico', 'codigo', 'descripcion', 'cantidad', 'precio_u', 'atributo',
  'oc', 'oc_monto', 'estado', 'fecha_recepcion', 'fecha_cargo',
  'numero_guia', 'numero_factura', 'fecha_emision', 'fecha_ingreso',
  'lote', 'fecha_vencimiento'
];

// Campos que casi nunca cambian: pesan más al emparejar filas repetidas.
const CAMPOS_ESTABLES = ['cantidad', 'precio_u', 'descripcion'];

const pad2 = (n) => String(n).padStart(2, '0');
export const fechaISO = (d) => (d instanceof Date && !isNaN(d.getTime())
  ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  : '');

export const normalizarValor = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v?.toDate === 'function') v = v.toDate();
  if (v instanceof Date) return fechaISO(v);
  if (typeof v === 'number') return Number.isFinite(v) ? v : '';
  return String(v).replace(/\s+/g, ' ').trim();
};

// Vacío: texto vacío o 0 (el parser deja en 0 los números que vienen vacíos).
// Sirve para lo GUARDADO, donde un 0 no distingue "vacío" de "cero".
export const esVacio = (v) => v === '' || v === null || v === undefined || v === 0;

export const CAMPOS_NUMERICOS = ['cantidad', 'precio_u', 'oc_monto'];

// Vacío en el ARCHIVO: en los numéricos solo si la celda venía vacía
// (`_vacios`, ver normalizarFilaDetalleOC); un 0 escrito es un valor real
// que sí sobrescribe lo guardado.
export const vacioEnArchivo = (fila, campo, valor) => (CAMPOS_NUMERICOS.includes(campo)
  ? valor === '' || Boolean(fila?._vacios?.includes(campo))
  : esVacio(valor));

export const valoresDeFila = (fila) =>
  CAMPOS_COMPARADOS.reduce((acc, c) => { acc[c] = normalizarValor(fila[c]); return acc; }, {});

export const entradaSnapshot = (fila, valores = valoresDeFila(fila)) => ({
  g: fila._grupo || grupoFilaDetalleOC(fila),
  a: String(fila.admision),
  f: fechaISO(fila.fecha_cx),
  p: fila.proveedor || '',
  v: valores
});

const correlativo = (id) => {
  const m = String(id).match(/_(\d+)$/);
  return m ? Number(m[1]) : 0;
};

// Puntaje de parecido entre una fila del archivo y una fila guardada del
// mismo grupo: los campos estables pesan 10; el resto suma si coincide, no
// cuenta si uno de los dos está vacío (lo común: se completó la factura) y
// resta si chocan.
export const puntajeParecido = (valores, guardados) => CAMPOS_COMPARADOS.reduce((total, c) => {
  const a = valores[c];
  const b = guardados[c] ?? '';
  if (CAMPOS_ESTABLES.includes(c)) return total + (a === b ? 10 : 0);
  if (a === b) return total + 1;
  if (esVacio(a) || esVacio(b)) return total;
  return total - 1;
}, 0);

// Compara una fila con lo guardado. Un valor vacío NO pisa uno existente:
// se conserva y se informa.
export const diferenciasFila = (fila, valores, guardados) => {
  const cambios = {};
  const noSobrescritos = [];
  const combinados = { ...guardados };
  let ocAntes = null;
  CAMPOS_COMPARADOS.forEach((c) => {
    const nuevo = valores[c];
    const viejo = guardados[c] ?? '';
    if (nuevo === viejo) return;
    const vacio = vacioEnArchivo(fila, c, nuevo);
    if (vacio && !esVacio(viejo)) { noSobrescritos.push({ campo: c, valorGuardado: viejo }); return; }
    if (vacio && esVacio(viejo)) return; // '' vs 0
    cambios[c] = fila[c];
    combinados[c] = nuevo;
    if (c === 'oc' && !esVacio(viejo)) ocAntes = viejo;
  });
  return { cambios, noSobrescritos, combinados, ocAntes };
};

// Empareja las filas del archivo de UN grupo con las guardadas de ese grupo,
// por máximo parecido (no por orden): reordenar el archivo no cambia nada.
// Desempate: campos estables, luego el orden en el archivo y el correlativo.
const emparejarGrupo = (filasGrupo, idsGuardados, snapshot) => {
  const pares = [];
  filasGrupo.forEach((f, i) => {
    idsGuardados.forEach((id) => {
      pares.push({ i, id, puntaje: puntajeParecido(f._valores, snapshot[id].v) });
    });
  });
  pares.sort((x, y) => y.puntaje - x.puntaje || x.i - y.i || correlativo(x.id) - correlativo(y.id));
  const filaUsada = new Set();
  const idUsado = new Set();
  const asignacion = new Map(); // índice de fila -> id
  for (const par of pares) {
    if (filaUsada.has(par.i) || idUsado.has(par.id)) continue;
    filaUsada.add(par.i);
    idUsado.add(par.id);
    asignacion.set(par.i, par.id);
  }
  return asignacion;
};

/**
 * @param filas    filas válidas del archivo (leerFilasDeBuffer): con `id`
 *                 del Excel, o con `_grupo` si el id se genera.
 * @param snapshot { [id]: entrada } (formato 2)
 */
export const planificarImportacion = (filas, snapshot = {}) => {
  const plan = {
    filas: [],            // todas las filas con su id definitivo (para el índice de OC)
    nuevas: [],           // { id, fila, valores }
    actualizadas: [],     // { id, fila, cambios, combinados, campos }
    sinCambios: 0,
    noSobrescritos: [],   // { id, filaExcel, campo, valorGuardado }
    ocCambiadas: [],      // { id, admision, fecha, proveedor, codigo, ocAntes, ocDespues, filaExcel }
    fechasCambiadas: [],  // { idAntes, idNuevo, fila, combinados, fechaAntes, fechaDespues }
    fechasAmbiguas: [],   // { id, filaExcel, fecha, candidatos: [{ id, fecha }] }
    yaNoVienen: [],       // { id, admision, fecha, proveedor, codigo, enGrupoPresente }
    idsFueraDelIndice: [],
    meses: []
  };

  const conValores = filas.map((f) => ({ ...f, _valores: valoresDeFila(f) }));
  const meses = new Set(conValores.map(f => fechaISO(f.fecha_cx).slice(0, 7)).filter(Boolean));
  plan.meses = [...meses].sort();

  // Guardadas por grupo.
  const guardadosPorGrupo = new Map();
  Object.entries(snapshot).forEach(([id, e]) => {
    if (!guardadosPorGrupo.has(e.g)) guardadosPorGrupo.set(e.g, []);
    guardadosPorGrupo.get(e.g).push(id);
  });

  const idsEmparejados = new Set();
  const sinPareja = []; // filas con id generado que no calzaron con nada guardado
  const resultado = []; // { fila, id, guardado: bool }

  // 1) Filas con ID propio del Excel: se comparan por ese id.
  conValores.filter(f => !f._grupo).forEach((f) => {
    resultado.push({ fila: f, id: f.id, guardado: Boolean(snapshot[f.id]) });
    if (snapshot[f.id]) idsEmparejados.add(f.id);
  });

  // 2) Filas con id generado: emparejamiento estable dentro de su grupo.
  const porGrupo = new Map();
  conValores.filter(f => f._grupo).forEach((f) => {
    if (!porGrupo.has(f._grupo)) porGrupo.set(f._grupo, []);
    porGrupo.get(f._grupo).push(f);
  });
  porGrupo.forEach((filasGrupo, grupo) => {
    const guardados = guardadosPorGrupo.get(grupo) || [];
    const asignacion = emparejarGrupo(filasGrupo, guardados, snapshot);
    filasGrupo.forEach((f, i) => {
      const id = asignacion.get(i);
      if (id) { idsEmparejados.add(id); resultado.push({ fila: f, id, guardado: true }); }
      else sinPareja.push(f);
    });
  });

  // 3) Fecha de cirugía cambiada: una fila sin pareja que coincide con UNA
  // sola guardada que no vino (misma admisión, proveedor, código y
  // cantidad; otra fecha), y esa guardada coincide solo con esta fila.
  const noVinieron = Object.keys(snapshot).filter(id => !idsEmparejados.has(id));
  const claveSinFecha = (a, p, c, q) => `${a}|${normalizarProveedorId(p)}|${normalizarCodigo(c)}|${q}`;
  const noVinieronPorClave = new Map();
  noVinieron.forEach((id) => {
    const e = snapshot[id];
    const k = claveSinFecha(e.a, e.p, e.v.codigo, e.v.cantidad);
    if (!noVinieronPorClave.has(k)) noVinieronPorClave.set(k, []);
    noVinieronPorClave.get(k).push(id);
  });
  const candidatosDe = (f) => (noVinieronPorClave.get(claveSinFecha(String(f.admision), f.proveedor, f.codigo, f._valores.cantidad)) || [])
    .filter(id => snapshot[id].f !== fechaISO(f.fecha_cx));
  const reclamos = new Map(); // id guardado -> cuántas filas lo reclaman
  sinPareja.forEach(f => candidatosDe(f).forEach(id => reclamos.set(id, (reclamos.get(id) || 0) + 1)));

  const movidas = new Map(); // fila -> id guardado
  const ambiguas = new Map(); // fila -> candidatos
  sinPareja.forEach((f) => {
    const cands = candidatosDe(f);
    if (cands.length === 1 && reclamos.get(cands[0]) === 1) movidas.set(f, cands[0]);
    else if (cands.length > 0) ambiguas.set(f, cands);
  });
  const idsMovidos = new Set(movidas.values());

  // 4) Ids nuevos: correlativo siguiente dentro del grupo, sin reutilizar
  // ids guardados (aunque no vengan en el archivo).
  const siguiente = new Map();
  const nuevoId = (grupo) => {
    if (!siguiente.has(grupo)) {
      const max = Math.max(0, ...(guardadosPorGrupo.get(grupo) || []).map(correlativo));
      siguiente.set(grupo, max);
    }
    const n = siguiente.get(grupo) + 1;
    siguiente.set(grupo, n);
    return `${grupo}_${n}`;
  };
  // Orden estable de los ids nuevos: por campos estables y luego por fila.
  const ordenEstable = (x, y) => String(x._valores.cantidad).localeCompare(String(y._valores.cantidad), 'es', { numeric: true })
    || String(x._valores.precio_u).localeCompare(String(y._valores.precio_u), 'es', { numeric: true })
    || String(x._valores.descripcion).localeCompare(String(y._valores.descripcion))
    || (x._filaExcel || 0) - (y._filaExcel || 0);
  [...sinPareja].sort(ordenEstable).forEach((f) => {
    resultado.push({ fila: f, id: nuevoId(f._grupo), guardado: false, movidaDe: movidas.get(f), ambigua: ambiguas.get(f) });
  });

  // 5) Clasificación final.
  resultado.forEach(({ fila, id, guardado, movidaDe, ambigua }) => {
    plan.filas.push({ ...fila, id });
    const base = { id, filaExcel: fila._filaExcel };
    if (guardado) {
      const { cambios, noSobrescritos, combinados, ocAntes } = diferenciasFila(fila, fila._valores, snapshot[id].v);
      noSobrescritos.forEach(n => plan.noSobrescritos.push({ ...base, ...n }));
      const campos = Object.keys(cambios);
      if (campos.length === 0) { plan.sinCambios++; return; }
      plan.actualizadas.push({ id, fila, cambios, combinados, campos });
      if (ocAntes !== null && 'oc' in cambios) {
        plan.ocCambiadas.push({
          ...base, admision: String(fila.admision), fecha: fechaISO(fila.fecha_cx), proveedor: fila.proveedor,
          codigo: fila.codigo, ocAntes, ocDespues: fila._valores.oc
        });
      }
      return;
    }
    if (movidaDe) {
      const anterior = snapshot[movidaDe];
      const { noSobrescritos, combinados, ocAntes } = diferenciasFila(fila, fila._valores, anterior.v);
      noSobrescritos.forEach(n => plan.noSobrescritos.push({ ...base, ...n }));
      plan.fechasCambiadas.push({ idAntes: movidaDe, idNuevo: id, fila, combinados, fechaAntes: anterior.f, fechaDespues: fechaISO(fila.fecha_cx), filaExcel: fila._filaExcel });
      plan.idsFueraDelIndice.push(movidaDe);
      if (ocAntes !== null && combinados.oc !== ocAntes) {
        plan.ocCambiadas.push({ ...base, admision: anterior.a, fecha: anterior.f, proveedor: anterior.p, codigo: fila.codigo, ocAntes, ocDespues: combinados.oc });
      }
      return;
    }
    if (ambigua) {
      plan.fechasAmbiguas.push({ ...base, fecha: fechaISO(fila.fecha_cx), candidatos: ambigua.map(c => ({ id: c, fecha: snapshot[c].f })) });
    }
    plan.nuevas.push({ id, fila, valores: fila._valores });
  });

  // 6) Guardadas que no vinieron (solo en los meses que cubre el archivo).
  // Nunca se borran; las de un grupo que sí viene salen del índice de OC.
  const gruposPresentes = new Set(porGrupo.keys());
  noVinieron.filter(id => !idsMovidos.has(id)).forEach((id) => {
    const e = snapshot[id];
    if (!meses.has(String(e.f).slice(0, 7))) return;
    const enGrupoPresente = gruposPresentes.has(e.g);
    plan.yaNoVienen.push({ id, admision: e.a, fecha: e.f, proveedor: e.p, codigo: e.v.codigo, enGrupoPresente });
    if (enGrupoPresente) plan.idsFueraDelIndice.push(id);
  });

  // Sin el campo de trabajo interno.
  plan.filas = plan.filas.map(({ _valores, ...f }) => f); // eslint-disable-line no-unused-vars
  return plan;
};
