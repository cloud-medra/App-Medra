// Índice de OC (lógica pura, sin Firebase): se arma al importar el Excel de
// "Importar Detalles OC" y se usa en Gestión de Implantes para asignar la OC
// a cada ítem.
//
// Forma del índice guardado: { [idFilaExcel]: { k, q, e, oc, p } }
//   k  = clave de cruce 'admisión|fecha|código' (ya normalizada)
//   q  = cantidad de la fila (se compara aparte: ver cruzarCodigoOC)
//   e  = proveedor tal cual viene en el Excel
//   oc = número de OC
//   p  = paciente (solo informativo / desempate)
// Se indexa por id de fila para que reimportar el mismo Excel reemplace las
// filas en vez de duplicarlas. La empresa NO va en la clave: se compara
// aparte con empresasCoinciden() porque puede venir escrita distinto.
import {
  normalizarAdmision, normalizarFecha, normalizarCodigo, normalizarCantidad,
  empresasCoinciden, palabrasEnComun
} from './normalizacionOC.js';

// Versión del formato del archivo del índice. Un índice guardado con otro
// formato se descarta y se rearma con la siguiente importación.
export const FORMATO_INDICE_OC = 2;

export const claveCruceOC = ({ admision, fecha, codigo }) => {
  const a = normalizarAdmision(admision);
  const f = normalizarFecha(fecha);
  const c = normalizarCodigo(codigo);
  if (!a || !f || !c) return null;
  return `${a}|${f}|${c}`;
};

// Fila normalizada del Excel (parsearFilaDetalleOC) -> entrada del índice.
// Devuelve { entrada } o { motivo } si la fila no sirve para el cruce.
export const entradaIndiceDesdeFila = (fila) => {
  const oc = String(fila.oc ?? '').trim();
  if (!oc) return { motivo: 'SIN_OC' };
  const k = claveCruceOC({ admision: fila.admision, fecha: fila.fecha_cx, codigo: fila.codigo });
  const q = normalizarCantidad(fila.cantidad);
  if (!k || q === null) return { motivo: 'INCOMPLETA' };
  return { entrada: { k, q, e: String(fila.proveedor ?? '').trim(), oc, p: String(fila.paciente ?? '').trim() } };
};

// Mezcla las filas de una importación sobre el índice anterior. Una fila
// que ahora viene sin OC (o mal formada) sale del índice, igual que los
// `idsAEliminar` (filas que ya no vienen en el archivo).
export const mezclarIndiceOC = (anterior, filas, idsAEliminar = []) => {
  const indice = { ...(anterior || {}) };
  const stats = { conOC: 0, sinOC: 0, incompletas: 0, cambios: 0, eliminadas: 0 };
  for (const id of idsAEliminar) {
    if (indice[id]) { delete indice[id]; stats.cambios++; stats.eliminadas++; }
  }
  for (const fila of filas) {
    if (!fila?.id) continue;
    const { entrada, motivo } = entradaIndiceDesdeFila(fila);
    const previa = indice[fila.id];
    if (entrada) {
      stats.conOC++;
      if (!previa || previa.k !== entrada.k || previa.q !== entrada.q || previa.e !== entrada.e || previa.oc !== entrada.oc || previa.p !== entrada.p) {
        indice[fila.id] = entrada;
        stats.cambios++;
      }
    } else {
      if (motivo === 'SIN_OC') stats.sinOC++; else stats.incompletas++;
      if (previa) { delete indice[fila.id]; stats.cambios++; }
    }
  }
  return { indice, stats };
};

export const rangoFechasIndiceOC = (indice) => {
  let min = ''; let max = '';
  Object.values(indice || {}).forEach(({ k }) => {
    const f = k.split('|')[1];
    if (!min || f < min) min = f;
    if (!max || f > max) max = f;
  });
  return { fechaMin: min, fechaMax: max };
};

