import { collection, doc, writeBatch, runTransaction } from 'firebase/firestore';
import { construirLogConsignacion } from './registrarLogConsignacion';

// =====================================================================
// Lógica compartida de Registro de Consignación: mapeo de Datos
// Vinculados (ReportesInfo) y del maestro (maestros_codigos), validación,
// estructura del documento y escritura en consignacion_registros. La usan
// RegistroConsignacion (registro individual) y CargaMasivaConsignacion
// (registro masivo desde Excel), para que ambos guarden exactamente lo
// mismo.
// =====================================================================

export const COL_BASE = 'consignacion_registros';
export const NOMBRE_SUBCOL_DETALLES = 'detalles';
export const CENTRO_FIJO = 'PABELLON';
export const ESTADO_FIJO = 'INGRESADO';
// Edición del registro: SOLO en estado INGRESADO. La regla es en positivo
// (no una lista de estados excluidos) para que cualquier estado posterior
// —CARGADO, SOLICITADO o uno nuevo— quede bloqueado por defecto. Sin
// estado se trata como INGRESADO, igual que el badge de la tabla.
export const estadoRegistro = (registro) => String(registro?.estado || ESTADO_FIJO).trim().toUpperCase();
export const esRegistroEditable = (registro) => estadoRegistro(registro) === ESTADO_FIJO;
export const mensajeRegistroNoEditable = (registro) =>
  `Solo se pueden editar registros en estado ${ESTADO_FIJO}. Este registro está ${estadoRegistro(registro)}.`;

export class RegistroNoEditableError extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'RegistroNoEditableError';
  }
}

// N° de orden (columna ORDEN de Registro). `ordenOrigen`: 'oc' si lo
// escribió Sincronizar OC (queda bloqueado, también en firestore.rules),
// 'manual' si se escribió en la celda; '' o sin el campo = vacío o anterior
// a este campo (ver functions/scripts/marcarOrdenOrigenConsignacion.js).
export const ORDEN_ORIGEN_OC = 'oc';
export const ORDEN_ORIGEN_MANUAL = 'manual';
export const esOrdenSincronizada = (registro) => registro?.ordenOrigen === ORDEN_ORIGEN_OC;

// Orden escrita a mano: solo números; varias, separadas por coma. Se guarda
// normalizada como "123, 456" (el formato que exige firestore.rules).
// Devuelve { ok: true, valor } o { ok: false, error }.
export const normalizarOrdenManual = (texto) => {
  const limpio = String(texto ?? '').trim();
  if (!limpio) return { ok: true, valor: '' };
  const partes = limpio.split(',').map(p => p.trim());
  if (partes.some(p => !/^\d+$/.test(p))) {
    return { ok: false, error: 'La orden solo admite números; si son varias, sepáralas con coma (ej: 12345, 12356).' };
  }
  return { ok: true, valor: [...new Set(partes)].join(', ') };
};

// Campos a escribir al guardar una orden a mano (ya normalizada).
export const camposOrdenManual = (valor) => ({ orden: valor, ordenOrigen: valor ? ORDEN_ORIGEN_MANUAL : '' });

// Órdenes de un registro como lista (una orden manual puede traer varias).
export const ordenesDeRegistro = (registro) =>
  [...new Set(String(registro?.orden ?? '').split(',').map(p => p.trim()).filter(Boolean))];

export const TIPOS_CONSIGNACION = ['CONSIGNACION', 'COTIZACION'];
export const MAX_ESCRITURAS_BATCH = 500;

const NOMBRES_MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

// 'YYYY-MM-DD' -> claves de carpeta { anio, nombreMes, dia }.
export const descomponerFecha = (fechaStr) => {
  if (!fechaStr || !fechaStr.includes('-')) return null;
  const [yyyy, mm, dd] = fechaStr.split('-');
  if (!yyyy || !mm || !dd) return null;

  const mesIndex = parseInt(mm, 10) - 1;
  const nombreMes = NOMBRES_MESES[mesIndex];
  if (!nombreMes) return null;

  return { anio: yyyy, nombreMes, dia: dd };
};

