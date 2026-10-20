// Acceso a Storage de los PDF de admisiones de Implantes y Hemodinamia
// (pestaña Documentos y Carga masiva de documentos), cada módulo en su
// carpeta ({carpetaDocumentos}/{admisión}/documentos, ver modulosGestion.js). Sin Firestore: el listado sale
// de un listAll de la carpeta de la admisión (ver documentosHelpers.js).
// storage.rules solo permite "create" en esta ruta, así que el servidor
// rechaza cualquier intento de sobrescribir o borrar un PDF existente;
// eliminar va por la Cloud Function eliminarDocumentoAdmision.
import { ref, listAll, uploadBytesResumable, getBlob } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { storage, auth, functions } from '../../../../../firebaseConfig';
import { nombreDisponible, nombreParaStorage, tipoDesdeNombre, mensajeErrorStorage } from './documentosHelpers';
import { moduloGestion } from '../modulosGestion';

export const carpetaAdmision = (modulo, idAdmision) =>
  `${moduloGestion(modulo).carpetaDocumentos}/${String(idAdmision).trim().replace(/\//g, '_')}/documentos`;

const aDocumento = (itemRef) => ({
  nombre: itemRef.name,
  ruta: itemRef.fullPath,
  tipo: tipoDesdeNombre(itemRef.name)
});

export const listarDocumentosAdmision = async (modulo, idAdmision) => {
  const res = await listAll(ref(storage, carpetaAdmision(modulo, idAdmision)));
  return res.items.map(aDocumento);
};

const subirArchivo = (ruta, file, customMetadata, onProgreso) => new Promise((resolve, reject) => {
  const tarea = uploadBytesResumable(ref(storage, ruta), file, { contentType: 'application/pdf', customMetadata });
  tarea.on('state_changed',
    (snap) => onProgreso?.(snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0),
    reject,
    () => resolve(tarea.snapshot.ref)
  );
});

// Sube `nombre` (ya limpio, ver nombreParaStorage) con el primer sufijo libre
// según `nombresConocidos` (el listado en memoria + lo ya subido en esta
// misma tanda). Si Storage lo rechaza puede ser porque otra persona subió ese
// mismo nombre después de cargar el listado (la regla prohíbe sobrescribir)
// o por falta de permiso: se relista UNA vez para distinguirlo; si el
// nombre apareció, se reintenta con el siguiente sufijo.
export const subirDocumentoAdmision = async ({ modulo, idAdmision, nombre: nombreArchivo, file, nombresConocidos, onProgreso }) => {
  const carpeta = carpetaAdmision(modulo, idAdmision);
  const customMetadata = { nombreOriginal: file.name, subidoPor: auth.currentUser?.email || '' };
  let nombres = nombresConocidos;
  let nombre = nombreDisponible(nombreArchivo, nombres);

  try {
    const itemRef = await subirArchivo(`${carpeta}/${nombre}`, file, customMetadata, onProgreso);
    return { documento: aDocumento(itemRef), listaActualizada: null };
  } catch (err) {
    if (err?.code !== 'storage/unauthorized') throw err;
    const actual = await listarDocumentosAdmision(modulo, idAdmision);
    nombres = actual.map(d => d.nombre);
    if (!nombres.some(n => n.toLowerCase() === nombre.toLowerCase())) throw err;
    nombre = nombreDisponible(nombreArchivo, nombres);
    const itemRef = await subirArchivo(`${carpeta}/${nombre}`, file, customMetadata, onProgreso);
    return { documento: aDocumento(itemRef), listaActualizada: actual };
  }
};

// Sube una tanda de PDF (ya validados) a UNA admisión, de a uno, para que
// los sufijos "(2)" consideren también lo subido en la misma tanda.
// `listaInicial` es el listado de la carpeta que ya se tiene en memoria; se
// devuelve actualizado (sin volver a listar). Si un archivo falla por
// permiso (ya descartado el choque de nombre en subirDocumentoAdmision), el
// resto fallaría igual: se corta ahí y se marca `sinPermiso`.
// onProgreso(indiceArchivo, porcentajeDelArchivo)
export const subirTandaAdmision = async ({ modulo, idAdmision, archivos, listaInicial = [], onProgreso }) => {
  let lista = listaInicial;
  const subidos = [];
  const fallidos = [];
  let sinPermiso = false;

  for (let i = 0; i < archivos.length; i++) {
    const file = archivos[i];
    onProgreso?.(i, 0);
    try {
      const { documento, listaActualizada } = await subirDocumentoAdmision({
        modulo,
        idAdmision,
        nombre: nombreParaStorage(file.name),
        file,
        nombresConocidos: lista.map(d => d.nombre),
        onProgreso: (porcentaje) => onProgreso?.(i, porcentaje)
      });
      lista = [...(listaActualizada || lista).filter(d => d.ruta !== documento.ruta), documento];
      subidos.push({ nombreOriginal: file.name, ...documento });
    } catch (err) {
      console.error(`Error al subir documento de ${modulo}:`, err);
      const motivo = `${mensajeErrorStorage(err)} No se subió.`;
      fallidos.push({ nombre: file.name, motivo });
      if (err?.code === 'storage/unauthorized') {
        sinPermiso = true;
        archivos.slice(i + 1).forEach(f => fallidos.push({ nombre: f.name, motivo }));
        break;
      }
    }
  }

  return { lista, subidos, fallidos, sinPermiso };
};

export const obtenerBlobDocumento = (ruta) => getBlob(ref(storage, ruta));

// Envía el PDF a la papelera de Storage ({carpeta}/{admisión}/eliminados)
// y deja auditoría en {modulo}_documentos_eliminados (functions/
// documentosAdmision). La función valida el permiso btn_eliminar_documento.
// Devuelve { resultado: 'eliminado' | 'inexistente', rutaPapelera? }.
export const eliminarDocumentoAdmision = async ({ modulo, idAdmision, ruta }) =>
  (await httpsCallable(functions, 'eliminarDocumentoAdmision')({ modulo, idAdmision, ruta })).data;