// Meses ('YYYY-MM') que tienen OC en el índice, del más reciente al más
// antiguo. Se publican en ocImport/meta para armar los selectores de período
// con 1 lectura, sin descargar el índice.
export const periodosIndiceOC = (indice) => {
  const set = new Set();
  Object.values(indice || {}).forEach(({ k }) => {
    const m = String(k || '').split('|')[1]?.match(/^(\d{4})-(\d{2})/);
    if (m) set.add(`${m[1]}-${m[2]}`);
  });
  return [...set].sort().reverse();
};

// Map clave -> [{ e, oc, p }] para búsquedas O(1) durante el cruce.
export const agruparIndiceOC = (indice) => {
  const mapa = new Map();
  Object.values(indice || {}).forEach((entrada) => {
    if (!mapa.has(entrada.k)) mapa.set(entrada.k, []);
    mapa.get(entrada.k).push(entrada);
  });
  return mapa;
};

const ocsUnicas = (entradas) => [...new Set(entradas.map(e => e.oc))];

const sumar = (valores) => valores.reduce((acc, v) => acc + (normalizarCantidad(v) ?? 0), 0);

// Cruza UN código de una gestión (todos sus ítems con ese código a la vez:
// el mismo implante puede venir en varias filas, en Implantes y en el Excel).
//   cantidadesImplantes: cantidades de TODOS los ítems con ese código en la
//     gestión; cantidadesPendientes: las de los ítems que aún no tienen OC.
// La cantidad calza si la suma del Excel (filas de esa empresa) es igual a
// la suma de Implantes, o si cada ítem pendiente tiene una fila del Excel
// con su misma cantidad.
// Resultado:
//   { tipo: 'ASIGNADA', oc, revisarNombre, pacienteExcel }
//   { tipo: 'SIN_COINCIDENCIA' }
//   { tipo: 'EMPRESA_NO_RECONOCIDA', empresasExcel }
//   { tipo: 'CANTIDAD_DISTINTA', cantidadExcel, cantidadImplantes }
//   { tipo: 'AMBIGUA', ocs }
export const cruzarCodigoOC = ({ clave, empresa, nombre, cantidadesImplantes = [], cantidadesPendientes = cantidadesImplantes }, mapa) => {
  const candidatos = (clave && mapa.get(clave)) || [];
  if (candidatos.length === 0) return { tipo: 'SIN_COINCIDENCIA' };

  const deLaEmpresa = candidatos.filter(c => empresasCoinciden(c.e, empresa));
  if (deLaEmpresa.length === 0) {
    return { tipo: 'EMPRESA_NO_RECONOCIDA', empresasExcel: [...new Set(candidatos.map(c => c.e))] };
  }

  let elegidas = deLaEmpresa;
  if (ocsUnicas(elegidas).length > 1) {
    // Desempate por nombre: las filas con más palabras en común con el paciente.
    const puntajes = elegidas.map(c => palabrasEnComun(nombre, c.p));
    const mejor = Math.max(...puntajes);
    if (mejor > 0) elegidas = elegidas.filter((_, i) => puntajes[i] === mejor);
    if (ocsUnicas(elegidas).length > 1) return { tipo: 'AMBIGUA', ocs: ocsUnicas(deLaEmpresa) };
  }

  const cantidadExcel = sumar(deLaEmpresa.map(c => c.q));
  const cantidadImplantes = sumar(cantidadesImplantes);
  const cantidadesExcel = deLaEmpresa.map(c => c.q);
  const calzaSuma = cantidadExcel === cantidadImplantes;
  const calzaPorItem = cantidadesPendientes.every(q => cantidadesExcel.includes(normalizarCantidad(q)));
  if (!calzaSuma && !calzaPorItem) return { tipo: 'CANTIDAD_DISTINTA', cantidadExcel, cantidadImplantes };

  const oc = elegidas[0].oc;
  const conEsaOC = elegidas.filter(c => c.oc === oc);
  const revisarNombre = !conEsaOC.some(c => palabrasEnComun(nombre, c.p) > 0);
  return { tipo: 'ASIGNADA', oc, revisarNombre, pacienteExcel: conEsaOC[0].p };
};

