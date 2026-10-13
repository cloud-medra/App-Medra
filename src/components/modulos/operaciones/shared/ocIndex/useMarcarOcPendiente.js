import { useEffect, useState } from 'react';
import { useToast } from '../../../../../context/ToastContext';
import { useModal } from '../../../../../context/ModalContext';
import { marcarOcPendienteEnRango, mesMasAntiguoIndiceOC } from './marcarOcPendiente';
import { moduloGestion } from '../modulosGestion';

const mesActual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Acción de una sola vez del menú de configuración (solo admin/dev): marca
// ocPendiente en las gestiones que no lo tienen. "Desde" se propone con el
// mes más antiguo del Excel de OC importado (1 lectura, solo al abrir el
// menú la primera vez).
// `modulo`: Implantes o Hemodinamia (sus gestiones, ver modulosGestion.js).
export const useMarcarOcPendiente = ({ habilitado, modulo = 'implantes' }) => {
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState(mesActual);
  const [marcando, setMarcando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [propuestaCargada, setPropuestaCargada] = useState(false);

  useEffect(() => {
    if (!habilitado || propuestaCargada) return;
    let vigente = true;
    mesMasAntiguoIndiceOC()
      .then((mes) => { if (vigente && mes) setDesde(d => d || mes); })
      .catch(err => console.warn('No se pudo leer ocImport/meta:', err))
      .finally(() => { if (vigente) setPropuestaCargada(true); });
    return () => { vigente = false; };
  }, [habilitado, propuestaCargada]);

  const ejecutar = async () => {
    setMarcando(true);
    setResultado(null);
    try {
      const r = await marcarOcPendienteEnRango({ desde, hasta, coleccion: moduloGestion(modulo).coleccionGestiones });
      setResultado(r);
      showToast(
        `Marcar OC pendiente: ${r.escriturasFirestore} gestión(es) actualizada(s) · ${r.lecturasFirestore} lectura(s), ${r.escriturasFirestore} escritura(s)${r.errores ? ` · ${r.errores} con error` : ''}`,
        r.errores ? 'error' : 'success'
      );
    } catch (err) {
      console.error('Error al marcar ocPendiente:', err);
      showToast('Error al marcar OC pendiente: ' + err.message, 'error');
    } finally {
      setMarcando(false);
    }
  };

  const handleMarcarOcPendiente = () => {
    if (marcando) return;
    if (!desde || !hasta) return showToast('Indica el rango de meses.', 'error');
    confirmAction(
      'Marcar OC pendiente',
      `Se leerán las gestiones de ${desde} a ${hasta} (1 lectura por gestión) y se escribirá ocPendiente solo en las que no lo tienen. ¿Continuar?`,
      ejecutar,
      { confirmText: 'Marcar' }
    );
  };

  return { desde, setDesde, hasta, setHasta, marcando, resultado, handleMarcarOcPendiente };
};
