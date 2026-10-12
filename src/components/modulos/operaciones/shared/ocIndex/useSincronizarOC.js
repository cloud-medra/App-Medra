import { useState } from 'react';
import { useToast } from '../../../../../context/ToastContext';
import { useModal } from '../../../../../context/ModalContext';
import { useUser } from '../../../../../context/UserContext';
import { prepararSincronizacionOC, ejecutarSincronizacionOC, ejecutarSincronizacionOCConsignacion } from './sincronizarOC';

const MODULOS = {
  implantes: { ejecutar: ejecutarSincronizacionOC, indice: 'ocPendiente + fecha', unidad: 'gestión(es)', avisarSinNovedades: true },
  // Consignación no registra la versión sincronizada (ver sincronizarOC.js):
  // el aviso "sin importaciones nuevas" no aplica.
  consignacion: { ejecutar: ejecutarSincronizacionOCConsignacion, indice: 'orden + fecha', unidad: 'registro(s)', avisarSinNovedades: false }
};

// Botón "Sincronizar OC" de Gestión de Implantes (los cambios llegan a la
// tabla por el listener que ya existe) y de Cargas de Consignación
// (onSincronizado recarga su lista).
export const useSincronizarOC = ({ modulo = 'implantes', onSincronizado } = {}) => {
  const config = MODULOS[modulo];
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { userData } = useUser();
  const [sincronizandoOC, setSincronizandoOC] = useState(false);
  const [resumenOC, setResumenOC] = useState(null);

  const ejecutar = async (preparado) => {
    setSincronizandoOC(true);
    try {
      const resultado = await config.ejecutar(preparado, { userData });
      setResumenOC(resultado);
      const { itemsActualizados, erroresEscritura } = resultado;
      showToast(
        `Sincronizar OC: ${itemsActualizados} ítem(s) con OC asignada${erroresEscritura.length ? `, ${erroresEscritura.length} ${config.unidad} no se pudieron guardar` : ''}`,
        erroresEscritura.length ? 'error' : 'success'
      );
      if (itemsActualizados > 0) onSincronizado?.();
    } catch (err) {
      console.error('Error al sincronizar OC:', err);
      // Índice compuesto aún no desplegado: Firestore lo dice con este código.
      const mensaje = err?.code === 'failed-precondition'
        ? `Falta desplegar el índice de Firestore (${config.indice}). Revisa firestore.indexes.json.`
        : err.message;
      showToast('Error al sincronizar OC: ' + mensaje, 'error');
    } finally {
      setSincronizandoOC(false);
    }
  };

  const handleSincronizarOC = async () => {
    if (sincronizandoOC) return;
    setSincronizandoOC(true);
    let preparado;
    try {
      preparado = await prepararSincronizacionOC();
    } catch (err) {
      console.error('Error al preparar Sincronizar OC:', err);
      showToast(err.message, 'error');
      setSincronizandoOC(false);
      return;
    }
    setSincronizandoOC(false);

    if (config.avisarSinNovedades && preparado.sinNovedades) {
      confirmAction(
        'Sin importaciones nuevas',
        'No se ha importado un Excel de OC desde la última sincronización. Solo se asignarían OC a gestiones o ítems agregados después. ¿Sincronizar de todos modos?',
        () => ejecutar(preparado),
        { confirmText: 'Sincronizar' }
      );
      return;
    }
    await ejecutar(preparado);
  };

  return { sincronizandoOC, handleSincronizarOC, resumenOC, cerrarResumenOC: () => setResumenOC(null) };
};
