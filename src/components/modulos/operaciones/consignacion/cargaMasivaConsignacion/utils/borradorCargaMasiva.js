// =====================================================================
// Borrador de Carga Masiva en el navegador (localStorage), para no perder
// lo pegado si se sale de la pantalla o se recarga: 0 lecturas/escrituras
// de Firestore.
// - Una clave por usuario (otro usuario en el mismo navegador no lo ve).
// - Vence a los 2 días: trae nombres de pacientes y médicos.
// - Se borra al guardar todo, al descartarlo, con "Limpiar todo" y al
//   cerrar sesión (borrarTodosLosBorradoresCargaMasiva, en handleLogout).
// - Solo se guardan los valores ingresados, no el resultado de "Cargar":
//   al volver siempre se revalida.
// =====================================================================
import { CLAVES_INGRESO, crearFilaVacia, filaEstaVacia } from './grillaPortapapeles';

export const PREFIJO_BORRADOR = 'consignacion.cargaMasiva.borrador:';
export const VIGENCIA_BORRADOR_MS = 2 * 24 * 60 * 60 * 1000;
const VERSION = 1;

export const claveBorrador = (uid) => `${PREFIJO_BORRADOR}${uid}`;

const borrarClave = (clave) => { try { localStorage.removeItem(clave); } catch { /* sin storage */ } };

// Guarda tipo + filas con datos (en su orden). Sin uid no guarda nada.
export const guardarBorrador = (uid, { tipo, filas }, ahora = Date.now()) => {
  if (!uid) return false;
  const conDatos = filas.filter((f) => !filaEstaVacia(f)).map((f) => f.valores);
  if (conDatos.length === 0) {
    borrarClave(claveBorrador(uid));
    return false;
  }
  try {
    localStorage.setItem(claveBorrador(uid), JSON.stringify({ v: VERSION, tipo, filas: conDatos, guardadoEn: ahora }));
    return true;
  } catch {
    return false; // sin storage o lleno: se sigue trabajando sin borrador
  }
};

// { tipo, valores: [{ admision, ... }], guardadoEn } o null (no hay,
// vencido —se borra— o con otro formato).
export const leerBorrador = (uid, ahora = Date.now()) => {
  if (!uid) return null;
  const clave = claveBorrador(uid);
  let datos;
  try { datos = JSON.parse(localStorage.getItem(clave) || 'null'); } catch { datos = null; }
  const valido = datos && datos.v === VERSION && Array.isArray(datos.filas) && typeof datos.guardadoEn === 'number';
  if (!valido || ahora - datos.guardadoEn > VIGENCIA_BORRADOR_MS || datos.filas.length === 0) {
    if (datos !== null) borrarClave(clave);
    return null;
  }
  const valores = datos.filas.map((v) => Object.fromEntries(CLAVES_INGRESO.map((k) => [k, String(v?.[k] ?? '')])));
  return { tipo: datos.tipo, valores, guardadoEn: datos.guardadoEn };
};

// Filas de la grilla a partir del borrador (sin cargar), completadas con
// filas vacías hasta `minimo`.
export const filasDesdeBorrador = (valores, minimo) => {
  const filas = valores.map((v) => ({ ...crearFilaVacia(), valores: v }));
  while (filas.length < minimo) filas.push(crearFilaVacia());
  return filas;
};

export const borrarBorrador = (uid) => { if (uid) borrarClave(claveBorrador(uid)); };

// Al cerrar sesión: los de todos los usuarios de este navegador.
export const borrarTodosLosBorradoresCargaMasiva = () => {
  try {
    const claves = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIJO_BORRADOR)) claves.push(k);
    }
    claves.forEach(borrarClave);
  } catch { /* sin storage */ }
};