// Datos Vinculados: registro de ReportesInfo encontrado por Admisión
// (buscarReporteInfoPorAdmisionCacheado) -> campos del documento.
export const mapearDatosVinculados = (datosReporte) => ({
  convenio: datosReporte?.['Convenio'] || '',
  prevision: datosReporte?.['Isapre'] || '',
  descripcionPabellon: datosReporte?.['Descripción'] || ''
});

// Descripción del producto: siempre descriptorAuto (texto completo).
// descriptorEmpresa es un texto abreviado y solo se usa si el ítem no
// tiene descriptorAuto.
export const descripcionDesdeMaestro = (item) =>
  item?.descriptorAuto || item?.descriptorEmpresa || '';

// Ítem de maestros_codigos -> campos del documento.
export const mapearItemMaestro = (item) => ({
  referencia: item?.referencia || '',
  codigo: item?.codigo || '',
  costo: item?.precioNeto ?? '',
  descripcion: descripcionDesdeMaestro(item),
  empresa: item?.empresa || ''
});

const normalizarClave = (valor) => String(valor ?? '').trim().toUpperCase();

// Busca en el maestro (ya filtrado por tipo, ver obtenerCodigosCacheados)
// el ítem con ese Código interno o, si no hay, con esa Referencia exacta
// (sin distinguir mayúsculas). Devuelve el ítem o null.
export const buscarItemMaestro = (codigos, { codigo, referencia } = {}) => {
  const lista = codigos || [];
  const cod = normalizarClave(codigo);
  if (cod) {
    const porCodigo = lista.find((item) => normalizarClave(item.codigo) === cod);
    if (porCodigo) return porCodigo;
  }
  const ref = normalizarClave(referencia);
  if (ref) {
    const porReferencia = lista.find((item) => normalizarClave(item.referencia) === ref);
    if (porReferencia) return porReferencia;
  }
  return null;
};

// Campos obligatorios de un registro. Devuelve { campo: true } por cada
// campo con problema (vacío si es válido).
export const validarRegistroConsignacion = (payload) => {
  const err = {};
  if (!payload.fecha || String(payload.fecha).trim() === '') err.fecha = true;
  if (!payload.referencia || String(payload.referencia).trim() === '') err.referencia = true;
  if (!payload.cantidad || Number(payload.cantidad) <= 0) err.cantidad = true;
  return err;
};

export const construirDatosDoc = (payload) => ({
  gestionId: payload.gestionId || '',
  nombre: payload.nombre || '',
  medico: payload.medico || '',
  fecha: payload.fecha || '',
  codigo: payload.codigo || '',
  referencia: payload.referencia || '',
  cantidad: Number(payload.cantidad) || 0,
  delivery: payload.delivery || '',
  empresa: payload.empresa || '',

  centro: payload.centro || CENTRO_FIJO,
  atributo: payload.atributo || payload.tipo || 'CONSIGNACION',
  estado: payload.estado || ESTADO_FIJO,
  costo: payload.costo !== '' && payload.costo !== undefined && payload.costo !== null ? Number(payload.costo) : 0,
  convenio: payload.convenio || '',
  prevision: payload.prevision || '',
  descripcion: payload.descripcion || '',
  descripcionPabellon: payload.descripcionPabellon || '',
  tipo: payload.tipo || 'CONSIGNACION'
});

// Documento completo de un registro NUEVO (campos de seguimiento en su
// valor inicial + usuario y fecha de registro).
export const construirNuevoRegistro = (datosDoc, userData, fechaRegistro = new Date()) => ({
  ...datosDoc,
  guias: '',
  orden: '',
  despachado: 'PENDIENTE',
  fechaRegistro,
  registradoPor: userData?.nombreCompleto || 'Usuario'
});