export const itemsDeGestion = (gestion) => gestion?.cotizaciones?.[0]?.items || [];

// Un ítem necesita OC si tiene código (los "SIN CÓDIGO" no pueden cruzar).
export const itemRequiereOC = (item) => !item?.sinCodigo && Boolean(normalizarCodigo(item?.codigo));

export const calcularOcPendiente = (items, ocPorItem = {}) =>
  (items || []).some(it => itemRequiereOC(it) && !ocPorItem?.[it.id]);

// OC distintas de una gestión (en el orden de sus ítems).
export const ocsDeGestion = (gestion) => {
  const ocPorItem = gestion?.ocPorItem || {};
  const lista = itemsDeGestion(gestion).map(it => ocPorItem[it.id]).filter(Boolean);
  return [...new Set(lista)];
};

// Cruza un lote de gestiones (docs con ocPendiente == true) contra el índice
// agrupado. No escribe nada: devuelve qué escribir y el detalle para el
// resumen.
//   actualizaciones: [{ refPath, asignaciones: {itemId: oc}, ocPendiente }]
//   detalle: filas para el resumen (no asignadas y "revisar nombre")
export const cruzarGestionesOC = (gestiones, mapa) => {
  const actualizaciones = [];
  const detalle = [];
  const contadores = { asignadas: 0, sinCoincidencia: 0, empresaNoReconocida: 0, cantidadDistinta: 0, ambiguas: 0, revisarNombre: 0 };

  for (const g of gestiones) {
    const items = itemsDeGestion(g);
    const ocPorItem = g.ocPorItem || {};
    const asignaciones = {};
    const admision = g.gestionId || g.agendaId || g.admision;

    // Ítems agrupados por código: los repetidos del mismo código reciben
    // todos la misma OC (y sus cantidades se suman para comparar).
    const porCodigo = new Map();
    items.filter(itemRequiereOC).forEach((it) => {
      const codigo = normalizarCodigo(it.codigo);
      if (!porCodigo.has(codigo)) porCodigo.set(codigo, []);
      porCodigo.get(codigo).push(it);
    });

    for (const [codigo, itemsCodigo] of porCodigo) {
      const pendientes = itemsCodigo.filter(it => !ocPorItem[it.id]);
      if (pendientes.length === 0) continue;
      const r = cruzarCodigoOC({
        clave: claveCruceOC({ admision, fecha: g.fecha, codigo }),
        empresa: g.empresa,
        nombre: g.nombre,
        cantidadesImplantes: itemsCodigo.map(it => it.cantidad),
        cantidadesPendientes: pendientes.map(it => it.cantidad)
      }, mapa);

      for (const it of pendientes) {
        const base = {
          refPath: g.refPath, admision, nombre: g.nombre, fecha: g.fecha, empresa: g.empresa,
          codigo: it.codigo, cantidad: it.cantidad, tipo: r.tipo
        };
        if (r.tipo === 'ASIGNADA') {
          asignaciones[it.id] = r.oc;
          contadores.asignadas++;
          if (r.revisarNombre) {
            contadores.revisarNombre++;
            detalle.push({ ...base, tipo: 'REVISAR_NOMBRE', oc: r.oc, pacienteExcel: r.pacienteExcel });
          }
        } else if (r.tipo === 'SIN_COINCIDENCIA') {
          contadores.sinCoincidencia++;
          detalle.push(base);
        } else if (r.tipo === 'EMPRESA_NO_RECONOCIDA') {
          contadores.empresaNoReconocida++;
          detalle.push({ ...base, empresasExcel: r.empresasExcel });
        } else if (r.tipo === 'CANTIDAD_DISTINTA') {
          contadores.cantidadDistinta++;
          detalle.push({ ...base, cantidadExcel: r.cantidadExcel, cantidadImplantes: r.cantidadImplantes });
        } else {
          contadores.ambiguas++;
          detalle.push({ ...base, ocs: r.ocs });
        }
      }
    }

    const ocPendiente = calcularOcPendiente(items, { ...ocPorItem, ...asignaciones });
    // Se escribe si hubo OC nuevas, o si el flag quedó desactualizado
    // (ya no tiene ítems pendientes) para que deje de salir en la consulta.
    if (Object.keys(asignaciones).length > 0 || !ocPendiente) {
      actualizaciones.push({ refPath: g.refPath, asignaciones, ocPendiente });
    }
  }

  return { actualizaciones, detalle, contadores };
};

