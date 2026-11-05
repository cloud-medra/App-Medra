// Base de los módulos para usuarios externos: una forma común de consultar solo
// los datos de la empresa del usuario. La restricción real está en las reglas
// (leeDatoDeEmpresa en firestore.rules); Firestore rechaza una consulta de un
// externo que no traiga este filtro, por eso toda lectura de esos módulos va por aquí.
import { query, where } from 'firebase/firestore';
import { esExterno, empresaDeUsuario } from '../../functions/permisos/nucleo.mjs';

export const CAMPO_EMPRESA = 'empresaId';

// Condición de empresa para este usuario. Interno: ninguna (ve todas), salvo
// que elija una con `empresaId`. Externo: siempre la suya; si no tiene, error,
// en vez de una consulta sin filtro.
export const filtroEmpresa = (userData, { empresaId } = {}) => {
  if (esExterno(userData)) {
    const propia = empresaDeUsuario(userData);
    if (!propia) throw new Error('El usuario externo no tiene una empresa asignada.');
    return [where(CAMPO_EMPRESA, '==', propia)];
  }
  return empresaId ? [where(CAMPO_EMPRESA, '==', empresaId)] : [];
};

// consultaDeEmpresa(collection(db, 'externos_xxx'), userData, orderBy('fecha'))
export const consultaDeEmpresa = (coleccion, userData, ...restricciones) =>
  query(coleccion, ...filtroEmpresa(userData), ...restricciones);
