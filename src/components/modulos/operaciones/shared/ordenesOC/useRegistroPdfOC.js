import { useCallback, useEffect, useRef, useState } from 'react';
import { leerRegistroPdfOC } from './registroPdfOC';

// Registro de PDF de OC (ordenesOC/registroPdf) para la pestaña Orden del
// detalle de una gestión (Implantes y Hemodinamia): 1 lectura, solo la
// primera vez que se abre la pestaña (`activo`). Las subidas lo actualizan en
// memoria. Devuelve las props registroPdf / onRecargarRegistroPdf /
// onPdfRegistrado de OrdenTab.
export const useRegistroPdfOC = (activo) => {
  const [registroPdf, setRegistroPdf] = useState(null); // { pdfs, error }
  const solicitadoRef = useRef(false);

  const cargar = useCallback(() => {
    solicitadoRef.current = true;
    leerRegistroPdfOC()
      .then(pdfs => setRegistroPdf({ pdfs, error: null }))
      .catch(err => {
        console.error('Error al leer el registro de PDF de OC:', err);
        setRegistroPdf({ pdfs: {}, error: 'No se pudo cargar qué OC tienen PDF.' });
      });
  }, []);

  useEffect(() => {
    if (!activo || solicitadoRef.current) return;
    cargar();
  }, [activo, cargar]);

  return {
    registroPdf,
    onRecargarRegistroPdf: () => { setRegistroPdf(null); cargar(); },
    onPdfRegistrado: (oc, entrada) => setRegistroPdf(prev => ({ error: null, pdfs: { ...(prev?.pdfs || {}), [oc]: entrada } })),
  };
};