// Texto de la columna ORDEN: OC distintas separadas por coma ('' si no hay).
export const textoOCs = (ocs) => [...new Set((ocs || []).filter(Boolean))].join(', ');

// ---------------------------------------------------------------------------
// Consignación: cada documento de consignacion_registros es UN ítem y la OC
// va en su campo `orden`. Para cruzar con la MISMA lógica que Implantes, los
// registros se agrupan por admisión + fecha + empresa (lo que en Implantes es
// una gestión) en "gestiones virtuales" cuyo id de ítem es la ruta del
// registro; cruzarGestionesOC hace el resto.
// ---------------------------------------------------------------------------
const claveGrupoConsignacion = (r) =>
  `${normalizarAdmision(r.gestionId)}|${normalizarFecha(r.fecha)}|${String(r.empresa ?? '').trim().toUpperCase()}`;

export const gestionesDesdeRegistrosConsignacion = (registros) => {
  const grupos = new Map();
  (registros || []).forEach((r) => {
    const clave = claveGrupoConsignacion(r);
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        refPath: r.refPath, gestionId: r.gestionId, fecha: r.fecha, empresa: r.empresa, nombre: r.nombre,
        cotizaciones: [{ items: [] }], ocPorItem: {}
      });
    }
    const g = grupos.get(clave);
    g.cotizaciones[0].items.push({ id: r.refPath, codigo: r.codigo, cantidad: r.cantidad });
    const orden = String(r.orden ?? '').trim();
    if (orden) g.ocPorItem[r.refPath] = orden;
  });
  return [...grupos.values()];
};

// Cruza registros de Consignación (los que aún no tienen `orden`) contra el
// índice agrupado. No escribe nada.
//   asignaciones: [{ refPath, oc }] (una por registro que obtuvo OC)
export const cruzarRegistrosConsignacionOC = (registros, mapa) => {
  const { actualizaciones, detalle, contadores } = cruzarGestionesOC(gestionesDesdeRegistrosConsignacion(registros), mapa);
  const asignaciones = actualizaciones.flatMap(a => Object.entries(a.asignaciones).map(([refPath, oc]) => ({ refPath, oc })));
  return { asignaciones, detalle, contadores };
};

// OC distintas por empresa + fecha de una admisión de Consignación (pestaña
// Orden). Devuelve { bloques: [{ uniqueKey, empresa, fecha }], ocsPorBloque }.
export const bloquesOCConsignacion = (registros) => {
  const grupos = new Map();
  (registros || []).forEach((r) => {
    const clave = claveGrupoConsignacion(r);
    if (!grupos.has(clave)) grupos.set(clave, { bloque: { uniqueKey: clave, empresa: r.empresa, fecha: r.fecha }, ocs: [] });
    const orden = String(r.orden ?? '').trim();
    if (orden) grupos.get(clave).ocs.push(orden);
  });
  const lista = [...grupos.values()].sort((a, b) => String(a.bloque.fecha).localeCompare(String(b.bloque.fecha)));
  return { bloques: lista.map(g => g.bloque), ocsPorBloque: lista.map(g => [...new Set(g.ocs)]) };
};
