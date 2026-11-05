import { signOut } from 'firebase/auth';
import { auth, limpiarCacheAlCerrarSesion } from '../firebaseConfig';
import { borrarTodosLosBorradoresCargaMasiva } from '../components/modulos/operaciones/consignacion/cargaMasivaConsignacion/utils/borradorCargaMasiva';
import { omitirSincronizacionEnProximaCarga } from '../services/sessionSync';

// Cierre de sesión completo (plataforma interna y de externos).
export const cerrarSesion = async () => {
  // Borradores de Carga Masiva de Consignación (localStorage): traen
  // nombres de pacientes.
  borrarTodosLosBorradoresCargaMasiva();
  // Primero se cierra Firestore y se borra su caché local (IndexedDB),
  // para que el próximo usuario no vea datos de esta cuenta.
  await limpiarCacheAlCerrarSesion();
  await signOut(auth);
  sessionStorage.clear();
  // Recarga completa: descarta también los catálogos y cachés en memoria
  // de los módulos (y reinicializa Firestore desde cero).
  omitirSincronizacionEnProximaCarga();
  window.location.replace('/');
};
