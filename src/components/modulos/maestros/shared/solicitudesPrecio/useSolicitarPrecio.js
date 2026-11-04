import { useCallback, useRef } from 'react';
import { useToast } from '../../../../../context/ToastContext';
import { useUser } from '../../../../../context/UserContext';
import { agregarSolicitudPrecio } from './accionesSolicitudesPrecio';
import { mensajeSolicitudAgregada } from './solicitudesPrecio';

// Botón "Solicitar actualización de precio" de Cargas: agrega la referencia a
// la lista de Maestro Códigos y avisa. No toca la fila de la carga.
// `modulo`: etiqueta de MODULO_SOLICITUD.
export const useSolicitarPrecio = (modulo) => {
  const { showToast } = useToast();
  const { userData } = useUser();
  // Evita dos escrituras por doble clic en la misma referencia.
  const enCurso = useRef(new Set());

  return useCallback(async (solicitud) => {
    const clave = solicitud.referencia.toLowerCase();
    if (enCurso.current.has(clave)) return;
    enCurso.current.add(clave);
    try {
      const { precioAnterior } = await agregarSolicitudPrecio({ solicitud, modulo, userData });
      const { mensaje, tipo } = mensajeSolicitudAgregada({ precioAnterior, nueva: solicitud });
      // El aviso de precio cambiado es más largo: queda más tiempo a la vista.
      showToast(mensaje, tipo, precioAnterior ? 8000 : undefined);
    } catch (error) {
      console.error('Error al agregar a la solicitud de precios:', error);
      showToast('No se pudo añadir a la solicitud de actualización de precios.', 'error');
    } finally {
      enCurso.current.delete(clave);
    }
  }, [modulo, userData, showToast]);
};