// Las carpetas año/mes/día se marcan con { active: 'true' } (3 escrituras).
export const ESCRITURAS_CARPETAS_FECHA = 3;
export const agregarCarpetasFecha = (batch, db, { anio, nombreMes, dia }) => {
  batch.set(doc(db, COL_BASE, anio), { active: 'true' }, { merge: true });
  batch.set(doc(db, COL_BASE, anio, 'mes', nombreMes), { active: 'true' }, { merge: true });
  batch.set(doc(db, COL_BASE, anio, 'mes', nombreMes, 'dia', dia), { active: 'true' }, { merge: true });
};

export const nuevaRefDetalle = (db, { anio, nombreMes, dia }) =>
  doc(collection(db, COL_BASE, anio, 'mes', nombreMes, 'dia', dia, NOMBRE_SUBCOL_DETALLES));

// Agrega al batch un registro nuevo + su log CREACION (2 escrituras; las
// carpetas de fecha van aparte con agregarCarpetasFecha).
export const ESCRITURAS_POR_REGISTRO = 2;
export const agregarRegistroNuevoABatch = (batch, db, claves, nuevoDoc, userData) => {
  const ref = nuevaRefDetalle(db, claves);
  batch.set(ref, nuevoDoc);
  batch.set(doc(collection(ref, 'logs')), construirLogConsignacion('CREACION', nuevoDoc, userData));
  return ref;
};

// Agrupa los payloads en bloques de como máximo `maxEscrituras` escrituras
// contando, por bloque, las carpetas de cada fecha distinta (3) y por cada
// registro el documento + su log (2). Devuelve [{ indices, fechas }].
export const planificarBloques = (payloads, maxEscrituras = MAX_ESCRITURAS_BATCH) => {
  const bloques = [];
  let actual = null;

  payloads.forEach((p, indice) => {
    const fecha = p.fecha;
    let costo = ESCRITURAS_POR_REGISTRO + (actual?.fechas.has(fecha) ? 0 : ESCRITURAS_CARPETAS_FECHA);
    if (!actual || actual.escrituras + costo > maxEscrituras) {
      actual = { indices: [], fechas: new Set(), escrituras: 0 };
      bloques.push(actual);
      costo = ESCRITURAS_POR_REGISTRO + ESCRITURAS_CARPETAS_FECHA;
    }
    actual.indices.push(indice);
    actual.fechas.add(fecha);
    actual.escrituras += costo;
  });

  return bloques.map(({ indices, fechas, escrituras }) => ({ indices, fechas: [...fechas], escrituras }));
};

// Guarda varios registros nuevos con writeBatch (bloques de <= 500
// escrituras). Cada payload pasa por las mismas validaciones y la misma
// estructura que el registro individual. Un bloque que falla no detiene
// los siguientes. Todos comparten `fechaRegistro` (identifica la carga) y
// cada uno guarda `posicionCarga` (su índice en `payloads`): el orden en
// que se ingresaron, para que Cargas los muestre igual (ordenarRegistrosCargas).
// Devuelve un arreglo paralelo a `payloads`: { ok, id?, error? }.
export const guardarRegistrosConsignacionEnLote = async (db, payloads, userData) => {
  const resultados = payloads.map(() => null);
  const validos = [];

  payloads.forEach((payload, i) => {
    const claves = descomponerFecha(payload.fecha);
    const err = validarRegistroConsignacion(payload);
    if (!claves || Object.keys(err).length > 0) {
      resultados[i] = { ok: false, error: 'Datos inválidos (fecha, referencia o cantidad)' };
      return;
    }
    validos.push({ indiceOriginal: i, payload, claves });
  });

  const bloques = planificarBloques(validos.map((v) => v.payload));
  const fechaRegistro = new Date();

  for (const bloque of bloques) {
    const batch = writeBatch(db);
    const fechasAgregadas = new Set();
    const escritos = [];

    bloque.indices.forEach((iValido) => {
      const { indiceOriginal, payload, claves } = validos[iValido];
      if (!fechasAgregadas.has(payload.fecha)) {
        agregarCarpetasFecha(batch, db, claves);
        fechasAgregadas.add(payload.fecha);
      }
      const nuevoDoc = { ...construirNuevoRegistro(construirDatosDoc(payload), userData, fechaRegistro), posicionCarga: indiceOriginal };
      const ref = agregarRegistroNuevoABatch(batch, db, claves, nuevoDoc, userData);
      escritos.push({ indiceOriginal, id: ref.id });
    });

    try {
      await batch.commit();
      escritos.forEach(({ indiceOriginal, id }) => { resultados[indiceOriginal] = { ok: true, id }; });
    } catch (error) {
      console.error('Error al guardar bloque de consignación:', error);
      escritos.forEach(({ indiceOriginal }) => {
        resultados[indiceOriginal] = { ok: false, error: error.message || 'Error al guardar' };
      });
    }
  }

  return resultados;
};

