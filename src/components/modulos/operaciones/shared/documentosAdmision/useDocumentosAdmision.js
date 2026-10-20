import { useCallback, useEffect, useRef, useState } from 'react';
import { listarDocumentosAdmision } from './documentosStorage';

// Listado de Storage de la pestaña Documentos del detalle de una gestión
// (Implantes y Hemodinamia). Vive en el detalle (no en DocumentosTab, que se
// desmonta al cambiar de pestaña): se pide una sola vez por admisión
// mientras el panel esté abierto. `solicitadoRef` evita un segundo listAll si
// se sale y se vuelve a la pestaña (antes o después de que termine el
// primero, y también si falló: en ese caso solo "Reintentar" vuelve a listar).
// Devuelve las props `documentos`, `onRecargar`, `onDocumentosSubidos` y
// `onDocumentoEliminado` de DocumentosTab.
export const useDocumentosAdmision = (modulo, idAdmision, activo) => {
  const [documentosAdmision, setDocumentosAdmision] = useState(null);
  const solicitadoRef = useRef(null);

  const cargar = useCallback((id) => {
    solicitadoRef.current = id;
    listarDocumentosAdmision(modulo, id)
      .then(lista => {
        if (solicitadoRef.current === id) setDocumentosAdmision({ idAdmision: id, lista, error: null });
      })
      .catch(err => {
        console.error(`Error al listar documentos de ${modulo}:`, err);
        if (solicitadoRef.current !== id) return;
        setDocumentosAdmision({ idAdmision: id, lista: [], error: 'No se pudo cargar el listado de documentos.' });
      });
  }, [modulo]);

  useEffect(() => {
    if (!activo || !idAdmision || solicitadoRef.current === idAdmision) return;
    cargar(idAdmision);
  }, [activo, idAdmision, cargar]);

  const onRecargar = () => {
    setDocumentosAdmision(null);
    cargar(idAdmision);
  };

  // Al terminar una tanda de subida, DocumentosTab entrega el listado ya
  // armado en memoria (lo previo + lo subido): una sola actualización, sin
  // volver a listar Storage.
  const onDocumentosSubidos = (lista) => {
    setDocumentosAdmision({ idAdmision, lista, error: null });
  };

  // Al eliminar un PDF se quita del listado en memoria (los contadores del
  // encabezado y de cada categoría salen de esta lista), sin volver a listar.
  const onDocumentoEliminado = (ruta) => {
    setDocumentosAdmision((prev) => (prev?.idAdmision === idAdmision
      ? { ...prev, lista: prev.lista.filter((d) => d.ruta !== ruta) }
      : prev));
  };

  const actual = documentosAdmision?.idAdmision === idAdmision;
  return {
    documentos: {
      lista: actual ? documentosAdmision.lista : [],
      cargando: Boolean(idAdmision) && !actual,
      error: actual ? documentosAdmision.error : null,
    },
    onRecargar,
    onDocumentosSubidos,
    onDocumentoEliminado,
  };
};
