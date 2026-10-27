// Admisiones gestionadas en Implantes (marca para Reporte Info).
//
// Lo usan el trigger y el script (functions/admisiones) y la pantalla de
// Reporte Info, así calculan el estado igual. Sin dependencias.
//
// admisiones_gestionadas_implantes/{admisión}: una entrada por número de
// admisión con un resumen de cada gestión (documento de
// implantes_gestiones/…/detalles) y el estado agregado:
//   pendiente  (sin documento)  → sin gestión
//   gestionada                  → tiene gestión, faltan ítems por cargar
//   cargada                     → todos los ítems en "CARGADO"
//   imputada                    → algún bloque solicitado / imputado
//
// admisiones_gestionadas_consignacion/{admisión}: lo mismo para
// Consignación, con un resumen por registro (consignacion_registros/…/
// detalles, una carga = un ítem): cargada si todas están en "CARGADO",
// imputada si alguna está "SOLICITADO".

export const COLECCION_ADMISIONES = 'admisiones_gestionadas_implantes';
export const COLECCION_ADMISIONES_CONSIGNACION = 'admisiones_gestionadas_consignacion';

export const ESTADOS_ADMISION = Object.freeze({
  PENDIENTE: 'pendiente',
  GESTIONADA: 'gestionada',
  CARGADA: 'cargada',
  IMPUTADA: 'imputada',
});
export const ETIQUETAS_ESTADO = Object.freeze({
  pendiente: 'Pendiente', gestionada: 'Gestionada', cargada: 'Cargada', imputada: 'Imputada',
});

// Número de admisión de una gestión (solo dígitos; 'P', vacío,
// 'SIN_ADMISION' o códigos provisorios → null).
export const admisionDe = (gestion) => {
  const id = String(gestion?.gestionId ?? gestion?.agendaId ?? '').trim();
  return /^\d+$/.test(id) ? String(Number(id)) : null;
};

// Ítems de carga de una gestión: los de sus cotizaciones, sin el contenido
// de un PAD (va con estado "PAD", no se carga aparte).
const itemsDeCarga = (gestion) => (gestion?.cotizaciones || [])
  .flatMap((c) => c?.items || [])
  .filter((it) => it && !it.padPadreId);

// Resumen de UNA gestión (lo que se guarda por documento).
export const resumenGestion = (gestion) => {
  const items = itemsDeCarga(gestion);
  return {
    items: items.length,
    pendientes: items.filter((it) => (it.estadoCarga || 'PENDIENTE') !== 'CARGADO').length,
    imputada: String(gestion?.solicitud || '').toUpperCase() === 'SOLICITADO',
    fecha: gestion?.fecha || null,
  };
};

// Resumen de UN registro de Consignación (mismos campos que resumenGestion,
// así agregarAdmision calcula el estado igual). Un registro SOLICITADO ya
// estuvo cargado: no cuenta como pendiente.
export const resumenRegistroConsignacion = (registro) => {
  const estado = String(registro?.estado || '').toUpperCase();
  return {
    items: 1,
    pendientes: estado === 'CARGADO' || estado === 'SOLICITADO' ? 0 : 1,
    imputada: estado === 'SOLICITADO',
    fecha: registro?.fecha || null,
  };
};

// Cada módulo con marca por admisión: colección de la marca, colección
// origen (sus documentos `detalles`) y cómo se resume cada documento.
export const MARCAS_ADMISION = Object.freeze({
  implantes: { coleccion: COLECCION_ADMISIONES, origen: 'implantes_gestiones', resumen: resumenGestion },
  consignacion: { coleccion: COLECCION_ADMISIONES_CONSIGNACION, origen: 'consignacion_registros', resumen: resumenRegistroConsignacion },
});

// Estado agregado de la admisión a partir de los resúmenes de sus gestiones
// ({ clave: resumen }).
export const agregarAdmision = (gestiones) => {
  const lista = Object.values(gestiones || {});
  const totalItems = lista.reduce((t, g) => t + (g.items || 0), 0);
  const itemsPendientes = lista.reduce((t, g) => t + (g.pendientes || 0), 0);
  const imputada = lista.some((g) => g.imputada);
  const todosCargados = totalItems > 0 && itemsPendientes === 0;
  const estado = lista.length === 0 ? ESTADOS_ADMISION.PENDIENTE
    : imputada ? ESTADOS_ADMISION.IMPUTADA
      : todosCargados ? ESTADOS_ADMISION.CARGADA
        : ESTADOS_ADMISION.GESTIONADA;
  const fechas = lista.map((g) => g.fecha).filter(Boolean).sort();
  return { estado, cantidad: lista.length, totalItems, itemsPendientes, todosCargados, imputada, primeraFechaGestion: fechas[0] || null };
};

// Clave de una gestión dentro del mapa (la ruta del documento, sin "/").
export const claveGestion = (ruta) => String(ruta).replace(/\//g, '|');
export const rutaDeClave = (clave) => String(clave).replace(/\|/g, '/');