// Guarda la edición de un registro existente dentro de una transacción que
// relee el documento en Firestore y la rechaza (RegistroNoEditableError) si
// ya no está INGRESADO: cubre una pantalla desactualizada (otro usuario lo
// cargó/solicitó mientras tanto) o un intento de editar uno bloqueado
// saltándose el lápiz. Si cambia la fecha, el registro se mueve a la
// carpeta año/mes/día nueva (los campos de seguimiento se toman del doc
// releído, no de la copia de pantalla).
// Devuelve { ref, datos, movido }.
export const guardarEdicionRegistroConsignacion = (db, registro, datosDoc, clavesNuevas, userData) =>
  runTransaction(db, async (tx) => {
    const snap = await tx.get(registro.ref);
    if (!snap.exists()) {
      throw new RegistroNoEditableError('El registro ya no existe: fue eliminado o movido. Recarga la lista.');
    }
    const actual = snap.data();
    if (!esRegistroEditable(actual)) {
      throw new RegistroNoEditableError(mensajeRegistroNoEditable(actual));
    }

    const clavesAnteriores = descomponerFecha(actual.fecha);
    const seMovioDeCarpeta =
      !clavesAnteriores ||
      clavesAnteriores.anio !== clavesNuevas.anio ||
      clavesAnteriores.nombreMes !== clavesNuevas.nombreMes ||
      clavesAnteriores.dia !== clavesNuevas.dia;

    if (!seMovioDeCarpeta) {
      tx.update(registro.ref, datosDoc);
      return { ref: registro.ref, datos: datosDoc, movido: false };
    }

    agregarCarpetasFecha(tx, db, clavesNuevas);
    const nuevoRef = nuevaRefDetalle(db, clavesNuevas);
    const nuevoDoc = {
      ...datosDoc,
      guias: actual.guias || '',
      orden: actual.orden || '',
      // La orden sincronizada sigue bloqueada en la carpeta nueva.
      ...(actual.ordenOrigen ? { ordenOrigen: actual.ordenOrigen } : {}),
      ...(actual.ocActualizadoEn ? { ocActualizadoEn: actual.ocActualizadoEn } : {}),
      despachado: actual.despachado || 'PENDIENTE',
      fechaRegistro: actual.fechaRegistro || new Date(),
      // Sigue en el mismo lugar de su carga masiva (ver ordenarRegistrosCargas).
      ...(Number.isInteger(actual.posicionCarga) ? { posicionCarga: actual.posicionCarga } : {}),
      registradoPor: actual.registradoPor || userData?.nombreCompleto || 'Usuario'
    };
    tx.set(nuevoRef, nuevoDoc);
    tx.delete(registro.ref);
    return { ref: nuevoRef, datos: nuevoDoc, movido: true };
  });
