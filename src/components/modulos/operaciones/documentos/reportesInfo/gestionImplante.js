// Reporte Info → columna "Gestión implante": la marca de cada admisión
// (admisiones_gestionadas_implantes, la mantiene functions/admisiones). Se
// lee solo para las admisiones del mes en pantalla, en lotes de 30.
// Columna "Gestión consignación": la misma marca para Consignación
// (admisiones_gestionadas_consignacion), con los mismos estados.
import { collection, doc, documentId, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';
import {
  COLECCION_ADMISIONES, COLECCION_ADMISIONES_CONSIGNACION, ESTADOS_ADMISION, ETIQUETAS_ESTADO, rutaDeClave, resumenGestion, agregarAdmision,
} from '../../../../../../functions/admisiones/nucleo.mjs';

export { ESTADOS_ADMISION, ETIQUETAS_ESTADO, COLECCION_ADMISIONES_CONSIGNACION };
export const OPCIONES_GESTION = [ESTADOS_ADMISION.PENDIENTE, ESTADOS_ADMISION.GESTIONADA, ESTADOS_ADMISION.CARGADA, ESTADOS_ADMISION.IMPUTADA];

export const claveAdmision = (valor) => {
  const n = Number(String(valor ?? '').trim());
  return Number.isFinite(n) && n > 0 ? String(n) : null;
};

// { [admisión]: marca } de las admisiones dadas (las que no tienen marca no
// aparecen: están "Pendiente"). `coleccion`: la de Implantes por defecto.
export const cargarMarcas = async (admisiones, coleccion = COLECCION_ADMISIONES) => {
  const ids = [...new Set(admisiones.map(claveAdmision).filter(Boolean))];
  const marcas = {};
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await getDocs(query(collection(db, coleccion), where(documentId(), 'in', ids.slice(i, i + 30))));
    snap.docs.forEach((d) => { marcas[d.id] = d.data(); });
  }
  return marcas;
};

export const estadoDe = (marca) => marca?.estado || ESTADOS_ADMISION.PENDIENTE;

const fecha = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

export const tooltipMarca = (marca) => {
  if (!marca) return 'Sin gestión en Implantes';
  const partes = [`${marca.cantidad} gestión(es) en Implantes`];
  if (marca.primeraFechaGestion) partes.push(`desde ${fecha(marca.primeraFechaGestion)}`);
  if (marca.estado === ESTADOS_ADMISION.GESTIONADA) partes.push(`faltan ${marca.itemsPendientes} ítem(s) por cargar`);
  if (marca.estado === ESTADOS_ADMISION.CARGADA) partes.push('todos los ítems cargados');
  if (marca.estado === ESTADOS_ADMISION.IMPUTADA) partes.push(marca.itemsPendientes ? `imputada · ${marca.itemsPendientes} ítem(s) sin cargar` : 'imputada');
  return partes.join(' · ');
};

// En Consignación cada registro es una carga (un ítem).
export const tooltipMarcaConsignacion = (marca) => {
  if (!marca) return 'Sin registros en Consignación';
  const partes = [`${marca.cantidad} carga(s) en Consignación`];
  if (marca.primeraFechaGestion) partes.push(`desde ${fecha(marca.primeraFechaGestion)}`);
  if (marca.estado === ESTADOS_ADMISION.GESTIONADA) partes.push(`faltan ${marca.itemsPendientes} carga(s) por marcar CARGADO`);
  if (marca.estado === ESTADOS_ADMISION.CARGADA) partes.push('todas las cargas en CARGADO');
  if (marca.estado === ESTADOS_ADMISION.IMPUTADA) partes.push(marca.itemsPendientes ? `imputada · ${marca.itemsPendientes} carga(s) sin cargar` : 'imputada');
  return partes.join(' · ');
};

// Colores del badge: Pendiente (gris), Gestionada (azul), Cargada (verde),
// Imputada (verde oscuro).
export const CLASE_GESTION = {
  [ESTADOS_ADMISION.PENDIENTE]: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600',
  [ESTADOS_ADMISION.GESTIONADA]: 'bg-blue-100 text-[#1d6fa5] border-blue-300 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
  [ESTADOS_ADMISION.CARGADA]: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  [ESTADOS_ADMISION.IMPUTADA]: 'bg-emerald-700 text-white border-emerald-800 dark:bg-emerald-800 dark:text-emerald-50 dark:border-emerald-700',
};

// Detalle de la gestión dentro de Reporte Info: se lee solo al abrirlo. La
// marca de la admisión trae la ruta de cada gestión (1 lectura) y cada
// gestión se lee por su ruta (1 lectura cada una), sin consultas.
// Devuelve { marca, gestiones: [{ refPath, datos | null }] }; marca null si
// la admisión ya no tiene gestión.
export const cargarDetalleAdmision = async (admision) => {
  const snapMarca = await getDoc(doc(db, COLECCION_ADMISIONES, String(admision)));
  if (!snapMarca.exists()) return { marca: null, gestiones: [] };
  const marca = snapMarca.data();
  const rutas = Object.keys(marca.gestiones || {}).map(rutaDeClave);
  const snaps = await Promise.all(rutas.map((r) => getDoc(doc(db, r))));
  const gestiones = snaps
    .map((snap, i) => ({ refPath: rutas[i], datos: snap.exists() ? snap.data() : null }))
    .sort((a, b) => String(a.datos?.fecha ?? '').localeCompare(String(b.datos?.fecha ?? '')));
  return { marca, gestiones };
};

// Estado de UNA gestión (pestañas del detalle) y su resumen de carga.
export const estadoGestion = (datos) => agregarAdmision({ g: resumenGestion(datos) }).estado;
export const resumenCarga = (datos) => {
  const r = resumenGestion(datos);
  const monto = (datos?.cotizaciones || [])
    .flatMap((c) => c.items || [])
    .reduce((t, it) => t + (Number(it.totalItem) || 0), 0);
  return { total: r.items, cargados: r.items - r.pendientes, pendientes: r.pendientes, monto, imputada: r.imputada };
};
