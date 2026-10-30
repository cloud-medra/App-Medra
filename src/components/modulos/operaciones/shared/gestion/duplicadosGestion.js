import { createElement } from 'react';
import { collectionGroup, documentId, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';
import { moduloGestion, rangoGestiones } from '../modulosGestion';
import MensajeDuplicado from './MensajeDuplicado';

// Alerta de gestión duplicada al registrar (formulario de Gestiones de
// Implantes y de Hemodinamia). Avisa, no bloquea: el usuario puede
// "Registrar de todas formas". Es una gestión duplicada si otra (no ella
// misma) coincide en:
//   - nombre + fecha + empresa, las tres a la vez; o
//   - el ID, si se ingresó uno.
// Cada documento de `detalles` es UNA empresa + fecha de una admisión, así
// que comparar contra los documentos cubre todas las empresas/fechas de una
// gestión.
//
// Lecturas por revisión (sin índices nuevos: usan los de collection group
// de `fecha` y `gestionId` que ya existen, con el rango de documentId() del
// módulo):
//   - las gestiones de ese día (`fecha ==`): pocas por día; el nombre y la
//     empresa se comparan aquí (Firestore no compara sin tildes);
//   - el ID: `gestionId in [variantes]`, limit(1) (2 al editar, para poder
//     descartarse a sí misma).
// Si la revisión falla o tarda (sin conexión), se deja registrar.

export const ESPERA_MAXIMA_MS = 5000;

// Mayúsculas, sin tildes ni espacios al inicio/fin, espacios dobles a uno.
export const normalizarTexto = (valor) => String(valor ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().trim().replace(/\s+/g, ' ');

// ID / RUT sin puntos, guiones ni espacios.
export const normalizarId = (valor) => String(valor ?? '').replace(/[.\-\s]/g, '').toUpperCase();

// 'P' y vacío son "pendiente" en las gestiones: no identifican a nadie.
const esPendiente = (valor) => { const t = normalizarTexto(valor); return !t || t === 'P'; };

export const idReal = (valor) => {
  const n = normalizarId(valor);
  return n && n !== 'P' && n !== 'SIN_ADMISION' ? n : null;
};

const idDe = (gestion) => idReal(gestion?.gestionId || gestion?.agendaId);

// Formas en que el mismo ID puede estar guardado (Firestore compara exacto):
// tal cual, sin puntos ni guiones, como número y como RUT con y sin puntos.
export const variantesId = (valor) => {
  const n = idReal(valor);
  if (!n) return [];
  const variantes = new Set([String(valor).trim(), n]);
  if (/^\d+$/.test(n) && Number.isSafeInteger(Number(n))) variantes.add(Number(n));
  if (n.length >= 2) {
    const cuerpo = n.slice(0, -1);
    const dv = n.slice(-1);
    for (const d of new Set([dv, dv.toLowerCase()])) {
      variantes.add(`${cuerpo}-${d}`);
      if (/^\d+$/.test(cuerpo)) variantes.add(`${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${d}`);
    }
  }
  return [...variantes];
};

export const coincideNombreFechaEmpresa = (a, b) =>
  !esPendiente(a.nombre) && !esPendiente(a.empresa) && Boolean(a.fecha) && a.fecha === b.fecha
  && normalizarTexto(a.nombre) === normalizarTexto(b.nombre)
  && normalizarTexto(a.empresa) === normalizarTexto(b.empresa);

export const coincideId = (a, b) => { const id = idDe(a); return Boolean(id) && id === idDe(b); };

// { motivo: 'datos' | 'id', existente } o null. `excluirRefPath`: la gestión
// que se está editando (no se compara consigo misma).
export const buscarDuplicado = (nueva, existentes, { excluirRefPath } = {}) => {
  const otras = existentes.filter((e) => !excluirRefPath || e.refPath !== excluirRefPath);
  const porDatos = otras.find((e) => coincideNombreFechaEmpresa(nueva, e));
  if (porDatos) return { motivo: 'datos', existente: porDatos };
  const porId = otras.find((e) => coincideId(nueva, e));
  return porId ? { motivo: 'id', existente: porId } : null;
};

// Al editar solo se revisa si cambió algo de lo que identifica a la
// gestión (una edición de, p. ej., la observación no crea un duplicado).
export const cambiaIdentidad = (original, nueva) => !original
  || ['nombre', 'fecha', 'empresa'].some((k) => normalizarTexto(original[k]) !== normalizarTexto(nueva[k]))
  || idDe(original) !== idDe(nueva);

const conEspera = (promesa, ms) => {
  let id;
  const tiempo = new Promise((_, reject) => { id = setTimeout(() => reject(new Error('tiempo agotado')), ms); });
  return Promise.race([promesa, tiempo]).finally(() => clearTimeout(id));
};

// Revisa en Firestore (ver arriba). Devuelve el duplicado o null (también
// si no se pudo revisar).
export const revisarDuplicadoGestion = async (modulo, nueva, { excluirRefPath, esperaMs = ESPERA_MAXIMA_MS } = {}) => {
  const { min, max } = rangoGestiones(moduloGestion(modulo));
  const enModulo = (...filtros) => query(
    collectionGroup(db, 'detalles'), ...filtros, where(documentId(), '>=', min), where(documentId(), '<', max)
  );
  const consultas = [];
  if (nueva.fecha && !esPendiente(nueva.nombre) && !esPendiente(nueva.empresa)) {
    consultas.push(enModulo(where('fecha', '==', nueva.fecha)));
  }
  const variantes = variantesId(nueva.gestionId || nueva.agendaId);
  if (variantes.length) consultas.push(enModulo(where('gestionId', 'in', variantes), limit(excluirRefPath ? 2 : 1)));
  if (consultas.length === 0) return null;
  try {
    const snaps = await conEspera(Promise.all(consultas.map((q) => getDocs(q))), esperaMs);
    const existentes = snaps.flatMap((snap) => snap.docs.map((d) => ({ ...d.data(), refPath: d.ref.path })));
    return buscarDuplicado(nueva, existentes, { excluirRefPath });
  } catch (error) {
    console.warn('No se pudo revisar si la gestión está duplicada; se registra igual.', error);
    return null;
  }
};

// Alerta con los datos del registro que ya existe. Resuelve true si el
// usuario elige "Registrar de todas formas".
export const confirmarRegistroDuplicado = (confirmAction, duplicado) => new Promise((resolve) => {
  confirmAction(
    'Posible gestión duplicada',
    createElement(MensajeDuplicado, { duplicado }),
    () => resolve(true),
    { type: 'warning', confirmText: 'Registrar de todas formas', cancelText: 'Cancelar', onCancel: () => resolve(false) }
  );
});
