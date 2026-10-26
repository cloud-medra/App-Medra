import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { construirCambiosRegistro } from '../codigosMaestros/components/tabVistaGeneral/camposAuditablesRegistro';
import { COL_CODIGOS, MODOS_PANEL, camposModificados, valoresParaCrear } from './camposCodigo';

// Escrituras de la vista nueva de Códigos. Mismas colecciones, mismos logs
// (subcolección `logs`, mismas acciones) que la vista clásica. Las ediciones
// escriben SOLO los campos que cambiaron. No hay lecturas: la tabla se
// actualiza sola por el listener compartido de catalogosStore.

const nombreUsuario = (userData) => userData?.nombreCompleto || 'Usuario';

// `tieneCodigo` es una marca interna: no se muestra en el historial.
const sinMarca = ({ tieneCodigo, ...resto }) => resto;

export const registrarLogCodigo = async (id, accion, detalles, userData) => {
  try {
    await addDoc(collection(db, COL_CODIGOS, id, 'logs'), {
      accion,
      detalles,
      usuario: userData?.nombreCompleto || 'Usuario Desconocido',
      usuarioEmail: userData?.email || '',
      fecha: new Date(),
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error('Error al registrar log de auditoría:', err);
  }
};

// Única lectura de la vista: el historial, solo cuando el usuario lo abre
// (igual que la vista clásica).
export const cargarLogsCodigo = async (id) => {
  const snap = await getDocs(query(collection(db, COL_CODIGOS, id, 'logs'), orderBy('fecha', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/**
 * Guarda el formulario del panel según su modo.
 * Devuelve { guardado: boolean, sinCambios?: boolean }.
 */
export const guardarRegistroCodigo = async ({ modo, registro, inicial, form, userData }) => {
  const config = MODOS_PANEL[modo];

  if (config.crear) {
    const valores = valoresParaCrear(form, modo);
    const data = {
      ...valores,
      ...(modo === 'nuevoPendiente' ? { codigo: '' } : { tieneCodigo: true }),
      fechaRegistro: serverTimestamp(),
      registradoPor: nombreUsuario(userData)
    };
    const ref = await addDoc(collection(db, COL_CODIGOS), data);
    await registrarLogCodigo(ref.id, 'CREACION', { ...valores, metodoRegistro: 'MANUAL' }, userData);
    return { guardado: true };
  }

  const cambios = camposModificados(inicial, form, registro);
  const motivo = String(form.motivo || '').trim();
  const ref = doc(db, COL_CODIGOS, registro.id);

  // El código define en qué pestaña aparece el registro.
  if ('codigo' in cambios) cambios.tieneCodigo = cambios.codigo !== '';

  if (modo === 'asignarCodigo') {
    const codigo = cambios.codigo ?? String(registro.codigo || '').toUpperCase();
    await updateDoc(ref, {
      ...cambios,
      tieneCodigo: true,
      fechaAsignacionCodigo: serverTimestamp(),
      asignadoPor: nombreUsuario(userData)
    });
    await registrarLogCodigo(registro.id, 'ASIGNACION_CODIGO', { ...sinMarca(cambios), codigoAsignado: codigo }, userData);
    return { guardado: true };
  }

  if (Object.keys(cambios).length === 0 && !motivo) return { guardado: false, sinCambios: true };

  if (modo === 'modificarRegistro') {
    if (Object.keys(cambios).length > 0) {
      await updateDoc(ref, { ...cambios, modificadoPor: nombreUsuario(userData) });
    }
    await registrarLogCodigo(registro.id, 'ACTUALIZACION_REGISTRO', {
      ...construirCambiosRegistro(registro, { ...registro, ...cambios }),
      ...(motivo ? { observacionModificacion: motivo } : {})
    }, userData);
    return { guardado: true };
  }

  // editarConCodigo
  await updateDoc(ref, cambios);
  await registrarLogCodigo(registro.id, 'EDICION', sinMarca(cambios), userData);
  return { guardado: true };
};

export const eliminarRegistroCodigo = async (registro, userData) => {
  await registrarLogCodigo(registro.id, 'ELIMINACION', {
    codigo: registro.codigo || '',
    referencia: registro.referencia || '',
    empresa: registro.empresa || '',
    precioNeto: registro.precioNeto || 0
  }, userData);
  await deleteDoc(doc(db, COL_CODIGOS, registro.id));
};
